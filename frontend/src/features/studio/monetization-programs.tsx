"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award, Ban, Check, ChevronRight, Loader2, Lock, Smartphone, Sparkles, X,
} from "lucide-react";
import {
  monetizationProgramsService,
  type MonetizationProgramRow,
  type ProgramRequirement,
  type ProgramStatus,
} from "@/services/monetization-programs.service";
import { cn } from "@/lib/utils";

/**
 * "Eligible Earning Opportunities", built on the REAL monetization programmes.
 *
 * What this replaces: a hardcoded list of five keys with invented copy, which
 * could disagree with the app about what programmes exist, what they are called
 * and whether the creator qualifies - and did, because programmes are
 * admin-editable records.
 *
 * Everything here comes from GET /studio/monetization/programs?surface=web, the
 * same endpoint the mobile app calls. Titles, requirements, thresholds, current
 * progress and status are the platform's, so the web and the app cannot drift.
 *
 * Actions stay in the app on purpose. The web Studio shows a creator exactly
 * where they stand and what is left; joining, enrolling and withdrawing happen
 * where the identity and payout flows already live.
 */

const STATUS_STYLE: Record<ProgramStatus, { label: string; cls: string }> = {
  active:      { label: "Active",      cls: "bg-[#dcfce7] text-[#16a34a]" },
  eligible:    { label: "Eligible",    cls: "bg-[#dbeafe] text-[#1d4ed8]" },
  locked:      { label: "Locked",      cls: "bg-[#f3f4f6] text-[#6b7280]" },
  coming_soon: { label: "Coming soon", cls: "bg-[#fef3c7] text-[#b45309]" },
  disabled:    { label: "Unavailable", cls: "bg-[#f3f4f6] text-[#9ca3af]" },
};

