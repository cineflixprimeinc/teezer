import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronLeft, Star } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { shopReviewsSellerApi, type SellerShopReview } from "@/api/shop-reviews-seller.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/** Shop Settings > Products > Product Reviews. Shop-wide (see ShopReview's own docblock), with the seller-reply this app never had before. */
export function ShopReviewsScreen() {
  const navigation = useNavigation<any>();
  const [reviews, setReviews] = useState<SellerShopReview[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(() => {
    shopReviewsSellerApi.list(1).then((r) => setReviews(r.data)).catch(() => setReviews([]));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reply = (review: SellerShopReview) => {
    const text = (drafts[review.id] ?? "").trim();
    if (!text) return;
    setSavingId(review.id);
    shopReviewsSellerApi.reply(review.id, text)
      .then((updated) => {
        setReviews((list) => (list ?? []).map((r) => (r.id === updated.id ? updated : r)));
        setDrafts((d) => ({ ...d, [review.id]: "" }));
      })
      .catch((e) => Alert.alert("Couldn't send reply", apiErrorMessage(e)))
      .finally(() => setSavingId(null));
  };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Product Reviews</Text>
        <View style={s.back} />
      </View>

      {!reviews ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.empty}>No reviews yet.</Text>}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.reviewHead}>
                <Avatar uri={item.user.avatar ?? undefined} style={s.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.user.name ?? item.user.username}</Text>
                  <View style={s.stars}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={13} color={i < item.rating ? "#f5a623" : colors.border} fill={i < item.rating ? "#f5a623" : "transparent"} />
                    ))}
                  </View>
                </View>
              </View>
              {!!item.comment && <Text style={s.comment}>{item.comment}</Text>}

              {item.seller_reply ? (
                <View style={s.replyBox}>
                  <Text style={s.replyLabel}>Your reply</Text>
                  <Text style={s.replyText}>{item.seller_reply}</Text>
                </View>
              ) : (
                <View style={s.replyRow}>
                  <TextInput
                    style={s.replyInput}
                    value={drafts[item.id] ?? ""}
                    onChangeText={(t) => setDrafts((d) => ({ ...d, [item.id]: t }))}
                    placeholder="Write a reply..."
                    placeholderTextColor={colors.textFaint}
                    multiline
                  />
                  <Pressable
                    style={[s.replyBtn, !(drafts[item.id] ?? "").trim() && s.replyBtnDisabled]}
                    disabled={!(drafts[item.id] ?? "").trim() || savingId === item.id}
                    onPress={() => reply(item)}
                  >
                    {savingId === item.id ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={s.replyBtnText}>Reply</Text>}
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  empty: { textAlign: "center", marginTop: 60, color: colors.textMuted, fontSize: font.sm },

  card: { backgroundColor: colors.bgMuted, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  name: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  stars: { flexDirection: "row", gap: 2, marginTop: 2 },
  comment: { marginTop: spacing.sm, fontSize: font.sm, color: colors.textSecondary, lineHeight: 19 },

  replyBox: { marginTop: spacing.sm, backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.brand },
  replyLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.brand },
  replyText: { marginTop: 2, fontSize: font.sm, color: colors.textSecondary },

  replyRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "flex-end" },
  replyInput: { flex: 1, backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, fontSize: font.sm, color: colors.text, maxHeight: 80 },
  replyBtn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  replyBtnDisabled: { backgroundColor: "#f4b6c2" },
  replyBtnText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.white },
});
