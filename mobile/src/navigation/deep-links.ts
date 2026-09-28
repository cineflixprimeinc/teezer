import { CommonActions } from "@react-navigation/native";
import { navigationRef } from "./ref";
import { usePostViewer } from "@/store/post-viewer.store";
import type { RootStackParamList } from "./types";

/**
 * The one place a URL becomes a destination.
 *
 * Every way a link can arrive - a shared https://reelsoo.com/... link, a tapped
 * push notification, a row in the in-app notification list - goes through this
 * module. No screen parses a URL, and no caller decides where a notification
 * leads; they hand over a path and get back a target.
 *
 * The grammar is authored by the server (App\Services\DeepLinkService) and is
 * identical on the website, so one string works whether or not the app is
 * installed:
 *
 *   /video/{id}      /profile/{username}   /live/{id}
 *   /tag/{hashtag}   /comment/{id}         /notification/{id}
 *
 * ── Why targets carry a `fallback` ───────────────────────────────────────────
 * Several destinations have no screen yet: the video player, hashtag, live and
 * comment surfaces were removed when the app was rebuilt (see the note at the
 * top of RootNavigator). A link to one of those must still do something sane
 * rather than opening a blank stack or throwing, so each declares where it
 * lands until its screen exists.
 *
 * Adding the screen later is a ONE-LINE change - swap `fallback` for `screen`
 * on that row. Nothing else in the app needs to know.
 */

type RootRoute = keyof RootStackParamList;

/** A resolved destination. `pending` means the real screen does not exist yet. */
export type DeepLinkTarget = {
  /** "ready" - this is the intended screen. "pending" - this is a stand-in. */
  status: "ready" | "pending";
  screen: RootRoute;
  params?: Record<string, unknown>;
  /** Human-readable description of what was asked for. Logged on "pending". */
  intended: string;
  /** Path this collapses to for React Navigation's own state builder. */
  navPath: string;
  /**
   * Run after the navigation half. For destinations that are LAYERS rather than
   * routes - the post viewer sits above the navigator and cannot be named as a
   * screen - this is what actually raises them. Both entry points call it, so a
   * link behaves the same on a cold start and on a tapped notification.
   */
  open?: () => void;
};

type Rule = {
  pattern: RegExp;
  resolve: (m: RegExpMatchArray) => DeepLinkTarget | null;
};

/** Everything lands somewhere; the feed is the app's floor. */
const HOME: Pick<DeepLinkTarget, "screen" | "params" | "navPath"> = {
  screen: "Main",
  params: { screen: "Home" },
  navPath: "/",
};

/**
 * The route table. Order matters only in that the first match wins; the
 * patterns are disjoint by design.
 */