export function MonetizationPrograms() {
  const [open, setOpen] = useState<MonetizationProgramRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["studio", "monetization-programs"],
    queryFn: () => monetizationProgramsService.list(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-[11px] text-[#9ca3af]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading programmes…
      </div>
    );
  }

  // A failed fetch must not render an empty list that reads as "you qualify for
  // nothing" - that is a materially different and discouraging message.
  if (isError || !data) {
    return (
      <p className="px-4 py-6 text-[11px] text-[#9ca3af]">
        Programmes could not be loaded. Refresh to try again.
      </p>
    );
  }

  if (!data.enabled) {
    return (
      <p className="px-4 py-6 text-[11px] text-[#9ca3af]">
        Monetization is not currently open on this platform.
      </p>
    );
  }

  if (data.programs.length === 0) {
    return (
      <p className="px-4 py-6 text-[11px] text-[#9ca3af]">
        No earning programmes are available in your region yet.
      </p>
    );
  }

  return (
    <>
      <div className="divide-y divide-[#f8f9fb]">
        {data.programs.map((p) => {
          const style = STATUS_STYLE[p.status] ?? STATUS_STYLE.locked;

          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setOpen(p)}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[11px] transition hover:bg-[#fafafa]"
            >
              <div
                className={cn(
                  "grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg",
                  p.status === "active" ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fff0f4] text-[#fe2c55]",
                )}
              >
                {p.status === "active" ? <Check className="h-3.5 w-3.5" /> : <Award className="h-3.5 w-3.5" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[#111827]">{p.label}</p>
                <p className="truncate text-[9.5px] text-[#9ca3af]">
                  {p.status === "active"
                    ? "You are earning from this"
                    : `${p.met_count} of ${p.total_count} requirements met`}
                </p>
              </div>

              {/* Progress is only meaningful while there is something left to
                  meet; on an active programme it would always read 100%. */}
              {p.status !== "active" && p.total_count > 0 && (
                <span className="hidden w-16 flex-shrink-0 sm:block">
                  <span className="block h-1 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <span
                      className="block h-full rounded-full bg-[#fe2c55]"
                      style={{ width: `${p.percent}%` }}
                    />
                  </span>
                </span>
              )}

              <span className={cn("flex-shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8.5px] font-bold", style.cls)}>
                {style.label}
              </span>

              <ChevronRight className="h-3 w-3 flex-shrink-0 text-[#c3c7d1]" />
            </button>
          );
        })}
      </div>

      {open && <ProgramCriteriaModal program={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * The criteria sheet, matching what the app shows for the same programme:
 * every requirement, the creator's current number against the target, and what
 * to do about the ones not met.
 */
function ProgramCriteriaModal({
  program, onClose,
}: {
  program: MonetizationProgramRow;
  onClose: () => void;
}) {
  const style = STATUS_STYLE[program.status] ?? STATUS_STYLE.locked;

  // Blockers first: a strike is not a milestone to grind toward, and burying it
  // under progress bars hides the one thing actually preventing enrolment.
  const blockers = program.requirements.filter((r) => r.kind === "blocker");
  const pending  = program.requirements.filter((r) => r.kind === "progress");
  const met      = program.requirements.filter((r) => r.kind === "met");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[90vh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-[#f0f1f4] px-5 py-4">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[#fff0f4] text-[#fe2c55]">
            <Award className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-bold text-[#111827]">{program.label}</p>
              <span className={cn("flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold", style.cls)}>
                {style.label}
              </span>
            </div>
            {program.description && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#6b7280]">{program.description}</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#9ca3af] hover:text-[#111827]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {program.total_count > 0 && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold text-[#374151]">
                  {program.met_count} of {program.total_count} requirements met
                </span>
                <span className="text-[11px] font-bold tabular-nums text-[#fe2c55]">{program.percent}%</span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                <span className="block h-full rounded-full bg-[#fe2c55] transition-all" style={{ width: `${program.percent}%` }} />
              </span>
            </div>
          )}

          {program.enrolment_removed_until && (
            <Notice tone="danger" icon={Ban}>
              Enrolment is closed until{" "}
              {new Date(program.enrolment_removed_until).toLocaleDateString()}. Meeting the
              requirements again before then will not reopen it.
            </Notice>
          )}

          {blockers.length > 0 && (
            <Section title="Blocking your enrolment">
              {blockers.map((r) => <Requirement key={r.id} req={r} />)}
            </Section>
          )}

          {pending.length > 0 && (
            <Section title="Still to reach">
              {pending.map((r) => <Requirement key={r.id} req={r} />)}
            </Section>
          )}

          {met.length > 0 && (
            <Section title="Already met">
              {met.map((r) => <Requirement key={r.id} req={r} />)}
            </Section>
          )}

          {program.unlocks.length > 0 && (
            <Section title="What this unlocks">
              <ul className="flex flex-col gap-1.5">
                {program.unlocks.map((u) => (
                  <li key={u} className="flex items-start gap-2 text-[11.5px] text-[#374151]">
                    <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#fe2c55]" />
                    {u}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(program.commission_rate != null || program.min_payout != null) && (
            <Section title="Terms">
              <dl className="grid grid-cols-2 gap-2 text-[11.5px]">
                {program.commission_rate != null && (
                  <div>
                    <dt className="text-[#9ca3af]">Platform share</dt>
                    <dd className="font-semibold text-[#111827]">{program.commission_rate}%</dd>
                  </div>
                )}
                {program.min_payout != null && (
                  <div>
                    <dt className="text-[#9ca3af]">Minimum payout</dt>
                    <dd className="font-semibold text-[#111827]">${program.min_payout}</dd>
                  </div>
                )}
              </dl>
            </Section>
          )}

          {!program.availability.worldwide && program.availability.countries.length > 0 && (
            <Section title="Available in">
              <p className="text-[11.5px] leading-relaxed text-[#6b7280]">
                {program.availability.countries.map((c) => c.name).join(", ")}
              </p>
            </Section>
          )}
        </div>

        {/* Enrolment and payouts live in the app, so the sheet ends by saying so
            rather than offering a web button that cannot complete the journey. */}
        <div className="border-t border-[#f0f1f4] bg-[#fafbfc] px-5 py-4">
          <div className="flex items-start gap-2.5">
            <Smartphone className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#fe2c55]" />
            <div>
              <p className="text-[12px] font-semibold text-[#111827]">
                Open the Teezer app for the full programme
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#6b7280]">
                Joining, enrolment and payouts are handled in the app, where identity and
                payment details are verified. This page tracks your progress.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Requirement({ req }: { req: ProgramRequirement }) {
  const isBlocker = req.kind === "blocker";

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span
        className={cn(
          "mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full",
          req.met ? "bg-[#dcfce7] text-[#16a34a]" : isBlocker ? "bg-[#fee2e2] text-[#dc2626]" : "bg-[#f3f4f6] text-[#9ca3af]",
        )}
      >
        {req.met ? <Check className="h-2.5 w-2.5" /> : isBlocker ? <Ban className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("text-[11.5px] font-medium", req.met ? "text-[#6b7280]" : "text-[#111827]")}>
            {req.label}
          </p>
          {/* A null target is a yes/no rule, so a "3 / null" counter would be
              nonsense - only numeric targets get one. */}
          {req.target != null && (
            <span className="flex-shrink-0 text-[10.5px] tabular-nums text-[#9ca3af]">
              {formatNum(req.current)} / {formatNum(req.target)}
            </span>
          )}
        </div>

        {req.sub && <p className="mt-0.5 text-[10.5px] text-[#9ca3af]">{req.sub}</p>}

        {!req.met && req.action && (
          <p className="mt-0.5 text-[10.5px] text-[#fe2c55]">{req.action}</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">{title}</p>
      {children}
    </div>
  );
}

function Notice({
  tone, icon: Icon, children,
}: {
  tone: "danger" | "info";
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed",
        tone === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-blue-200 bg-blue-50 text-blue-700",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}
