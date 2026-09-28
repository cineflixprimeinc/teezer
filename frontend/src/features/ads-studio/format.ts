/* Formatting helpers shared across every Ads Manager page. */

export function money(cents: number | null | undefined, currency = "USD"): string {
  const v = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: v >= 1000 ? 0 : 2,
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

/** Money that always keeps 2 decimals (used for per-result / small figures). */
export function moneyPrecise(cents: number | null | undefined, currency = "USD"): string {
  const v = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function compact(n: number | null | undefined): string {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}

export function full(n: number | null | undefined): string {
  return new Intl.NumberFormat().format(Math.round(n ?? 0));
}

export function pct(n: number | null | undefined, digits = 2): string {
  return `${(n ?? 0).toFixed(digits)}%`;
}

export function delta(n: number | null | undefined): string {
  const v = n ?? 0;
  const sign = v > 0 ? "+" : v < 0 ? "" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/** "Jun 9, 2025" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "2:30 PM" */
export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Jun 9" for chart axes */
export function axisDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Placement slug → readable label. */
export function placementLabel(slug: string): string {
  const map: Record<string, string> = {
    in_feed: "In-Feed",
    for_you_feed: "For You Feed",
    following_feed: "Following Feed",
    profile_top: "Profile",
    profile_feed: "Profile Feed",
    hashtag: "Hashtag",
    search: "Search",
    search_results: "Search Results",
    explore: "Explore",
    explore_feed: "Explore Feed",
    inbox: "Inbox",
    suggested_accounts: "Suggested Accounts",
    suggested_videos: "Suggested Videos",
    follow_recommendations: "Follow Recommendations",
    discover_people: "Discover People",
  };
  return map[slug] ?? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
