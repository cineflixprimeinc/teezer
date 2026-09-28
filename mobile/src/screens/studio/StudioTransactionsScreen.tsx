import { useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { walletApi, type WalletTransaction } from "@/api/wallet.api";
import { TX_TYPES, txMeta, fmtRC, fmtUSD, fmtTxDate } from "./wallet-tx";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const PER_PAGE = 25;

/**
 * Studio → Wallets & Coins → Transaction History.
 *
 * A screen, not a sheet: the ledger is long, paged and filtered, and a sheet fights the
 * list for the same vertical drag - you scroll the history and the sheet dismisses.
 *
 * Filters mirror the web modal (all + one chip per transaction type), and each row carries
 * the running balance the summary card has no room for, which is what people open a
 * history to reconcile.
 */
export function StudioTransactionsScreen() {
  const nav = useNavigation<any>();
  const qc = useQueryClient();
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["wallet-tx-page", type, page],
    // transactions() is positional now and resolves to { items, hasMore, page }
    // - it no longer returns the paginator's meta.
    queryFn: () => walletApi.transactions(page, PER_PAGE, type === "all" ? undefined : type),
    // Keep the current page on screen while the next loads, so paging doesn't flash
    // the list back to a skeleton.
    placeholderData: prev => prev,
  });

  const rows = q.data?.items ?? [];
  /* No total comes back any more, so the footer counts what has actually been
     seen rather than inventing a total it cannot know. `hasMore` is the only
     honest signal for whether another page exists. */
  const hasMore = q.data?.hasMore ?? false;
  const total = (page - 1) * PER_PAGE + rows.length;
  const last = hasMore ? page + 1 : page;

  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to   = Math.min(page * PER_PAGE, total);

  const chips = useMemo(() => [{ key: "all", label: "All" }, ...TX_TYPES], []);

  return (
    <Screen edges={["top"]} bg={colors.bgMuted}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.back} onPress={() => nav.goBack()}>
          <ChevronLeft size={20} color={colors.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Transaction History</Text>
          <Text style={s.sub}>
            {q.isLoading
              ? "Loading…"
              : total === 0
              ? "Nothing here yet"
              : `${fmtRC(total)} transaction${total === 1 ? "" : "s"}`}
          </Text>
        </View>
      </View>

      {/* Type filter - same set the web modal offers */}
      <View style={s.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {chips.map(c => (
            <Pressable
              key={c.key}
              onPress={() => { setType(c.key); setPage(1); }}
              style={[s.chip, type === c.key && s.chipOn]}
            >
              <Text style={[s.chipTxt, type === c.key && s.chipTxtOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {q.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={56} radius={radius.md} />
          ))}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={t => String(t.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching && !q.isFetching}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["wallet-tx-page"] })}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="receipt-outline" size={26} color={colors.textFaint} />
              </View>
              <Text style={s.emptyTitle}>
                {type === "all" ? "No transactions yet" : `No ${txMeta(type).label.toLowerCase()} transactions`}
              </Text>
              <Text style={s.emptySub}>
                {type === "all" ? "Buy coins or receive a gift to get started" : "Try a different filter"}
              </Text>
              {type !== "all" && (
                <Pressable style={s.reset} onPress={() => { setType("all"); setPage(1); }}>
                  <Text style={s.resetTxt}>Show all</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => <Row tx={item} />}
          ListFooterComponent={
            last > 1 ? (
              <View style={s.pager}>
                <Pressable
                  style={[s.pageBtn, (page <= 1 || q.isFetching) && s.pageOff]}
                  disabled={page <= 1 || q.isFetching}
                  onPress={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} color={colors.textSecondary} strokeWidth={2} />
                  <Text style={s.pageTxt}>Prev</Text>
                </Pressable>

                <Text style={s.pageInfo}>
                  {q.isFetching ? "Loading…" : `${from}–${to} of ${fmtRC(total)}`}
                </Text>

                <Pressable
                  style={[s.pageBtn, (page >= last || q.isFetching) && s.pageOff]}
                  disabled={page >= last || q.isFetching}
                  onPress={() => setPage(p => Math.min(last, p + 1))}
                >
                  <Text style={s.pageTxt}>Next</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : rows.length > 0 ? (
              <Text style={s.endNote}>{fmtRC(total)} of {fmtRC(total)} shown</Text>
            ) : null
          }
        />
      )}

      {q.isFetching && !q.isLoading && (
        <View style={s.busy} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.brand} />
        </View>
      )}
    </Screen>
  );
}

