import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditShell } from "@/components/settings/EditShell";
import { profileApi } from "@/api/profile.api";
import { apiErrorMessage } from "@/api/client";
import type { ProfileDetails, SocialLink } from "@/types";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/** The six fixed platforms shown in order (backend platform key → label). */
const FIXED = [
  { platform: "facebook", label: "Facebook", placeholder: "https://facebook.com/username" },
  { platform: "instagram", label: "Instagram", placeholder: "https://instagram.com/username" },
  { platform: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username" },
  { platform: "youtube", label: "YouTube", placeholder: "https://youtube.com/@username" },
  { platform: "twitter", label: "X / Twitter", placeholder: "https://x.com/username" },
  { platform: "website", label: "Website", placeholder: "https://yoursite.com" },
];

// Mirrors the backend regex: full http(s) URL with domain + TLD.
const URL_RE = /^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;
const normalize = (u: string) => {
  const t = u.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

type Other = { id: number; url: string };
const serialize = (urls: Record<string, string>, others: Other[]) =>
  JSON.stringify({ f: FIXED.map((f) => urls[f.platform]?.trim() || ""), o: others.map((o) => o.url.trim()).filter(Boolean) });

/**
 * Social Links - Account Settings › Social Links. Loads the user's links from
 * GET /profile/social-links and saves the whole set via PUT (replace semantics).
 */
export function SocialLinksScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["socialLinks"], queryFn: profileApi.socialLinks });

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Other[]>([]);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const nextId = useRef(1);

  // Seed editable state once from the backend.
  useEffect(() => {
    if (!query.data || snapshot !== null) return;
    const map: Record<string, string> = {};
    const oth: Other[] = [];
    for (const l of query.data) {
      const p = (l.platform || "").toLowerCase();
      const key = p === "x" ? "twitter" : p;
      if (FIXED.some((f) => f.platform === key)) map[key] = l.url;
      else oth.push({ id: nextId.current++, url: l.url });
    }
    setUrls(map);
    setOthers(oth);
    setSnapshot(serialize(map, oth));
  }, [query.data, snapshot]);

  const changed = snapshot !== null && serialize(urls, others) !== snapshot;

  const save = useMutation({
    mutationFn: (links: { platform: string; url: string }[]) => profileApi.updateSocialLinks(links),
    onSuccess: (fresh: SocialLink[]) => {
      queryClient.setQueryData(["socialLinks"], fresh);
      const cur = queryClient.getQueryData<ProfileDetails>(["profileMe"]);
      if (cur) queryClient.setQueryData(["profileMe"], { ...cur, social_links: fresh });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert("Couldn't save", apiErrorMessage(err, "Please try again.")),
  });

  function onSave() {
    const links: { platform: string; url: string }[] = [];
    const invalid = new Set<string>();
    for (const f of FIXED) {
      const raw = (urls[f.platform] || "").trim();
      if (!raw) continue;
      const n = normalize(raw);
      if (!URL_RE.test(n)) { invalid.add(f.label); continue; }
      links.push({ platform: f.platform, url: n });
    }
    for (const o of others) {
      const raw = o.url.trim();
      if (!raw) continue;
      const n = normalize(raw);
      if (!URL_RE.test(n)) { invalid.add("custom link"); continue; }
      links.push({ platform: "other", url: n });
    }
    if (invalid.size) {
      Alert.alert("Invalid link", `Please enter a valid URL (https://…) for: ${[...invalid].join(", ")}.`);
      return;
    }
    save.mutate(links);
  }

  return (
    <EditShell
      title="Social Links"
      helper="Add or update your social media links. These will be displayed on your profile."
      canSave={changed}
      saving={save.isPending}
      onSave={onSave}
    >
      {query.isLoading ? (
        <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <View>
          {FIXED.map((f, i) => (
            <LinkRow
              key={f.platform}
              icon={<PlatformIcon platform={f.platform} />}
              label={f.label}
              value={urls[f.platform] ?? ""}
              placeholder={f.placeholder}
              divider={i < FIXED.length - 1 || others.length > 0}
              onChange={(t) => setUrls((m) => ({ ...m, [f.platform]: t }))}
              onClear={() => setUrls((m) => ({ ...m, [f.platform]: "" }))}
            />
          ))}

          {others.map((o, i) => (
            <LinkRow
              key={o.id}
              icon={<PlatformIcon platform="other" />}
              label="Link"
              value={o.url}
              placeholder="https://example.com/username"
              divider={i < others.length - 1}
              onChange={(t) => setOthers((arr) => arr.map((x) => (x.id === o.id ? { ...x, url: t } : x)))}
              onClear={() => setOthers((arr) => arr.filter((x) => x.id !== o.id))}
            />
          ))}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setOthers((arr) => [...arr, { id: nextId.current++, url: "" }])}
          >
            <View style={styles.addIcon}><Ionicons name="add" size={18} color={colors.brand} /></View>
            <Text style={styles.addText}>Add Another Link</Text>
          </Pressable>
        </View>
      )}
    </EditShell>
  );
}

function LinkRow({
  icon, label, value, placeholder, divider, onChange, onClear,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder: string;
  divider: boolean;
  onChange: (t: string) => void;
  onClear: () => void;
}) {
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      {icon}
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {value.length > 0 && (
          <Pressable hitSlop={6} onPress={onClear}>
            <Ionicons name="close-circle" size={20} color="#b9bdc6" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "facebook")
    return <View style={[styles.icon, { backgroundColor: "#1877F2", borderWidth: 0 }]}><Ionicons name="logo-facebook" size={26} color="#fff" /></View>;
  if (platform === "instagram")
    return (
      <LinearGradient colors={["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={[styles.icon, { borderWidth: 0 }]}>
        <Ionicons name="logo-instagram" size={24} color="#fff" />
      </LinearGradient>
    );
  if (platform === "tiktok")
    return <View style={styles.icon}><Ionicons name="logo-tiktok" size={22} color="#000" /></View>;
  if (platform === "youtube")
    return <View style={styles.icon}><Ionicons name="logo-youtube" size={26} color="#FF0000" /></View>;
  if (platform === "twitter")
    return <View style={styles.icon}><XMark size={18} color="#000" /></View>;
  return <View style={styles.icon}><Ionicons name="link-outline" size={22} color={colors.text} /></View>;
}

function XMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  label: { width: 74, fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  inputBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 12, height: 46, backgroundColor: colors.white },
  input: { flex: 1, fontSize: 13.5, color: colors.text, padding: 0 },

  addBtn: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.bgMuted, borderRadius: 12, paddingHorizontal: spacing.md, height: 56, marginTop: spacing.lg },
  addIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  addText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand },
});
