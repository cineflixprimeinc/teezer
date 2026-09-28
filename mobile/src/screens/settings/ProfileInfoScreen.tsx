import { useCallback } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Avatar } from "@/components/Avatar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { profileApi } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import type { ProfileDetails } from "@/types";
import { genderLabel, formatDOB } from "./profileFields";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const AVATAR_SIZE = 104;

/**
 * Profile Information - reads the real own-profile (GET /profile) and lists each
 * field with its current value. Tapping a row opens that field's dedicated edit
 * screen, which saves to the backend; this list re-reads the fresh value on focus.
 */
export function ProfileInfoScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const setAuthUser = useAuthStore((s) => s.setUser);
  const query = useQuery({ queryKey: ["profileMe"], queryFn: profileApi.me });

  // Re-read the freshest value when returning from an edit screen.
  useFocusEffect(useCallback(() => { void query.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  const p = query.data;

  // Keep the avatar in sync everywhere: profile cache + the auth store (Settings card, switcher).
  function applyAvatar(url: string | null) {
    const hasAvatar = url !== null;
    queryClient.setQueryData<ProfileDetails>(["profileMe"], (old) => (old ? { ...old, avatar: url, has_avatar: hasAvatar } : old));
    if (authUser) setAuthUser({ ...authUser, avatar: url, has_avatar: hasAvatar });
  }

  const avatarMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type: string }) => profileApi.updateAvatar(file),
    onSuccess: (data) => applyAvatar(data.avatar_url),
    onError: (e) => Alert.alert("Couldn't update photo", apiErrorMessage(e, "Please try again.")),
  });

  const removeMutation = useMutation({
    mutationFn: () => profileApi.removeAvatar(),
    onSuccess: () => applyAvatar(null),
    onError: (e) => Alert.alert("Couldn't remove photo", apiErrorMessage(e, "Please try again.")),
  });

  const avatarBusy = avatarMutation.isPending || removeMutation.isPending;

  async function pickFrom(source: "camera" | "library") {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", `Please allow ${source === "camera" ? "camera" : "photo"} access to continue.`);
        return;
      }
      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const name = a.fileName || `avatar-${a.uri.split("/").pop() || "photo.jpg"}`;
      avatarMutation.mutate({ uri: a.uri, name, type: a.mimeType || "image/jpeg" });
    } catch (e) {
      Alert.alert("Couldn't pick photo", apiErrorMessage(e, "Please try again."));
    }
  }

  function changePhoto() {
    if (avatarBusy) return;
    const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
      { text: "Take Photo", onPress: () => pickFrom("camera") },
      { text: "Choose from Library", onPress: () => pickFrom("library") },
    ];
    if (p?.has_avatar) options.push({ text: "Remove Current Photo", style: "destructive", onPress: () => removeMutation.mutate() });
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile photo", "Update the photo shown on your public profile.", options);
  }
  const rows = p
    ? [
        { icon: I("person-outline"), label: "Full Name", value: p.name ?? "", go: () => navigation.navigate("EditFullName", { value: p.name ?? "" }) },
        { icon: I("at-outline"), label: "Username", value: p.username, go: () => navigation.navigate("EditUsername", { value: p.username }) },
        { icon: I("create-outline"), label: "Bio", value: p.bio ?? "", go: () => navigation.navigate("EditBio", { value: p.bio ?? "" }) },
        { icon: I("grid-outline"), label: "Profile Category / Interests", value: (p.categories ?? []).join(", "), go: () => navigation.navigate("EditCategory", { value: p.categories ?? [] }) },
        { icon: M("gender-male-female"), label: "Gender", value: genderLabel(p.gender), go: () => navigation.navigate("EditGender", { value: p.gender ?? "" }) },
        { icon: I("calendar-outline"), label: "Birthday", value: formatDOB(p.date_of_birth), go: () => navigation.navigate("EditBirthday", { value: p.date_of_birth ?? "" }) },
        { icon: I("mail-outline"), label: "Email Address", value: p.email ?? "", go: () => navigation.navigate("EditEmail", { value: p.email ?? "" }) },
        { icon: I("call-outline"), label: "Phone Number", value: p.phone ?? "", go: () => navigation.navigate("EditPhone", { value: p.phone ?? "" }) },
        { icon: I("location-outline"), label: "Location", value: p.location ?? "", go: () => navigation.navigate("EditLocation", { value: p.location ?? "" }) },
      ]
    : [];

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={28} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile Information</Text>
        <View style={styles.back} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <Text style={styles.subtitle}>Manage your personal information and public profile details.</Text>

        {/* Profile photo - tap the avatar or the camera badge to change it. */}
        <View style={styles.avatarSection}>
          <Pressable onPress={changePhoto} disabled={avatarBusy} style={styles.avatarRing}>
            <Avatar uri={p?.avatar} style={styles.avatar} />

            {avatarBusy ? (
              <View style={[styles.avatar, styles.avatarOverlay]}>
                <ActivityIndicator color={colors.white} />
              </View>
            ) : null}

            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={18} color={colors.white} />
            </View>
          </Pressable>

          <Pressable onPress={changePhoto} disabled={avatarBusy} hitSlop={8}>
            <Text style={styles.changePhotoText}>{p?.has_avatar ? "Change photo" : "Add photo"}</Text>
          </Pressable>
        </View>

        {query.isLoading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={styles.skelRow}>
                <Skeleton width={24} height={24} radius={6} />
                <Skeleton width={110} height={14} />
                <View style={{ flex: 1 }} />
                <Skeleton width={90} height={14} />
              </View>
            ))}
          </View>
        ) : query.isError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load your profile.</Text>
            <Pressable style={styles.retry} onPress={() => query.refetch()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((row, i) => (
              <Pressable
                key={row.label}
                style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.rowDivider, pressed && styles.rowPressed]}
                onPress={row.go}
              >
                <View style={styles.rowIcon}>{row.icon}</View>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue} numberOfLines={2}>{row.value || "Not set"}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={{ marginLeft: 6 }} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const I = (name: keyof typeof Ionicons.glyphMap, size = 22) => <Ionicons name={name} size={size} color={colors.text} />;
const M = (name: keyof typeof MaterialCommunityIcons.glyphMap, size = 22) => <MaterialCommunityIcons name={name} size={size} color={colors.text} />;

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 56 },
  back: { width: 36, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },

  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.md, fontSize: font.sm, color: colors.textMuted, lineHeight: 20 },

  avatarSection: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, marginBottom: spacing.xs },
  avatarRing: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, padding: 3, backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.border },
  avatar: { width: "100%", height: "100%", borderRadius: AVATAR_SIZE / 2, backgroundColor: colors.bgMuted },
  avatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.white, fontSize: 40, fontWeight: font.weightHeavy },
  avatarOverlay: { position: "absolute", top: 3, left: 3, right: 3, bottom: 3, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  cameraBadge: {
    position: "absolute", bottom: -2, right: -2, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.bg,
  },
  changePhotoText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  list: { paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, gap: spacing.md },
  rowPressed: { backgroundColor: colors.bgMuted },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 26, alignItems: "center" },
  rowLabel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowValue: { flex: 1, textAlign: "right", fontSize: font.md, color: colors.textMuted },

  skelRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },

  errorBox: { alignItems: "center", paddingTop: spacing.xxl, gap: spacing.md },
  errorText: { fontSize: font.md, color: colors.textMuted },
  retry: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.brand },
  retryText: { color: colors.white, fontWeight: font.weightBold },
});