function Row({ tx }: { tx: WalletTransaction }) {
  const m = txMeta(tx.type);
  const inCoins = tx.net_coins !== 0;
  const positive = inCoins ? tx.net_coins > 0 : tx.amount_usd > 0;

  const amount = inCoins
    ? `${tx.net_coins > 0 ? "+" : "-"} ${fmtRC(Math.abs(tx.net_coins))} RC`
    : tx.amount_usd !== 0
    ? `${tx.amount_usd > 0 ? "+" : "-"} ${fmtUSD(Math.abs(tx.amount_usd))}`
    : "-";

  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: m.bg }]}>
        <Ionicons name={m.ion} size={16} color={m.color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.rowDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={s.rowDate}>{fmtTxDate(tx.created_at)}</Text>

        {/* Gross → commission → net, only where a commission was actually taken. */}
        {tx.commission_coins > 0 && (
          <Text style={s.rowSplit}>
            {fmtRC(tx.gross_coins)} RC gross · −{fmtRC(tx.commission_coins)} RC commission
          </Text>
        )}
      </View>

      <View style={s.rowRight}>
        <Text style={[s.rowAmt, { color: positive ? colors.success : colors.brand }]}>{amount}</Text>
        {/* The running balance - the reason to open a ledger at all. */}
        <Text style={s.rowBal}>{fmtRC(tx.balance_after_coins)} RC</Text>
        <View style={[s.status, tx.status !== "completed" && s.statusPending]}>
          <Text style={[s.statusTxt, tx.status !== "completed" && s.statusTxtPending]}>
            {tx.status ?? "completed"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted,
  },
  title: { fontSize: font.lg, fontWeight: "900", color: colors.text },
  sub: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },

  filterWrap: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterRow: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  chip: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: font.xs, fontWeight: "800", color: colors.textMuted },
  chipTxtOn: { color: "#fff" },

  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  rowDesc: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  rowDate: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
  rowSplit: { fontSize: 10, color: colors.textFaint, marginTop: 2 },
  rowRight: { alignItems: "flex-end", gap: 3 },
  rowAmt: { fontSize: font.sm, fontWeight: "900" },
  rowBal: { fontSize: 10, color: colors.textFaint },
  status: { backgroundColor: "#dcfce7", borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  statusPending: { backgroundColor: "#fef3c7" },
  statusTxt: { fontSize: 9, fontWeight: "800", color: colors.success },
  statusTxtPending: { color: "#d97706" },

  empty: { alignItems: "center", paddingVertical: spacing.xxl * 2, gap: 4 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: font.md, fontWeight: "800", color: colors.textSecondary },
  emptySub: { fontSize: font.xs, color: colors.textFaint },
  reset: {
    marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  resetTxt: { fontSize: font.sm, fontWeight: "800", color: colors.textSecondary },

  pager: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  pageBtn: {
    flexDirection: "row", alignItems: "center", gap: 2,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: colors.card,
  },
  pageOff: { opacity: 0.4 },
  pageTxt: { fontSize: font.sm, fontWeight: "800", color: colors.textSecondary },
  pageInfo: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted },
  endNote: { textAlign: "center", marginTop: spacing.md, fontSize: font.xs, color: colors.textFaint },

  busy: { position: "absolute", top: 116, alignSelf: "center" },
});
