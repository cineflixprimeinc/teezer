import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * The QR/profile-code scanner for the Scan tab. expo-camera ships inside
 * Expo Go - unlike react-native-vision-camera, the engine this used to run
 * on - so there is no availability gate to carry here anymore; this file IS
 * the scanner, not a wrapper in front of one.
 *
 * onBarcodeScanned fires per-frame while a code is in view; ScanScreen.tsx's
 * own onScanned already dedupes against the last-read value, so no debounce
 * is needed here.
 */
export function ScanCameraView({ onScanned }: { onScanned: (data: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.title}>Camera access needed</Text>
        <Text style={s.text}>Teezer needs your camera to scan a profile code.</Text>
        <Pressable style={s.btn} onPress={requestPermission}>
          <Text style={s.btnText}>Grant Access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={({ data }) => onScanned(data)}
    />
  );
}

const s = StyleSheet.create({
  // absoluteFill, not flex: 1 - this is a sibling of ScanScreen's
  // frameWrap overlay inside a shared flex container, and flex: 1 here would
  // split the screen with it instead of filling it, pushing the scan frame
  // down into the bottom half.
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },
  title: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.white, textAlign: "center" },
  text: { fontSize: font.sm, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 19 },
  btn: { marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  btnText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },
});
