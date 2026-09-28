import { useQuery } from "@tanstack/react-query";
import { walletApi } from "@/api/wallet.api";

/**
 * The platform's money rules - the coin rate, Reelsoo's cut and the payout
 * floor - read from the server, in one place.
 *
 * Every one of these is set by an admin, and the app used to carry its own copy
 * of each. The result was that Reelsoo told a creator three different minimum
 * withdrawals depending on which screen they were looking at ($10 on the
 * Wallets card, $50 in the rules sheet, $100 in Studio settings) while the
 * Withdraw screen quietly enforced the real one. The coin rate and the
 * commission were duplicated the same way, with fallbacks of 100 and 30 that
 * were only ever right by coincidence.
 *
 * `null` means "not loaded yet", and callers must render it as such. That is
 * deliberate: a dash for half a second is honest, whereas a hard-coded default
 * is a number the platform may not actually charge, shown with full confidence.
 *
 * Shares the `wallet-payouts` cache entry with the Withdraw and programme
 * screens, so adopting this hook costs no extra request.
 */
export type MoneyRules = {
  /** Coins per USD, e.g. 100 means 100 coins = $1. */
  coinsPerUsd: number | null;
  /** Reelsoo's cut, applied at withdrawal. Gifts credit in full. */
  commissionPct: number | null;
  /** What the creator keeps, derived - never stored separately. */
  creatorSharePct: number | null;
  /** The payout floor, in USD. */
  minWithdrawUsd: number | null;
  loading: boolean;
};

export function useMoneyRules(): MoneyRules {
  const q = useQuery({
    queryKey: ["wallet-payouts"],
    queryFn: walletApi.payouts,
    staleTime: 60_000,
  });

  const commission = num(q.data?.commission_rate);

  return {
    coinsPerUsd: num(q.data?.coin_usd_rate),
    commissionPct: commission,
    // Derived, so the two halves can never be shown adding up to something
    // other than 100 - they were separate constants before, 30 and 70.
    creatorSharePct: commission === null ? null : 100 - commission,
    minWithdrawUsd: num(q.data?.minimum_withdraw),
    loading: q.isLoading,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
