"use client";

import { Apple, ArrowRight, Check, Shield, Smartphone, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Withdraw, from the web Studio.
 *
 * Replaces a modal that took an amount and posted a payout request. Payouts
 * depend on identity verification, tax forms and payout methods that are
 * established in the app, so a web form could take a request the platform was
 * not in a position to honour - the worst kind of failure, because it looks
 * like it worked.
 *
 * So this explains where withdrawals happen and why, shows the balance it is
 * talking about, and sends them there. It is not a dead end: the numbers and
 * the full earning breakdown stay visible on the page behind it.
 */
export function WithdrawInAppModal({
  available,
  pending,
  minimum,
  currency = "$",
  onClose,
}: {
  available: number;
  pending: number;
  minimum: number;
  currency?: string;
  onClose: () => void;
}) {
  const belowMinimum = available < minimum;
  const remaining = Math.max(0, minimum - available);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-[#f0f1f4] px-5 py-4">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[#fff3ec] text-[#fd4605]">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-[#111827]">Withdraw in the Teezer app</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#6b7280]">
              Payouts are completed in the app, where your identity and payout method are verified.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#9ca3af] hover:text-[#111827]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* The balance is repeated here so the modal is self-explanatory -
              it is the number the whole conversation is about. */}
          <div className="grid grid-cols-2 gap-2">
            <Figure label="Available" value={`${currency}${available.toFixed(2)}`} strong />
            <Figure label="Pending" value={`${currency}${pending.toFixed(2)}`} />
          </div>

          {belowMinimum ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <p className="text-[11.5px] leading-relaxed text-amber-800">
                <span className="font-bold">
                  {currency}{remaining.toFixed(2)} to go.
                </span>{" "}
                The minimum payout is {currency}{minimum.toFixed(2)}. Your balance keeps accruing until then.
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-emerald-800">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  <span className="font-bold">You are above the minimum.</span>{" "}
                  Open the app to choose a payout method and request this balance.
                </span>
              </p>
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">
              What you can do in the app
            </p>
            <ul className="flex flex-col gap-2">
              {[
                { icon: Wallet,   text: "Request a payout and track it to your bank or wallet" },
                { icon: Shield,   text: "Complete identity checks and tax forms required for payouts" },
                { icon: ArrowRight, text: "Add or change payout methods, and set a default" },
                { icon: Check,    text: "See a full earnings breakdown by source and by day" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-[11.5px] leading-relaxed text-[#374151]">
                  <span className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-[#fff3ec] text-[#fd4605]">
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#f0f1f4] bg-[#fafbfc] px-5 py-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#111827]">
            <Smartphone className="h-3.5 w-3.5 text-[#fd4605]" />
            Get the Teezer app
          </p>
          <div className="flex gap-2">
            <StoreLink
              href="https://apps.apple.com/app/teezer/id6740000000"
              icon={Apple}
              label="App Store"
            />
            <StoreLink
              href="https://play.google.com/store/apps/details?id=com.teezer.app"
              icon={Smartphone}
              label="Google Play"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-2.5 w-full rounded-xl border border-[#e8eaed] bg-white py-2 text-[12px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]"
          >
            Back to earnings
          </button>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-[#f0f1f4] bg-[#fafbfc] px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">{label}</p>
      <p className={cn("mt-0.5 tabular-nums", strong ? "text-[18px] font-bold text-[#111827]" : "text-[15px] font-semibold text-[#6b7280]")}>
        {value}
      </p>
    </div>
  );
}

function StoreLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      // noreferrer alongside noopener: these are outbound store links and the
      // referrer adds nothing for the user.
      rel="noopener noreferrer"
      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#111827] py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#1f2937]"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
