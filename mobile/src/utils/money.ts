/**
 * One way to render money and coins, for the whole app.
 *
 * Before this existed the app had thirteen private formatters, and they
 * disagreed: the same wallet balance rendered as "$12,345.67" on one screen and
 * "$12345.67" on the next, a withdrawal amount was rounded to whole dollars in
 * the largest text on the Withdraw screen while the line directly beneath it
 * showed the cents, and three screens formatted in the device locale so a
 * German handset read "1.234,50" against an en-US "1,234.50" elsewhere.
 *
 * A balance is the number a creator checks their payout statement against. It
 * has to be the same number everywhere, spelled the same way.
 */

/** Money, always to the cent, always en-US grouping. `$1,234.50`. */
export function usd(n?: number | null): string {
  return `$${plainUsd(n)}`;
}

/** The same, without the symbol - for layouts that set the currency apart. */
export function plainUsd(n?: number | null): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Money with its sign kept: `-$12.50`. The minus belongs outside the symbol,
 * and `Math.abs` in a ledger formatter turns a debit into a credit.
 */
export function signedUsd(n?: number | null): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return `${v < 0 ? "-" : ""}$${plainUsd(Math.abs(v))}`;
}

/**
 * Coins - whole units, grouped. Coins are indivisible, so a fractional value is
 * a bug upstream; rounding it here at least keeps every screen showing the same
 * integer rather than one screen showing `1,234.567`.
 */
export function coins(n?: number | null): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return Math.round(v).toLocaleString("en-US");
}

/**
 * A rate or percentage, without inventing precision: `30`, `7.5`.
 * Trailing zeros are dropped so an admin's "30.00" reads as "30%".
 */
export function pct(n?: number | null): string {
  const v = Number.isFinite(n as number) ? (n as number) : 0;
  return Number(v.toFixed(2)).toString();
}
