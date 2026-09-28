"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Film, Images } from "lucide-react";
import {
  StatusPill, EmptyState, Skeleton, PrimaryButton, PageHeader,
} from "../ui";
import { money, full } from "../format";
import { adsService, type AdPromotionsOverview, type AdPromotionRow } from "@/services/ads.service";
import { apiMessage } from "@/services/api";

const OBJECTIVE_LABEL: Record<string, string> = {
  more_views: "Video views",
  more_followers: "Followers",
  more_profile_visits: "Profile visits",
  more_engagement: "Engagement",
};

function objectiveLabel(objective: string): string {
  return OBJECTIVE_LABEL[objective] ?? objective.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function creativeName(c: AdPromotionRow): string {
  return c.video?.title || `Promotion #${c.id}`;
}

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
] as const;

function CreativeCard({ row }: { row: AdPromotionRow }) {
  const cover = row.video?.thumbnail_url ?? null;
  return (
    <div className="group flex flex-col">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-[#f1f3f5]">
        {cover ? (
          <Image src={cover} alt="" fill className="object-cover transition group-hover:scale-[1.02]" unoptimized />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Film className="h-8 w-8 text-[#9ca3af]" />
          </div>
        )}
        <span className="absolute left-2.5 top-2.5">
          <StatusPill status={row.status} />
        </span>
      </div>

      <div className="mt-2.5">
        <p className="line-clamp-1 text-[13px] font-bold text-[#111827]">{creativeName(row)}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#9ca3af]">
          {objectiveLabel(row.objective)} · {full(row.result_count)} {row.result_label}
        </p>
        <p className="mt-1 text-[13px] font-semibold tabular-nums text-[#111827]">
          {money(row.spent_cents, row.currency)}
          <span className="ml-1 text-[12px] font-normal text-[#9ca3af]">spent</span>
        </p>
      </div>
    </div>
  );
}

export function CreativeLibraryPage() {
  const [data, setData] = useState<AdPromotionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");

  useEffect(() => {
    let on = true;
    setLoading(true);
    adsService.promotionsOverview()
      .then((d) => { if (on) { setData(d); setError(null); } })
      .catch((e) => { if (on) setError(apiMessage(e)); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  const campaigns = data?.campaigns ?? [];
  const rows = tab === "all" ? campaigns : campaigns.filter((c) => c.status === tab);

  const promoteBtn = (
    <PrimaryButton href="/studio/promote">
      Promote a video
    </PrimaryButton>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creative Library"
        subtitle="Videos you've promoted, reusable as ad creatives."
      >
        {promoteBtn}
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
                  ? "bg-[#fe2c55] text-white"
                  : "border border-[#eef0f3] bg-white text-[#6b7280] hover:bg-[#f9fafb]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[9/16] w-full rounded-xl" />
              <Skeleton className="mt-2.5 h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No creatives yet"
          desc="Promote a video and it will appear here, ready to reuse as an ad creative."
          action={promoteBtn}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Nothing in this view"
          desc="Try a different filter to see your promoted videos."
        />
      ) : (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((c) => <CreativeCard key={c.id} row={c} />)}
        </div>
      )}
    </div>
  );
}
