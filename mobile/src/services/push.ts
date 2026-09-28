import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { api } from "@/api/client";
import { inboxApi } from "@/api/inbox.api";
import { queryClient } from "@/store/query";
import { registerSignOutHook } from "@/store/session";
import { navigateToDeepLink } from "@/navigation/deep-links";

/**
 * OS push: permission, token registration, and routing a tapped notification.
 *
 * ── Native tokens, not Expo's relay ─────────────────────────────────────────
 * This registers the raw FCM / APNs device token (`getDevicePushTokenAsync`)
 * rather than an Expo push token. The backend talks to FCM and APNs directly
 * (App\Services\PushService), so relaying through Expo's servers would add a
 * third-party hop, a second failure mode, and an EAS projectId requirement for
 * nothing. The tradeoff is that the token is platform-specific - which is why
 * `platform` is sent alongside it and the server fans out per transport.
 *
 * ── Expo Go ─────────────────────────────────────────────────────────────────
 * Expo Go cannot receive push for another app's credentials, and since SDK 53
 * `getDevicePushTokenAsync` throws there. Every entry point below no-ops in Expo
 * Go so the dev client keeps working; push needs a real build.
 *
 * Everything a tap does goes through `navigateToDeepLink`, the same router that
 * handles shared URLs and in-app notification rows.
 */

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Lazily required so Expo Go never even loads the native module. */
function loadNotifications() {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as typeof import("expo-notifications");
  } catch {
    return null;
  }
}

/** Foreground presentation. Without this a push arriving while the app is open
 *  is delivered silently and the user never sees it. */
export function configurePushHandler(): void {
  const N = loadNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Ask for permission and register this device with the backend.
 *
 * Safe to call on every launch and after every login: tokens rotate, and the
 * server upserts on (user, token) rather than duplicating.
 */
export async function registerForPush(): Promise<void> {
  const N = loadNotifications();
  if (!N) return;

  try {
    const existing = await N.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await N.requestPermissionsAsync()).granted;
    }
    if (!granted) return;

    // Android needs a channel before anything is shown; without one,
    // notifications are delivered but silently dropped from the shade.
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("default", {
        name: "Default",
        importance: N.AndroidImportance.HIGH,
      });
    }

    const token = await N.getDevicePushTokenAsync();
    if (!token?.data) return;

    await api.post("/devices", {
      device_token: String(token.data),
      platform: Platform.OS === "ios" ? "ios" : "android",
    });
  } catch {
    // Push is an enhancement. A device that cannot register still runs the app,
    // and the in-app notification feed is unaffected.
  }
}

/**
 * Detach this handset from the account signing out.
 *
 * Registration alone was not enough to keep this correct. The server drops a
 * token from every OTHER user when it is registered, so switching accounts
 * heals itself - but signing out registers nothing, so the row simply stayed
 * and the phone carried on receiving that account's notifications while nobody
 * was signed in.
 *
 * `authToken` is passed in by the sign-out hook rather than read from storage:
 * this runs while the store is tearing the session down, and awaiting the OS
 * for a device token takes long enough that by the time the request is built
 * the stored one is already gone. Setting the header explicitly makes the call
 * deterministic instead of racing that teardown. (The client's interceptor only
 * overwrites Authorization when it finds a token of its own, so an explicit one
 * survives.)
 */
export async function unregisterForPush(authToken: string | null): Promise<void> {
  const N = loadNotifications();
  if (!N || !authToken) return;

  try {
    // No permission prompt here - getDevicePushTokenAsync only returns a token
    // if one was already issued, and asking on the way out would be absurd.
    const existing = await N.getPermissionsAsync();
    if (!existing.granted) return;

    const token = await N.getDevicePushTokenAsync();
    if (!token?.data) return;

    await api.post(
      "/devices/unregister",
      { device_token: String(token.data) },
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
  } catch {
    // Best effort. The server self-heals anyway: the next account to register
    // this token takes it, and APNs/FCM prune it once the app is uninstalled.
  }
}

/* Runs on the way out of a session, while the token is still valid. Registered
 * at module load - App.tsx imports this module for PushBootstrap, so loading it
 * is what opts the app in. */
registerSignOutHook((token) => {
  void unregisterForPush(token);
});

/** Pull the deep link out of whatever shape the payload arrived in. */
function linkFrom(response: unknown): string | null {
  const data = payloadData(response);
  const link = data?.deep_link ?? data?.url;
  return typeof link === "string" && link.length > 0 ? link : null;
}

/** The push's data bag, from whatever shape the response arrived in. */
function payloadData(response: unknown): Record<string, unknown> | null {
  return (
    (response as { notification?: { request?: { content?: { data?: Record<string, unknown> } } } })
      ?.notification?.request?.content?.data ?? null
  );
}

/**
 * Reading a tapped push IS reading the notification.
 *
 * The payload carries `notification_id` (PushService), but nothing used to act
 * on it - so tapping an OS push left the row unread in-app and kept it in the
 * badge count until the next poll. Fire-and-forget: navigation must never wait
 * on the write, and a failed write just leaves the row for the next poll.
 */
function markPushRead(response: unknown): void {
  const raw = payloadData(response)?.notification_id;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return;
  void inboxApi.markNotificationRead(id).catch(() => {});
  void queryClient.invalidateQueries({ queryKey: ["notificationsUnreadBadge"] });
  void queryClient.invalidateQueries({ queryKey: ["inbox-notifications"] });
  void queryClient.invalidateQueries({ queryKey: ["inboxNotifPopupList"] });
}

/**
 * Handle taps in all three states.
 *
 * - COLD START: the tap launched the process, so there is no listener yet -
 *   `getLastNotificationResponseAsync` replays it once navigation is ready.
 * - BACKGROUND / FOREGROUND: the subscription fires live.
 *
 * Returns an unsubscribe function.
 */
export function attachPushTapHandler(): () => void {
  const N = loadNotifications();
  if (!N) return () => {};

  // Cold start. Deliberately not awaited by the caller - navigation may not be
  // mounted for another frame or two, and navigateToDeepLink no-ops until the
  // ref is ready, so this retries briefly rather than dropping the tap.
  //
  // The budget has to outlast the branded Splash, which RootNavigator holds for
  // a deliberate minimum of 3s BEFORE the NavigationContainer mounts - the old
  // ~2s budget gave up while the splash was still up and dropped every
  // cold-start tap. 100 tries x 150ms ≈ 15s covers slow cold starts too.
  void N.getLastNotificationResponseAsync().then((response) => {
    markPushRead(response);
    const link = linkFrom(response);
    if (!link) return;
    let tries = 0;
    const attempt = () => {
      if (navigateToDeepLink(link) || ++tries > 100) return;
      setTimeout(attempt, 150);
    };
    attempt();
  });

  const sub = N.addNotificationResponseReceivedListener((response) => {
    markPushRead(response);
    const link = linkFrom(response);
    if (link) navigateToDeepLink(link);
  });

  return () => sub.remove();
}
