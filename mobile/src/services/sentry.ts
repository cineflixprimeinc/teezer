import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Application from "expo-application";
import { config } from "@/constants/config";

/**
 * Crash and error reporting.
 *
 * Exists because the release build had no reporting at all: twelve TestFlight
 * crashes arrived as "app crashed at the inbox page" with no exception, no
 * stack and no route, and Apple's own .ips files carry the native stack only -
 * never the JavaScript message that actually caused them. This closes that gap.
 *
 * Everything here is guarded and best-effort. Reporting is diagnostics: it must
 * never delay a screen, never block an interaction, and above all never be the
 * thing that crashes the app. Requirement 13 is not decoration - a monitoring
 * SDK that takes the app down when its own service is unreachable is worse than
 * no monitoring, so every call below swallows its own failure.
 *
 * PRIVACY: sendDefaultPii is off, and beforeSend strips request bodies and
 * headers. Nothing here ever records passwords, tokens, message contents,
 * emails or keychain values. Breadcrumbs carry an action name and ids at most.
 */

/**
 * Expo Go has no Sentry native module - only a real build does. A top-level
 * `import` would evaluate the native bindings while the module graph is still
 * loading and take the app down before the first screen renders, which is the
 * same reason iap.ts, webrtc.ts and skia.ts all require lazily behind this
 * exact check.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type SentryModule = typeof import("@sentry/react-native");

let sentry: SentryModule | null | undefined;

function load(): SentryModule | null {
  if (sentry !== undefined) return sentry;
  if (isExpoGo) return (sentry = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require("@sentry/react-native") as SentryModule;
  } catch {
    sentry = null;
  }
  return sentry;
}

/**
 * The release this build reports as.
 *
 * Must match what the EAS build uploads its source maps under, or a production
 * stack trace stays minified in the dashboard - the whole point of the upload.
 * The Sentry convention is `<bundle id>@<version>+<build>`, and `dist` is the
 * build number on its own; the Expo plugin tags uploaded maps the same way, so
 * TestFlight build 12 lands against release com.reelsoo.app@1.0+12.
 */
function releaseTag(): { release: string; dist: string } {
  const version = Application.nativeApplicationVersion ?? "0.0.0";
  const build = Application.nativeBuildVersion ?? "0";
  const id = Application.applicationId ?? "com.teezer.app";
  return { release: `${id}@${version}+${build}`, dist: build };
}

let started = false;

/** Call once, as early as possible - errors thrown before this are not captured. */
export function initSentry(): void {
  if (started) return;
  const S = load();
  if (!S) return;

  // No DSN is a valid state, not a failure: a fork, a local checkout, or a
  // build whose env var was never set. Initialising with an empty DSN makes
  // every capture throw, so this stays off instead.
  const dsn = (Constants.expoConfig?.extra as { sentryDsn?: string } | undefined)?.sentryDsn
    ?? process.env.EXPO_PUBLIC_SENTRY_DSN
    ?? "";
  if (!dsn) return;

  const { release, dist } = releaseTag();

  try {
    S.init({
      dsn,
      release,
      dist,
      environment: config.appEnv,

      // Native iOS/Android crash reporting. On by default; named explicitly
      // because it is the reason this exists - a JS-only reporter would have
      // missed nothing in our case, but would miss a native abort next time.
      enableNative: true,

      // Off deliberately. It attaches IP address, and with the auth headers
      // this app sends it would put bearer tokens in the dashboard.
      sendDefaultPii: false,

      // Performance tracing costs battery and network on a video app for
      // information we are not acting on yet. Crash reporting is the job.
      tracesSampleRate: 0,

      // Dev builds already surface errors in LogBox; sending them would bury
      // the real TestFlight crashes in noise from local work.
      enabled: config.appEnv !== "development",

      /**
       * Last line of defence for privacy. Runs on every event, before it
       * leaves the device, and drops anything that could carry a credential.
       */
      beforeSend(event) {
        try {
          if (event.request) {
            // Headers hold Authorization; cookies and bodies hold everything
            // else. None of it is needed to identify a crash.
            delete event.request.headers;
            delete event.request.cookies;
            delete event.request.data;
          }
          if (event.user) {
            // An id is enough to correlate reports. Email, username and IP are
            // not needed and are exactly what should not sit in a dashboard.
            event.user = { id: event.user.id };
          }
        } catch {
          /* Never drop an event because scrubbing failed. */
        }
        return event;
      },
    });
    started = true;
  } catch {
    // An SDK that cannot start must not stop the app from starting.
  }
}

/* ── Breadcrumbs ──────────────────────────────────────────────────────────
 * The trail of what happened BEFORE a crash. A stack trace says where the app
 * died; breadcrumbs say what the person was doing, which is usually what makes
 * a crash reproducible.
 *
 * Keep them coarse and non-identifying: an action name, and an id where it
 * makes the report useful. Never a caption, a message body, a search query or
 * anything else the user typed.                                              */

export type BreadcrumbData = Record<string, string | number | boolean | undefined>;

export function breadcrumb(category: string, message: string, data?: BreadcrumbData): void {
  const S = load();
  if (!S) return;
  try {
    S.addBreadcrumb({ category, message, data, level: "info" });
  } catch {
    /* as above */
  }
}

/** A handled error - something failed but the app carried on. */
export function captureError(error: unknown, context?: BreadcrumbData): void {
  const S = load();
  if (!S) return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    S.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* as above */
  }
}

/**
 * Ties reports to an account without exposing one.
 *
 * The id alone: enough to see that six crashes came from one person rather
 * than six, and not enough to identify them from the dashboard. Called on sign
 * in and account switch; pass null on sign out so the next person's reports do
 * not inherit the last one's id.
 */
export function setUser(id: number | null): void {
  const S = load();
  if (!S) return;
  try {
    S.setUser(id === null ? null : { id: String(id) });
  } catch {
    /* as above */
  }
}

/** Platform tag, set once, so dashboard filtering by device class is possible. */
export function tagPlatform(): void {
  const S = load();
  if (!S) return;
  try {
    S.setTag("platform", Platform.OS);
    S.setTag("expoGo", String(isExpoGo));
  } catch {
    /* as above */
  }
}
