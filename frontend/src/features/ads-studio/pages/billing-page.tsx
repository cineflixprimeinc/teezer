"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Wallet, CircleDollarSign, ShieldCheck, Receipt, X,
} from "lucide-react";
import {
  Card, CardHead, StatTile, EmptyState, Skeleton, PrimaryButton, GhostButton, PageHeader,
} from "../ui";
import { money, shortDate, shortTime } from "../format";
import { adsService, type AdAccountData, type AdLedgerEntry } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { toast } from "sonner";

const QUICK_CHIPS = [10, 25, 50, 100];

function isCredit(entry: AdLedgerEntry): boolean {
  return entry.type === "topup" || entry.amount_cents > 0;
}

function typeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Add funds modal ─────────────────────────────────────────────────────── */
function AddFundsModal({
  currency, onClose, onDone,
}: { currency: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState("25");
  const [busy, setBusy] = useState(false);
  const num = Number(amount);
  const valid = !Number.isNaN(num) && num >= 1;

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await adsService.topup(Math.round(num * 100));
      toast.success("Balance updated");
      onClose();
      await onDone();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#eef0f3] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#111827]">Add funds</h2>
            <p className="mt-0.5 text-[12px] text-[#9ca3af]">Top up your Teezer ad balance.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] transition hover:bg-[#f3f4f6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1.5 block text-[12px] font-semibold text-[#6b7280]">Amount</label>
        <div className="flex items-center rounded-xl border border-[#e5e7eb] bg-white px-3 focus-within:border-[#fd4605]">
          <span className="text-[15px] font-bold text-[#9ca3af]">{currency}</span>
          <input
            type="number"
            min={1}
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-transparent px-2 py-2.5 text-[15px] font-bold tabular-nums text-[#111827] outline-none"
            placeholder="0"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_CHIPS.map((c) => {
            const on = num === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setAmount(String(c))}
                className={
                  "rounded-full px-3.5 py-1.5 text-[13px] font-bold transition " +
                  (on
                    ? "bg-[#fd4605] text-white"
                    : "border border-[#eef0f3] bg-white text-[#6b7280] hover:bg-[#f9fafb]")
                }
              >
                {money(c * 100, currency)}
              </button>
            );
          })}
        </div>

        {!valid && amount !== "" && (
          <p className="mt-2 text-[12px] font-medium text-[#e11d48]">Enter an amount of at least 1.</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={confirm} className={!valid || busy ? "pointer-events-none opacity-50" : ""}>
            {busy ? "Processing…" : "Add funds"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function BillingPage() {
  const [data, setData] = useState<AdAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adsService.adAccount());
      setError(null);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currency = data?.currency ?? "USD";
  const account = data?.account;
  const ledger = data?.ledger ?? [];
  const statusLabel = account
    ? account.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "-";

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" subtitle="Manage your ad balance, payment method and transaction history.">
        <PrimaryButton onClick={() => setModal(true)}>
          <Plus className="h-4 w-4" /> Add funds
        </PrimaryButton>
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[128px]" />)
        ) : (
          <>
            <StatTile icon={Wallet} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
              label="Balance" value={money(data?.balance_cents, currency)} hint="Available to spend" />
            <StatTile icon={CircleDollarSign} iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]"
              label="Lifetime spent" value={money(account?.lifetime_spent_cents, currency)} hint="All-time" />
            <StatTile icon={ShieldCheck} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
              label="Account status" value={statusLabel} hint={account?.name ?? ""} />
          </>
        )}
      </div>

      {/* Payment methods */}
      <Card>
        <CardHead title="Payment method" subtitle="Ads are charged against your Teezer balance." />
        <div className="p-5">
          <div className="flex items-center justify-between rounded-xl border border-[#eef0f3] bg-[#f8f9fb] px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff3ec]">
                <Wallet className="h-5 w-5 text-[#fd4605]" />
              </span>
              <div>
                <p className="text-[13px] font-bold text-[#111827]">Teezer balance</p>
                <p className="text-[12px] text-[#9ca3af] tabular-nums">{money(data?.balance_cents, currency)} available</p>
              </div>
            </div>
            <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-bold text-[#15803d]">
              Default
            </span>
          </div>
          <p className="mt-3 text-[12px] text-[#9ca3af]">
            Card and PayPal top-ups settle to your Teezer balance, which is then used to fund your active campaigns.
          </p>
        </div>
      </Card>

      {/* Transaction history */}
      <Card className="overflow-hidden">
        <CardHead title="Transaction history" subtitle="Top-ups and ad spend on your account." />
        <div className="p-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : ledger.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              desc="Your top-ups and campaign charges will appear here once you start spending."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">
                    <th className="px-4 py-3 font-bold">Date</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Description</th>
                    <th className="px-4 py-3 text-right font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => {
                    const credit = isCredit(e);
                    return (
                      <tr key={e.id} className="border-t border-[#f1f3f5]">
                        <td className="px-4 py-3 text-[12px] tabular-nums text-[#6b7280]">
                          {shortDate(e.created_at)}
                          <span className="block text-[11px] text-[#9ca3af]">{shortTime(e.created_at)}</span>
                        </td>
                        <td className="px-4">
                          <span className={
                            "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold " +
                            (credit ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f3f4f6] text-[#6b7280]")
                          }>
                            {typeLabel(e.type)}
                          </span>
                        </td>
                        <td className="px-4 text-[13px] text-[#374151]">{e.description || "-"}</td>
                        <td className={
                          "px-4 text-right text-[13px] font-bold tabular-nums " +
                          (credit ? "text-[#16a34a]" : "text-[#111827]")
                        }>
                          {credit ? "+" : ""}{money(Math.abs(e.amount_cents), currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {modal && (
        <AddFundsModal currency={currency} onClose={() => setModal(false)} onDone={load} />
      )}
    </div>
  );
}
