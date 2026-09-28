import { useMemo, useState } from "react";
import {
  View, Text, Pressable, ScrollView, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ds } from "@/theme/design";
import { walletApi, type WalletTransaction, type WalletTxType } from "@/api/wallet.api";
import { useAuthStore } from "@/store/auth.store";
import { formatDayMonth, formatClock12 } from "@/utils/date-format";

/**
 * Every coin movement, filterable - the history behind the Gifts & coins
 * header's clock button.
 *
 * The ledger is the authority on what a gift was WORTH versus what actually
 * landed: `gross_coins` is what the sender spent, `commission_coins` is
 * Reelsoo's cut, and `net_coins` is what reached the balance. A received gift
 * that only ever showed its net figure looked like the sender had sent less
 * than they did, so both are stated on the row rather than one.
 */

const groupNum = (n: number) => Math.abs(n).toLocaleString();
const usd = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The filter rail. `type` omitted = the unfiltered ledger. */
const FILTERS: { label: string; type?: WalletTxType }[] = [
  { label: "All" },
  { label: "Gifts received", type: "gift_received" },
  { label: "Gifts sent", type: "gift_sent" },
  { label: "Coin purchases", type: "coin_purchase" },
  { label: "Premium bonus", type: "premium_bonus" },
  { label: "Ad income", type: "ad_income" },
];

const EMPTY: Record<string, string> = {
  "All": "Your coin activity will show up here.",
  "Gifts received": "Gifts people send you will show up here.",
  "Gifts sent": "Gifts you send will show up here.",
  "Coin purchases": "Coins you buy will show up here.",
  "Premium bonus": "Bonus coins from Premium will show up here.",
  "Ad income": "Earnings from ads will show up here.",
};

function BackGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDayMonth(d) + " · " + formatClock12(d);
}

function Row({ t }: { t: WalletTransaction }) {
  // Coins where the row moved coins, dollars where it did not (ad income is a
  // USD-only row, so net_coins alone would render it as a flat "0").
  const movesCoins = t.net_coins !== 0;
  const up = movesCoins ? t.net_coins > 0 : t.amount_usd > 0;
  const amount = movesCoins
    ? `${up ? "+" : "-"}${groupNum(t.net_coins)}`
    : `${up ? "+" : "-"}${usd(t.amount_usd)}`;

  /* Only worth spelling out when Reelsoo actually took a cut - a purchase or a
     sent gift has none, and printing "0 deducted" on those is noise. */
  const deducted = t.commission_coins > 0;

  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {t.description || t.type.replace(/_/g, " ")}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{when(t.created_at)}</Text>

        {deducted && (
          <Text style={styles.breakdown} numberOfLines={1}>
            {groupNum(t.gross_coins)} sent · {groupNum(t.commission_coins)} fee ·{" "}
            <Text style={styles.breakdownNet}>{groupNum(t.net_coins)} to you</Text>
          </Text>
        )}
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[styles.amount, up ? styles.amountUp : styles.amountDown]}>{amount}</Text>
        {movesCoins && t.amount_usd !== 0 && <Text style={styles.amountSub}>{usd(t.amount_usd)}</Text>}
      </View>
    </View>
  );
}

export function WalletHistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const authed = useAuthStore((s) => s.status === "authenticated");
  const [tab, setTab] = useState("All");

  const type = FILTERS.find((f) => f.label === tab)?.type;

  const q = useInfiniteQuery({
    queryKey: ["wallet-history", type ?? "all"],
    queryFn: ({ pageParam = 1 }) => walletApi.transactions(pageParam as number, 20, type),
    initialPageParam: 1,
    getNextPageParam: (last: any) =>
      last?.page != null && last?.hasMore ? last.page + 1 : undefined,
    enabled: authed,
    staleTime: 30_000,
  });

  const rows = useMemo(
    () => (q.data?.pages ?? []).flatMap((p: any) => p.items ?? []),
    [q.data],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <BackGlyph />
        </Pressable>
        <Text style={styles.title}>Transaction history</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.railWrap}
        contentContainerStyle={styles.rail}
      >
        {FILTERS.map((f) => {
          const on = f.label === tab;
          return (
            <Pressable
              key={f.label}
              onPress={() => setTab(f.label)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!authed ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Log in to see your history</Text>
        </View>
      ) : q.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={ds.accent} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(t: WalletTransaction) => String(t.id)}
          renderItem={({ item }) => <Row t={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage(); }}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={q.refetch} tintColor={ds.textMuted} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>{EMPTY[tab]}</Text>
            </View>
          }
          ListFooterComponent={
            q.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 18 }} color={ds.accent} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ds.lineSoft,
  },
  title: { flex: 1, fontSize: 15.5, fontWeight: "700", color: ds.text },

  railWrap: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ds.lineSoft },
  rail: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 14, height: 32, borderRadius: 999,
    backgroundColor: ds.surfaceSunken, alignItems: "center", justifyContent: "center",
  },
  chipOn: { backgroundColor: ds.text },
  chipText: { fontSize: 12.5, fontWeight: "600", color: ds.textDim },
  chipTextOn: { color: ds.onDark },

  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ds.lineSoft,
  },
  rowTitle: { fontSize: 14, fontWeight: "600", color: ds.text },
  rowMeta: { fontSize: 12, color: ds.textMuted },
  breakdown: { fontSize: 11.5, color: ds.textFaint },
  breakdownNet: { color: ds.text, fontWeight: "700" },

  amount: { fontSize: 15, fontWeight: "800" },
  amountUp: { color: "#12A867" },
  amountDown: { color: ds.text },
  amountSub: { fontSize: 11.5, color: ds.textMuted },

  center: { paddingVertical: 56, paddingHorizontal: 30, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: ds.text },
  emptyBody: { fontSize: 12.5, color: ds.textMuted, textAlign: "center", lineHeight: 18 },
});
