import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowDownToLine, BarChart3, Download, FileText, Megaphone, SlidersHorizontal, Ticket, TrendingDown, TrendingUp, type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { AdHeader, HeroCard, Card, StatTile, Badge, Divider, adRowGrid, fmtUsd, fmtSignedUsd, fmtDate } from "./ad-ui";
import { useAdAccountStore, type AdTransaction, type AdTxnKind } from "@/store/ad-account.store";
import { studioApi } from "@/api/studio.api";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const HELP = "Every charge, top-up and credit on your ad account, plus downloadable invoices.";

type Tab = "transactions" | "invoices";

const TXN_ICON: Record<AdTxnKind, LucideIcon> = {
  campaign_spend: Megaphone,
  funds_added: ArrowDownToLine,
  credit_applied: Ticket,
  refund: ArrowDownToLine,
};

function sameMonth(epoch: number, monthsAgo: number): boolean {
  const d = new Date(epoch);
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

export function AdPaymentHistoryScreen() {
  const insets = useSafeAreaInsets();
  const data = useAdAccountStore((s) => s.data);
  useEffect(() => { void useAdAccountStore.getState().hydrate(); }, []);

  // Real lifetime spend from the server (actual delivery charges), not the local
  // committed-budget total.
  const [serverSpend, setServerSpend] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    studioApi.adAccount().then((d) => { if (alive) setServerSpend(d.lifetime_spent_cents / 100); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const [tab, setTab] = useState<Tab>("transactions");
  const txns = data.transactions;

  const { thisMonth, delta } = useMemo(() => {
    const spend = (m: number) => txns.filter((t) => t.amount < 0 && sameMonth(t.date, m)).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const now = spend(0), prev = spend(1);
    return { thisMonth: now, delta: prev > 0 ? Math.round(((now - prev) / prev) * 100) : null };
  }, [txns]);

  const successCount = txns.length;

  return (
    <Screen edges={["top"]}>
      <AdHeader title="Payment History" help={HELP} />

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["transactions", "invoices"] as Tab[]).map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "transactions" ? "Transactions" : "Invoices"}</Text>
            {tab === t && <View style={styles.tabUnderline} />}
          </Pressable>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {/* Total spent */}
        <HeroCard>
          <View style={styles.spentTop}>
            <View>
              <Text style={styles.spentLabel}>Total Spent</Text>
              <Text style={styles.spentValue}>{fmtUsd(serverSpend ?? data.totalAdSpend)}</Text>
              <Text style={styles.spentSub}>All time</Text>
            </View>
            <View style={styles.spentIcon}><BarChart3 size={22} color={colors.brand} strokeWidth={2.2} /></View>
          </View>
        </HeroCard>

        {/* This month + total payments */}
        <View style={adRowGrid}>
          <StatTile
            label="This Month"
            value={fmtUsd(thisMonth)}
            subNode={
              delta == null ? <Text style={styles.tileNeutral}>This month</Text> : (
                <View style={styles.deltaRow}>
                  {delta <= 0 ? <TrendingDown size={13} color={colors.success} strokeWidth={2.4} /> : <TrendingUp size={13} color={colors.brand} strokeWidth={2.4} />}
                  <Text style={[styles.deltaText, { color: delta <= 0 ? colors.success : colors.brand }]}>{Math.abs(delta)}% from last month</Text>
                </View>
              )
            }
          />
          <StatTile label="Total Payments" value={String(successCount)} sub="Recorded" />
        </View>

        {tab === "transactions" ? (
          <>
            <View style={styles.listHead}>
              <Text style={styles.listTitle}>Recent Transactions</Text>
              <Pressable style={styles.filterBtn} onPress={() => Alert.alert("Filter", "Transaction filters are coming soon.")}>
                <SlidersHorizontal size={13} color={colors.textSecondary} strokeWidth={2.2} />
                <Text style={styles.filterText}>Filter</Text>
              </Pressable>
            </View>
            {txns.length === 0 ? (
              <EmptyState icon={Megaphone} title="No transactions yet" body="Launch a campaign or add funds and your activity will show up here." />
            ) : (
              <Card>
                {txns.map((t, i) => (
                  <View key={t.id}>
                    <TxnRow txn={t} />
                    {i < txns.length - 1 && <Divider />}
                  </View>
                ))}
              </Card>
            )}
          </>
        ) : (
          <>
            <View style={styles.listHead}><Text style={styles.listTitle}>Invoices</Text></View>
            {data.invoices.length === 0 ? (
              <EmptyState icon={FileText} title="No invoices yet" body="Invoices are generated on your billing cycle once your campaigns start spending." />
            ) : (
              <Card>
                {data.invoices.map((inv, i) => (
                  <View key={inv.id}>
                    <View style={styles.txn}>
                      <View style={styles.txnIcon}><FileText size={17} color={colors.brand} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txnTitle}>{inv.id}</Text>
                        <Text style={styles.txnDate}>{fmtDate(inv.date)}</Text>
                      </View>
                      <Text style={styles.txnAmount}>{fmtUsd(inv.amount)}</Text>
                      <View style={{ marginLeft: spacing.sm }}><Badge label={inv.status} tone={inv.status === "Paid" ? "success" : "warning"} /></View>
                    </View>
                    {i < data.invoices.length - 1 && <Divider />}
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {/* View all invoices */}
        <Pressable style={styles.viewAll} onPress={() => setTab("invoices")}>
          <Download size={16} color={colors.text} strokeWidth={2.1} />
          <Text style={styles.viewAllText}>View All Invoices</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function TxnRow({ txn }: { txn: AdTransaction }) {
  const Icon = TXN_ICON[txn.kind];
  const positive = txn.amount >= 0;
  const badgeTone = txn.status === "Success" || txn.status === "Paid" ? "success" : txn.status === "Pending" ? "warning" : "muted";
  return (
    <View style={styles.txn}>
      <View style={[styles.txnIcon, positive && styles.txnIconIn]}>
        <Icon size={17} color={positive ? colors.success : colors.brand} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txnTitle}>{txn.title}</Text>
        <Text style={styles.txnDate}>{fmtDate(txn.date)}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 5 }}>
        <Text style={[styles.txnAmount, { color: positive ? colors.success : colors.text }]}>{fmtSignedUsd(txn.amount)}</Text>
        <Badge label={txn.status} tone={badgeTone} />
      </View>
    </View>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon size={28} color={colors.brand} strokeWidth={2} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginTop: spacing.xs },
  tab: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  tabText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.textMuted },
  tabTextActive: { color: colors.brand },
  tabUnderline: { position: "absolute", bottom: -StyleSheet.hairlineWidth, height: 2.5, width: 90, borderRadius: 2, backgroundColor: colors.brand },

  spentTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  spentLabel: { fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightBold },
  spentValue: { marginTop: 4, fontSize: 28, fontWeight: font.weightHeavy, color: colors.text },
  spentSub: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.weightMedium },
  spentIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(254,44,85,0.12)", alignItems: "center", justifyContent: "center" },

  tileNeutral: { marginTop: 4, fontSize: font.xs, color: colors.textFaint, fontWeight: font.weightMedium },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  deltaText: { fontSize: font.xs, fontWeight: font.weightBold },

  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: 2 },
  listTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 6 },
  filterText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary },

  txn: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  txnIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  txnIconIn: { backgroundColor: "#e7f7ee" },
  txnTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  txnDate: { marginTop: 1, fontSize: font.xs, color: colors.textMuted },
  txnAmount: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  viewAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, paddingVertical: 13, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  viewAllText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },

  empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  emptyTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  emptyBody: { marginTop: spacing.xs, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center", maxWidth: 300 },
});
