import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/store/query";
import { RootNavigator } from "@/navigation/RootNavigator";
import { CallProvider } from "@/realtime/CallProvider";
import { SpaceAudioProvider } from "@/realtime/SpaceAudioProvider";
import { useAuthStore } from "@/store/auth.store";
import { usePrefsStore } from "@/store/prefs.store";
import { useA11yStore } from "@/store/a11y.store";
import { useSpamStore } from "@/store/spam.store";
import { useOnboardingStore } from "@/store/onboarding.store";
import { activityTracker } from "@/services/activity-tracker";
import { ScreenTimeGate } from "@/components/screen-time/ScreenTimeGate";
import { configurePushHandler, attachPushTapHandler, registerForPush } from "@/services/push";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installGlobalHandler } from "@/services/diagnostics";
import { initSentry, tagPlatform, breadcrumb } from "@/services/sentry";

/*
 * Keep the native splash up until the branded <Splash> has painted.
 *
 * By default it hides the moment the RN root view mounts, which happens before
 * that component's first frame - so a release build showed a flash of bare
 * white in between. Held here and released in src/components/Splash.tsx, with
 * the failsafe in App() below covering the case where that never mounts.
 *
 * Module scope on purpose: this has to run before the first render, and a
 * useEffect is already too late. Rejections are ignored - it throws when the
 * splash is already hidden, which is normal on a warm start.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});

/*
 * Record fatal JS errors before the process goes.
 *
 * Module scope, next to the splash call above, for the same reason: an error
 * thrown while the module graph is still evaluating happens long before any
 * useEffect could install this. The handler delegates to React Native's own
 * afterwards, so crash BEHAVIOUR is unchanged - what changes is that the error
 * is written down first, instead of the app dying with nothing to show for it.
 */
installGlobalHandler();

/*
 * Sentry, at module scope and BEFORE the handler above would report anything.
 *
 * An error thrown while the module graph is still evaluating happens long
 * before any useEffect could start this, and those are exactly the crashes
 * hardest to diagnose from a TestFlight report. Both are no-ops in Expo Go and
 * when no DSN is configured.
 */
initSentry();
tagPlatform();
breadcrumb("app", "App opened");

/** Player + accessibility prefs: local snapshot instantly at boot, server copy once signed in. */
function PrefsBootstrap() {
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  useEffect(() => {
    void usePrefsStore.getState().hydrate();
    void useA11yStore.getState().hydrate();
    void useSpamStore.getState().hydrate();
    void useOnboardingStore.getState().hydrate();
  }, []);
  useEffect(() => {
    if (isAuthed) {
      void usePrefsStore.getState().sync();
      void useA11yStore.getState().sync();
    }
  }, [isAuthed]);
  return null;
}

/**
 * Push: foreground presentation, tap routing, and device registration.
 *
 * Registration is tied to the session - a token is only useful once the server
 * knows whose device it is, and it must be re-sent after an account switch so
 * the previous owner stops receiving this handset's notifications.
 */
function PushBootstrap() {
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  // Switching accounts never leaves `authenticated`, so keying the effect on
  // that alone meant it did not re-run and the device was never re-registered:
  // account B's handset kept receiving account A's notifications, because the
  // server still had the token filed under A. loginCount is bumped by signIn,
  // switchAccount AND signOut, so it changes on every session change - which is
  // exactly when a token needs re-filing.
  const loginCount = useAuthStore((s) => s.loginCount);
  useEffect(() => {
    configurePushHandler();
    return attachPushTapHandler();
  }, []);
  useEffect(() => {
    if (isAuthed) void registerForPush();
  }, [isAuthed, loginCount]);
  return null;
}

/** Starts the in-app activity tracker (Screen Time) for the whole app lifetime. */
function ScreenTimeBootstrap() {
  useEffect(() => {
    activityTracker.start();
    return () => activityTracker.stop();
  }, []);
  return null;
}

export default function App() {
  // Failsafe for the native splash held open above. <Splash> hides it as soon
  // as it paints, which is the normal path; this only matters if that component
  // never mounts at all - a render crash before RootNavigator, say - where
  // otherwise the native splash would sit on screen forever with no way out but
  // force-quitting. Hiding reveals whatever did render, including an error, and
  // is always better than an app that looks hung.
  //
  // Long enough that it never races the real handoff on a slow cold start.
  useEffect(() => {
    const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 10000);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Outermost boundary: a throw in a provider or bootstrap component would
          otherwise terminate a release build outright. */}
      <ErrorBoundary scope="app">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <PrefsBootstrap />
          <ScreenTimeBootstrap />
          <PushBootstrap />
          {/* Any touch/scroll keeps Screen Time's active-usage timer alive (resets
              the 60s idle timeout) without intercepting the gesture. */}
          <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => { activityTracker.poke(); return false; }}>
            {/* Connects the chat-server socket while signed in so audio calls can
                ring anywhere in the app; renders the incoming/active call screen. */}
            <CallProvider>
              {/* A live Space's audio outlives the room screen (minimising must
                  not hang up), so its provider sits above the navigator rather
                  than inside it. It has to be ABOVE RootNavigator specifically:
                  SpaceRoom is a root-level screen, a sibling of MainTabs, so a
                  provider mounted inside the tabs is not an ancestor of the room
                  and useSpaceAudioContext throws the moment you join. */}
              <SpaceAudioProvider>
                {/* A second boundary around the screens alone, so a crash in
                    one screen does not tear down CallProvider and
                    SpaceAudioProvider with it - an active call or a live Space
                    survives, and "Try again" returns to a working app rather
                    than a dead one. */}
                <ErrorBoundary scope="navigator">
                  <RootNavigator />
                </ErrorBoundary>
              </SpaceAudioProvider>
            </CallProvider>
          </View>
          {/* Screen-time break popup + daily-limit lock, over the whole app. */}
          <ScreenTimeGate />
        </QueryClientProvider>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
