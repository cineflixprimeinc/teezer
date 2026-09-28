import { useRef, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, Share2 } from "lucide-react-native";
import QRCodeSvg from "react-native-qrcode-svg";
import { Avatar } from "@/components/Avatar";
import { ScanCameraView } from "./ScanCameraView";
import { profileUrl, qrLoginUrl } from "@/components/profile/ProfileActionsSheet";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

type Mode = "scan" | "code";

/**
 * Profile -> Scan (top-left of your own profile). Two modes, one toggle -
 * Scan (camera, reads someone else's profile code and opens their profile)
 * and My Code (your own profile as a QR code, for someone else to scan).
 *
 * Both encode/expect the exact same URL shape ProfileActionsSheet's Share
 * profile/Copy link already use (profileUrl(username) -
 * https://teezer.live/profile/{username}) - a code made by "My Code" is
 * exactly what "Scan" (here, or on any other Teezer device) expects to
 * read, and it is also just the shop/video share links' own pattern applied
 * to a profile.
 *
 * The My Code tab needs no camera at all (react-native-qrcode-svg is pure
 * JS); Scan needs expo-camera, which - like My Code - works everywhere,
 * Expo Go included.
 */
export function ScanScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const authUser = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<Mode>("scan");
  const lastScanned = useRef<string | null>(null);

  const onScanned = (data: string) => {
    if (data === lastScanned.current) return; // the scanner fires per-frame while a code is in view
    lastScanned.current = data;

    // Checked first - a login code and a profile code are never confusable
    // (different path segments) but a login one is the more time-sensitive
    // of the two (short-lived ticket) so it wins any ambiguity.
    const loginPrefix = qrLoginUrl("");
    if (data.startsWith(loginPrefix)) {
      const ticket = data.slice(loginPrefix.length).split(/[/?#]/)[0];
      if (ticket) {
        navigation.navigate("AuthorizeLogin", { ticket });
        return;
      }
    }

    const profilePrefix = profileUrl("");
    const username = data.startsWith(profilePrefix) ? data.slice(profilePrefix.length).split(/[/?#]/)[0] : null;

    if (username) {
      navigation.navigate("UserProfile", { username });
      return;
    }

    Alert.alert("Not a Teezer code", "That QR code isn't a Teezer profile or login link.", [
      { text: "OK", onPress: () => { lastScanned.current = null; } },
    ]);
  };

  const shareMyCode = () => {
    if (!authUser?.username) return;
    Share.share({ message: `@${authUser.username} on Teezer\n${profileUrl(authUser.username)}` }).catch(() => {});
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.headerBtn}>
          <ChevronLeft size={26} color={colors.white} strokeWidth={2.2} />
        </Pressable>
        <View style={s.toggle}>
          <Pressable style={[s.toggleBtn, mode === "scan" && s.toggleBtnOn]} onPress={() => setMode("scan")}>
            <Text style={[s.toggleText, mode === "scan" && s.toggleTextOn]}>Scan</Text>
          </Pressable>
          <Pressable style={[s.toggleBtn, mode === "code" && s.toggleBtnOn]} onPress={() => setMode("code")}>
            <Text style={[s.toggleText, mode === "code" && s.toggleTextOn]}>My Code</Text>
          </Pressable>
        </View>
        {mode === "code" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Share my code" hitSlop={10} onPress={shareMyCode} style={s.headerBtn}>
            <Share2 size={20} color={colors.white} />
          </Pressable>
        ) : (
          <View style={s.headerBtn} />
        )}
      </View>

      {mode === "scan" ? (
        <View style={StyleSheet.absoluteFill}>
          <ScanCameraView onScanned={onScanned} />
          {/* Purely visual framing - the scanner itself reads the whole frame,
             this just tells someone where to hold the code. */}
          <View pointerEvents="none" style={s.frameWrap}>
            <View style={s.frame}>
              <View style={[s.corner, s.cornerTL]} />
              <View style={[s.corner, s.cornerTR]} />
              <View style={[s.corner, s.cornerBL]} />
              <View style={[s.corner, s.cornerBR]} />
            </View>
            <Text style={s.frameHint}>Point your camera at a Teezer profile code</Text>
          </View>
        </View>
      ) : (
        <View style={s.codeWrap}>
          <View style={s.codeCard}>
            <QRCodeSvg value={profileUrl(authUser?.username ?? "")} size={220} backgroundColor="#FFFFFF" color={colors.text} />
          </View>
          <Avatar uri={authUser?.avatar} style={s.avatar} />
          <Text style={s.name}>{authUser?.name || authUser?.username}</Text>
          {!!authUser?.username && <Text style={s.handle}>@{authUser.username}</Text>}
          <Text style={s.codeHint}>Anyone can scan this to open your profile.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, zIndex: 1 },
  headerBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },

  toggle: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.pill, padding: 3 },
  toggleBtn: { paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.pill },
  toggleBtnOn: { backgroundColor: colors.white },
  toggleText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.white },
  toggleTextOn: { color: colors.text },

  // Scan frame overlay
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xl },
  frame: { width: 240, height: 240 },
  corner: { position: "absolute", width: 32, height: 32, borderColor: "#FFFFFF" },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  frameHint: { fontSize: font.sm, fontWeight: font.weightBold, color: "rgba(255,255,255,0.85)", textAlign: "center", paddingHorizontal: spacing.xxl },

  // My Code
  codeWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  codeCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: "#FFFFFF" },
  avatar: { width: 56, height: 56, borderRadius: 28, marginTop: spacing.lg, backgroundColor: colors.bgMuted },
  name: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.white },
  handle: { fontSize: font.sm, color: "rgba(255,255,255,0.6)", marginTop: -spacing.xs },
  codeHint: { marginTop: spacing.sm, fontSize: font.xs, color: "rgba(255,255,255,0.5)", textAlign: "center" },
});
