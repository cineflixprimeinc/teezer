/**
 * Coin-plan rules, kept identical to the web studio (studio-wallets-coins-page.tsx).
 *
 * Bands are by PRICE, taken from the legend on the gift design sheet. They used to be
 * coin-amount buckets (Starter / Creator / Business / …), which stopped meaning anything
 * once the coin rate started varying with spend: a "1,000–9,999 RC" bucket no longer maps
 * onto any particular price. People shop by what a thing costs, so the filter bands by cost.
 *
 * Verified to cover all 200 plans with no gaps and no overlap.
 */
/** `label` is the exact range (used where there's room to spell it out); `short`
 *  is what the mobile filter chips show. The full labels run to 13 characters,
 *  which made each chip ~150px - barely two fit on a phone before you scroll. */
export type PriceBand = { key: string; label: string; short: string; minUsd: number; maxUsd: number };

export const PRICE_BANDS: PriceBand[] = [
  { key: "all", label: "All",                 short: "All",       minUsd: 0,    maxUsd: Infinity },
  { key: "b1",  label: "$0.19 – $0.99",       short: "< $1",      minUsd: 0,    maxUsd: 0.99     },
  { key: "b2",  label: "$1.19 – $2.99",       short: "$1–3",      minUsd: 1,    maxUsd: 2.99     },
  { key: "b3",  label: "$3.49 – $5.99",       short: "$3–6",      minUsd: 3,    maxUsd: 5.99     },
  { key: "b4",  label: "$6.99 – $9.99",       short: "$6–10",     minUsd: 6,    maxUsd: 9.99     },
  { key: "b5",  label: "$10.99 – $14.99",     short: "$10–15",    minUsd: 10,   maxUsd: 14.99    },
  { key: "b6",  label: "$15.99 – $24.99",     short: "$15–25",    minUsd: 15,   maxUsd: 24.99    },
  { key: "b7",  label: "$25.99 – $39.99",     short: "$25–40",    minUsd: 25,   maxUsd: 39.99    },
  { key: "b8",  label: "$49.99 – $79.99",     short: "$50–80",    minUsd: 49,   maxUsd: 79.99    },
  { key: "b9",  label: "$99.99 – $149.99",    short: "$100–150",  minUsd: 99,   maxUsd: 149.99   },
  { key: "b10", label: "$199.99 – $399.99",   short: "$200–400",  minUsd: 199,  maxUsd: 399.99   },
  { key: "b11", label: "$419.99 – $999.99",   short: "$420–1K",   minUsd: 400,  maxUsd: 999.99   },
  { key: "b12", label: "$1,599.99 – $2,000",  short: "$1.6K+",    minUsd: 1000, maxUsd: Infinity },
];

export const bandFor = (key: string): PriceBand => PRICE_BANDS.find(b => b.key === key) ?? PRICE_BANDS[0];

/**
 * What a plan pays in coins per dollar - the number a buyer actually compares.
 *
 * NOT "$0.01/RC": rounded to cents that reads the same on all 200 plans and is simply
 * wrong on the cheap ones (they are $0.0127/RC). Coins-per-dollar also makes the
 * bigger-plan-better-rate ladder (79 → 100 RC per $1) visible instead of hiding it.
 */
export const coinsPerDollar = (coins: number, priceUsd: number): number =>
  Math.round(coins / Math.max(priceUsd, 0.01));
