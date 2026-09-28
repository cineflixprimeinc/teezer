import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { colors } from "@/constants/colors";

/** Standard screen wrapper: safe-area padding + light background. */
export function Screen({
  children,
  style,
  edges = ["top", "bottom"],
  bg = colors.bg,
}: {
  children: ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
  bg?: string;
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: bg }]}>
      <View style={[styles.inner, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1 },
});