const RULES: Rule[] = [
  {
    // ✅ real screen
    pattern: /^\/profile\/([^/?#]+)\/?$/,
    resolve: (m) => ({
      status: "ready",
      screen: "UserProfile",
      params: { username: decodeURIComponent(m[1]) },
      intended: `profile ${m[1]}`,
      navPath: `/profile/${m[1]}`,
    }),
  },
  {
    // ✅ real screen - followers / following of a profile
    pattern: /^\/profile\/([^/?#]+)\/(followers|following)\/?$/,
    resolve: (m) => ({
      status: "ready",
      screen: "FollowList",
      params: { username: decodeURIComponent(m[1]), type: m[2] as "followers" | "following" },
      intended: `${m[2]} of ${m[1]}`,
      navPath: `/profile/${m[1]}/${m[2]}`,
    }),
  },
  {
    // The id is informational - there is no per-notice screen. It lands on the
    // Inbox hub, which is the neutral ground covering all three scopes: system
    // notices used to be forced into the Activity feed here, where system types
    // are filtered OUT, so tapping an admin message showed likes and follows.
    pattern: /^\/notification\/([^/?#]+)\/?$/,
    resolve: (m) => ({
      status: "ready",
      screen: "Main",
      params: { screen: "Inbox" },
      intended: `notification ${m[1]}`,
      navPath: "/inbox",
    }),
  },
  {
    // ✅ real screen - the messaging hub, where DM requests are handled.
    //    Message-request notifications used to open the actor's profile.
    pattern: /^\/messages\/?$/,
    resolve: () => ({
      status: "ready",
      screen: "Main",
      params: { screen: "Inbox" },
      intended: "messages",
      navPath: "/inbox",
    }),
  },
  {
    // The post viewer is a LAYER above the navigator, not a route, so there is
    // no screen to name here. The navigation half lands on the feed and `open`
    // raises the viewer over it - which is also what makes Back land somewhere
    // sensible rather than on an empty stack.
    //
    // Accept both /video/{id} (canonical) and the legacy /videos/{id} spelling
    // that a few web share URLs still emit, so neither 404s into the feed.
    pattern: /^\/videos?\/(\d+)\/?$/,
    resolve: (m) => ({
      ...HOME,
      status: "ready",
      intended: `video ${m[1]}`,
      open: () => usePostViewer.getState().showVideo(Number(m[1])),
    }),
  },
  {
    // Comments are a sheet inside the post viewer, not a route. Until the
    // sheet is deep-linkable we cannot scroll to a given comment - but the
    // server now prefers /video/{id} whenever it knows the parent reel, so
    // this branch is only hit for older payloads. Landing on Home is still
    // better than throwing.
    pattern: /^\/comment\/(\d+)\/?$/,
    resolve: (m) => ({ ...HOME, status: "pending", intended: `comment ${m[1]}` }),
  },
  {
    // ⏳ no hashtag screen
    pattern: /^\/tag\/([^/?#]+)\/?$/,
    resolve: (m) => ({ ...HOME, status: "pending", intended: `hashtag #${decodeURIComponent(m[1])}` }),
  },
  {
    // ✅ real screen - watching one live video broadcast
    pattern: /^\/live\/(\d+)\/?$/,
    resolve: (m) => ({
      status: "ready",
      screen: "WatchLive",
      params: { id: Number(m[1]) },
      intended: `live ${m[1]}`,
      navPath: `/live/${m[1]}`,
    }),
  },
  {
    // The bare tabs, so a shared root link opens the app rather than nothing.
    pattern: /^\/?$/,
    resolve: () => ({ ...HOME, status: "ready", intended: "home" }),
  },
];

/**
 * Reduce a full URL to its path. Accepts every shape a link can arrive in:
 * https://reelsoo.com/x, reelsoo://x, exp://192.168.1.2:8081/--/x, or /x.
 */
export function pathFromUrl(input: string): string {
  if (!input) return "/";
  let s = input.trim();

  // Expo Go wraps the real path after "/--/".
  const marker = s.indexOf("/--/");
  if (marker !== -1) return normalise(s.slice(marker + 3));

  // Strip scheme://host, leaving the path.
  const scheme = s.indexOf("://");
  if (scheme !== -1) {
    const rest = s.slice(scheme + 3);
    const slash = rest.indexOf("/");
    return normalise(slash === -1 ? "/" : rest.slice(slash));
  }
  return normalise(s);
}

function normalise(p: string): string {
  const q = p.split(/[?#]/)[0];
  return q.startsWith("/") ? q : `/${q}`;
}

/**
 * URL or path -> destination. Returns null when nothing matches, so callers can
 * decide whether to ignore the link or open the app's default screen.
 */
export function resolveDeepLink(input: string): DeepLinkTarget | null {
  const path = pathFromUrl(input);
  for (const rule of RULES) {
    const m = path.match(rule.pattern);
    if (m) return rule.resolve(m);
  }
  return null;
}

/**
 * Path rewriter for React Navigation's own parser.
 *
 * `linking.config` below declares only routes that exist. Anything pending is
 * collapsed to its fallback path here BEFORE the default parser sees it, which
 * is what keeps an unbuilt destination from producing an empty navigation
 * state. Using the built-in parser (rather than hand-building state) is also
 * what gives a correct back stack for free.
 */
export function rewritePathForNavigation(path: string): string {
  const target = resolveDeepLink(path);
  if (!target) return path;
  if (target.status === "pending") {
    warnPending(target);
  }
  // Cold start: the layer reads this from its store when it mounts, so setting
  // it before navigation resolves is fine - it does not need a mounted tree.
  target.open?.();
  return target.navPath;
}

/**
 * Imperative navigation, for links that arrive while the app is already running
 * - a tapped push notification, or a row in the notification list. Cold starts
 * go through `linking` instead, which restores a full stack.
 *
 * Returns true when it navigated.
 */
export function navigateToDeepLink(input: string): boolean {
  const target = resolveDeepLink(input);
  if (!target) return false;
  if (!navigationRef.isReady()) return false;

  if (target.status === "pending") warnPending(target);

  /*
   * A target that opens a LAYER (the post viewer) only names a screen so that a
   * COLD start - opened from a push or a URL with nothing on the stack - has
   * something sensible underneath it. From inside the app that navigate is
   * actively harmful: `navigate` to an earlier route POPS everything above it,
   * so tapping a video notification threw the notification list away, and
   * closing the viewer landed on the feed instead of back on the list.
   *
   * The layer paints above the whole navigator, so it does not need the stack
   * moved at all - it covers whatever the user is already on, and closing it
   * uncovers that same screen, still mounted and still scrolled where they left
   * it. On a cold start that screen is the initial route (Main → Home), which
   * is exactly what the navigate was reaching for anyway.
   */
  if (target.open) {
    // Defensive: with no current route there is nothing to cover, so fall back
    // to putting the named screen underneath first.
    if (!navigationRef.getCurrentRoute()) {
      navigationRef.dispatch(
        CommonActions.navigate({ name: target.screen as string, params: target.params }),
      );
    }
    target.open();
    return true;
  }

  navigationRef.dispatch(
    CommonActions.navigate({ name: target.screen as string, params: target.params }),
  );
  return true;
}

/** One place to see what users are asking for that the app cannot open yet. */
function warnPending(target: DeepLinkTarget) {
  if (__DEV__) {
    console.warn(
      `[deep-link] no screen for ${target.intended} yet - opened ${target.screen} instead`,
    );
  }
}

/**
 * React Navigation's declarative path map. Only routes that actually exist are
 * listed; `rewritePathForNavigation` funnels everything else into one of these.
 */
export const linkingScreens = {
  Main: {
    screens: {
      Home: "",
      Spaces: "spaces",
      Inbox: "inbox",
      Profile: "me",
    },
  },
  UserProfile: "profile/:username",
  FollowList: "profile/:username/:type",
  Notifications: "notification",
} as const;
