import { colors } from "@/constants/colors";
import type { Ionicons } from "@expo/vector-icons";

/**
 * How a wallet transaction is labelled and coloured. Shared by the wallets summary card
 * and the full history screen, so the same row can't be described two different ways.
 *
 * The set mirrors the web studio's TX_META.
 */
type IonName = React.ComponentProps<typeof Ionicons>["name"];

export type TxMeta = { label: string; color: string; bg: string; ion: IonName };

const META: Record<string, TxMeta> = {
  coin_purchase:       { label: "Coin Purchase",  color: colors.brand,      bg: colors.brandTint, ion: "card-outline" },
  gift_received:       { label: "Gift Received",  color: "#7c3aed",         bg: "#ede9fe",        ion: "gift-outline" },
  gift_sent:           { label: "Gift Sent",      color: "#7c3aed",         bg: "#ede9fe",        ion: "arrow-up-outline" },
  platform_commission: { label: "Commission",     color: colors.textMuted,  bg: "#f3f4f6",        ion: "business-outline" },
  bonus_coins:         { label: "Bonus Coins",    color: "#7c3aed",         bg: "#ede9fe",        ion: "sparkles-outline" },
  promotion_spend:     { label: "Promotion",      color: "#d97706",         bg: "#fef3c7",        ion: "megaphone-outline" },
  refund:              { label: "Refund",         color: "#0891b2",         bg: "#cffafe",        ion: "refresh-outline" },
  admin_adjustment:    { label: "Adjustment",     color: "#374151",         bg: "#f3f4f6",        ion: "star-outline" },
  withdrawal:          { label: "Cashout",        color: "#d97706",         bg: "#fef3c7",        ion: "arrow-down-outline" },
  credit:              { label: "Credit",         color: colors.success,    bg: "#dcfce7",        ion: "trending-up-outline" },
  debit:               { label: "Debit",          color: colors.brand,      bg: colors.brandTint, ion: "arrow-up-outline" },
};

/** Filter chips, in the order the web modal lists them. */
export const TX_TYPES: { key: string; label: string }[] =
  Object.entries(META).map(([key, m]) => ({ key, label: m.label }));

export const txMeta = (type: string): TxMeta =>
  META[type] ?? { label: type, color: colors.textMuted, bg: "#f3f4f6", ion: "ellipse-outline" };

export const fmtRC = (n: number) => n.toLocaleString("en-US");

export const fmtUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtTxDate = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date} • ${time}`;
};
