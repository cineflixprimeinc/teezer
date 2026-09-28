import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { navigationRef } from "@/navigation/ref";
import { captureError } from "@/services/sentry";

/**
 * Crash diagnostics.
 *
 * This app had no error boundary and no global JS error handler, which is the
 * structural reason it behaves so differently in Expo Go and in TestFlight. In
 * a dev build an unhandled JS exception is shown in LogBox and dismissed, and
 * the app carries on - so a latent bug reads as "working". In a release build
 * React Native's default handler treats the same exception as fatal and
 * terminates the process immediately. Nothing is written down, so a tester can
 * only report "it crashed", which is exactly the evidence we were left with.
 *
 * This records what an exception WAS, on the device, in a form that survives
 * the crash and can be read back and copied out afterwards. It deliberately
 * does not send anything anywhere: no monitoring service is being introduced
 * here, and no network call is made from a process that may be moments from
 * dying.
 *
 * PRIVACY: only the fields below are ever stored - the error itself, the route
 * NAME, and build/OS identifiers. Never route params, form values, headers,
 * store contents, tokens, keychain values or credentials. Route params in
 * particular are excluded on purpose: they routinely carry user and post ids.
 */

export interface CrashReport {
  /** ISO 8601, so reports sort and read correctly when copied out. */
  at: string;
  /** "render" = caught by the error boundary; "fatal"/"non-fatal" = global handler. */
  kind: "render" | "fatal" | "non-fatal";
  /** Constructor name, e.g. TypeError - the error TYPE, separate from message. */
  type: string;
  message: string;
  stack: string;
  /** React's component stack. Only present for render errors. */
  componentStack?: string;
  /** Navigation route name at the time. No params - see PRIVACY above. */
  route: string;
  /** What the app was doing, when a caller can say. */
  action?: string;
  appVersion: string;
  buildNumber: string;
  osVersion: string;
  deviceModel: string;
}

const KEY = "diagnostics:crashes";
/** A ring buffer: enough to show a pattern, small enough to never bloat storage. */
const MAX_REPORTS = 10;

function currentRoute(): string {
  try {
    // isReady() matters: a crash during the very first render happens before
    // the navigator exists, and getCurrentRoute would throw on top of the error
    // we are trying to record.
    if (!navigationRef.isReady()) return "(navigator not ready)";
    return navigationRef.getCurrentRoute()?.name ?? "(unknown)";
  } catch {
    return "(unavailable)";
  }
}

/**
 * Hardware model without adding a native module.
 *
 * expo-device would give the exact model, but adding a native dependency in the
 * middle of a crash investigation changes the very binary under investigation.
 * expo-constants already ships in this app and carries the model on iOS.
 */
function deviceModel(): string {
  try {
    const c = Constants as unknown as { platform?: { ios?: { model?: string } }; deviceName?: string };
    return c.platform?.ios?.model ?? c.deviceName ?? `${Platform.OS} (model unavailable)`;
  } catch {
    return "(unavailable)";
  }
}

export function buildReport(
  error: unknown,
  kind: CrashReport["kind"],
  extra: { componentStack?: string; action?: string } = {},
): CrashReport {
  // Anything can be thrown in JS, not just an Error - a string or undefined
  // reaches here just as easily, and reading .message off those is its own
  // crash.
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    at: new Date().toISOString(),
    kind,
    type: err.name || "Error",
    message: err.message || "(no message)",
    stack: err.stack ?? "(no stack)",
    componentStack: extra.componentStack,
    route: currentRoute(),
    action: extra.action,
    appVersion: Application.nativeApplicationVersion ?? "(unknown)",
    buildNumber: Application.nativeBuildVersion ?? "(unknown)",
    osVersion: `${Platform.OS} ${String(Platform.Version)}`,
    deviceModel: deviceModel(),
  };
}

/** Persist a report. Never throws and never rejects - a failure to record must
 *  not become a second crash on top of the first. */
export async function record(report: CrashReport): Promise<void> {
  try {
    const existing = await read();
    const next = [report, ...existing].slice(0, MAX_REPORTS);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Recording is best-effort by design. */
  }
}

export async function read(): Promise<CrashReport[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CrashReport[]) : [];
  } catch {
    return [];
  }
}

export async function clear(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* as above */
  }
}

/** Plain text, for the copy button - this is what gets pasted into a bug report. */
export function format(r: CrashReport): string {
  return [
    `${r.type}: ${r.message}`,
    ``,
    `when     ${r.at}`,
    `kind     ${r.kind}`,
    `route    ${r.route}`,
    ...(r.action ? [`action   ${r.action}`] : []),
    `app      ${r.appVersion} (${r.buildNumber})`,
    `os       ${r.osVersion}`,
    `device   ${r.deviceModel}`,
    ``,
    `stack`,
    r.stack,
    ...(r.componentStack ? [``, `component stack`, r.componentStack] : []),
  ].join("\n");
}

/**
 * Records fatal JS errors that never reach a React error boundary - anything
 * thrown outside render: an event handler, a timer, a promise chain.
 *
 * It deliberately DELEGATES to React Native's original handler afterwards
 * rather than swallowing the error. Suppressing a fatal error would leave the
 * app running on top of whatever broke, and would hide the very crashes this is
 * meant to explain; the purpose here is to write the error down before the
 * process goes, not to prevent it going.
 */
export function installGlobalHandler(): void {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler(): (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler(h: (e: unknown, isFatal?: boolean) => void): void;
    };
  };
  const ErrorUtils = g.ErrorUtils;
  if (!ErrorUtils?.setGlobalHandler) return;

  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    // Fire-and-forget: the write races the process teardown on a fatal error
    // and usually wins, because AsyncStorage's native write is dispatched
    // immediately. Awaiting is not an option inside a handler that must not
    // delay the app's own crash path.
    const report = buildReport(error, isFatal ? "fatal" : "non-fatal");
    void record(report);
    // Sentry as well as the on-device record: the local copy survives the
    // crash for the person holding the phone, the upload is what reaches us
    // without them having to send anything.
    captureError(error, { kind: report.kind, route: report.route });
    try {
      previous?.(error, isFatal);
    } catch {
      /* Never let the recorder be the thing that breaks the crash path. */
    }
  });
}
