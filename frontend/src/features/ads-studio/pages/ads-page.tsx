"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Plus, Film, MonitorPlay } from "lucide-react";
import {
  Card, StatusPill, DeliveryDot, EmptyState, Skeleton, PrimaryButton, PageHeader,
} from "../ui";
import { money, moneyPrecise, full } from "../format";
import { adsService, type AdPromotionsOverview, type AdPromotionRow } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { toast } from "sonner";

function ctaLabel(cta: string): string {
  const map: Record<string, string> = {
    learn_more: "Learn More",
    shop_now: "Shop Now",
    sign_up: "Sign Up",
    watch_more: "Watch More",
    follow: "Follow",
    view_profile: "View Profile",
    download: "Download",
    book_now: "Book Now",
    contact_us: "Contact Us",
  };
  return map[cta] ?? cta.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function adName(c: AdPromotionRow): string {
  return c.headline || c.display_name || c.video?.title || `Promotion #${c.id}`;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "pending_review", label: "In review" },
  { key: "completed", label: "Completed" },
  { key: "draft", label: "Draft" },
] as const;

function TogglePill({ row, onDone }: { row: AdPromotionRow; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const on = row.status === "active";
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await adsService.toggle(row.id, !on);
      toast.success(on ? "Ad paused" : "Ad resumed");
      await onDone();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold transition disabled:opacity-50 " +
        (on
          ? "bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0]"
          : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]")
      }
    >
      <span className={"h-2 w-2 rounded-full " + (on ? "bg-[#22c55e]" : "bg-[#9ca3af]")} />
      {on ? "On" : "Off"}
    </button>
  );
}

function AdCard({ row, onDone }: { row: AdPromotionRow; onDone: () => Promise<void> }) {
  const cover = row.video?.thumbnail_url ?? null;
  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Creative cover */}
      <div className="relative aspect-video w-full bg-[#f1f3f5]">
        {cover ? (
          <Image src={cover} alt="" fill className="object-cover" unoptimized />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Film className="h-8 w-8 text-[#9ca3af]" />
          </div>
        )}
        <span className="absolute left-3 top-3">
          <StatusPill status={row.status} />
        </span>
        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2 py-0.5 backdrop-blur">
          <DeliveryDot delivery={row.delivery} />
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[14px] font-bold text-[#111827]">{adName(row)}</p>
        {row.body && (
          <p className="mt-1 line-clamp-2 text-[12px] text-[#6b7280]">{row.body}</p>
        )}

        {/* Metrics */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f8f9fb] p-3">
          <div>
            <p className="text-[11px] text-[#9ca3af]">Spent</p>
            <p className="text-[13px] font-bold text-[#111827] tabular-nums">{money(row.spent_cents, row.currency)}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#9ca3af]">Results</p>
            <p className="text-[13px] font-bold text-[#111827] tabular-nums">{full(row.result_count)}</p>
            <p className="truncate text-[10px] text-[#9ca3af]">{row.result_label}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#9ca3af]">Cost/result</p>
            <p className="text-[13px] font-bold text-[#111827] tabular-nums">{moneyPrecise(row.cost_per_result_cents, row.currency)}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          {row.cta_type ? (
            <span className="rounded-full border border-[#eef0f3] px-3 py-1 text-[12px] font-semibold text-[#374151]">
              {ctaLabel(row.cta_type)}
            </span>
          ) : <span />}
          {(row.status === "active" || row.status === "paused") && (
            <TogglePill row={row} onDone={onDone} />
          )}
        </div>
      </div>
    </Card>
  );
}

export function AdsPage() {
  const [data, setData] = useState<AdPromotionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adsService.promotionsOverview());
      setError(null);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const campaigns = data?.campaigns ?? [];
  const rows = tab === "all" ? campaigns : campaigns.filter((c) => c.status === tab);

  const createBtn = (
    <PrimaryButton href="/studio/promote">
      <Plus className="h-4 w-4" /> Create Campaign
    </PrimaryButton>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Ads" subtitle="Every creative you're running, with live spend and results.">
        {createBtn}
      </PageHeader>

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "rounded-full px-4 py-1.5 text-[13px] font-semibold transition " +
                (on
                  ? "bg-[#fd4605] text-white"
                  : "border border-[#eef0f3] bg-white text-[#6b7280] hover:bg-[#f9fafb]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[320px]" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="No ads yet"
          desc="Promote a video to create your first ad and it will show up here."
          action={createBtn}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="No ads in this view"
          desc="Try a different status filter to see your ads."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => <AdCard key={c.id} row={c} onDone={load} />)}
        </div>
      )}
    </div>
  );
}
