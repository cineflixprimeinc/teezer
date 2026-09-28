import { Component, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { buildReport, format, record, type CrashReport } from "@/services/diagnostics";
import { captureError } from "@/services/sentry";

/**
 * Catches render errors so a broken screen does not take the whole app with it.
 *
 * Without this, a release build terminates on any unhandled render exception -
 * the same exception that a dev build shows in LogBox and lets you dismiss.
 * That difference is why this app "worked in Expo Go" and crashed repeatedly in
 * TestFlight: nothing was wrong with Expo Go, it was simply forgiving.
 *
 * This is NOT error suppression. The error is shown in full, written down via
 * the diagnostics service, and offered for copying - which is strictly more
 * information than a process that dies silently. Recovery is left to the user
 * rather than retried automatically, because re-rendering the same broken tree
 * usually just throws again.
 */

interface Props {
  children: ReactNode;
  /** Names the part of the app this boundary guards, so a report says WHERE. */
  scope?: string;
}

interface State {
  report: CrashReport | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { report: null, copied: false };

  /** Runs during React's error phase - keep it pure, no side effects here. */
  static getDerivedStateFromError(): Partial<State> {
    // The real report is built in componentDidCatch, which is where the
    // component stack is available. This only flips the tree to the fallback.
    return { copied: false };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const report = buildReport(error, "render", {
      componentStack: info?.componentStack ?? undefined,
      action: this.props.scope ? `render:${this.props.scope}` : "render",
    });
    this.setState({ report });
    void record(report);
    captureError(error, { kind: "render", route: report.route, scope: this.props.scope ?? "app" });
  }

  private copy = async () => {
    if (!this.state.report) return;
    try {
      await Clipboard.setStringAsync(format(this.state.report));
      this.setState({ copied: true });
    } catch {
      /* The details are on screen regardless; copying is a convenience. */
    }
  };

  private retry = () => this.setState({ report: null, copied: false });

  render() {
    const { report } = this.state;
    // getDerivedStateFromError flips first and componentDidCatch fills the
    // report a tick later, so `report` alone is not a reliable "has errored"
    // flag - but rendering children again in that gap would immediately rethrow
    // the same error, so the report's presence is the correct gate here.
    if (!report) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>
            The screen below stopped working. These details identify the cause -
            copy them into a bug report.
          </Text>

          <View style={styles.card}>
            <Text style={styles.err}>{report.type}: {report.message}</Text>
            <Text style={styles.meta}>route    {report.route}</Text>
            <Text style={styles.meta}>app      {report.appVersion} ({report.buildNumber})</Text>
            <Text style={styles.meta}>os       {report.osVersion}</Text>
            <Text style={styles.meta}>device   {report.deviceModel}</Text>
          </View>

          <Text style={styles.section}>STACK</Text>
          <Text style={styles.stack}>{report.stack}</Text>

          {!!report.componentStack && (
            <>
              <Text style={styles.section}>COMPONENT STACK</Text>
              <Text style={styles.stack}>{report.componentStack}</Text>
            </>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <Pressable onPress={this.copy} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.secondaryTxt}>{this.state.copied ? "Copied" : "Copy details"}</Text>
          </Pressable>
          <Pressable onPress={this.retry} style={styles.primary} accessibilityRole="button">
            <Text style={styles.primaryTxt}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  body: { padding: 20, paddingTop: 72, gap: 10 },
  title: { fontSize: 22, fontWeight: "800", color: "#121014" },
  sub: { fontSize: 14, color: "#6B6672", lineHeight: 20, marginBottom: 6 },
  card: { backgroundColor: "#F7F5F8", borderRadius: 12, padding: 14, gap: 3 },
  err: { fontSize: 14.5, fontWeight: "700", color: "#C0304B", marginBottom: 6 },
  meta: { fontSize: 12, color: "#4A4550", fontFamily: "Menlo" },
  section: { fontSize: 11, fontWeight: "800", color: "#8A8592", letterSpacing: 0.8, marginTop: 14 },
  stack: { fontSize: 11, color: "#4A4550", fontFamily: "Menlo", lineHeight: 16 },
  actions: {
    flexDirection: "row", gap: 10, padding: 16, paddingBottom: 34,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#EFECF1",
  },
  secondary: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center",
    backgroundColor: "#F4F2F5",
  },
  secondaryTxt: { fontSize: 14.5, fontWeight: "700", color: "#121014" },
  primary: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center",
    backgroundColor: "#fe2c55",
  },
  primaryTxt: { fontSize: 14.5, fontWeight: "700", color: "#fff" },
});
