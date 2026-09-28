"use client";

import { useEffect, useState } from "react";
import { Users, Eye, MousePointerClick, Radar, Play, Target } from "lucide-react";
import { toast } from "sonner";
import {
  Card, CardHead, StatTile, PageHeader, PrimaryButton, EmptyState, Skeleton,
} from "@/features/ads-studio/ui";
import { compact } from "@/features/ads-studio/format";
import { adsService, type AdEstimate, type AdDashboard } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { cn } from "@/lib/utils";

type Gender = "all" | "male" | "female";

const AGE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All ages" },
  { value: "13-17", label: "13 – 17" },
  { value: "18-24", label: "18 – 24" },
  { value: "25-34", label: "25 – 34" },
  { value: "35-44", label: "35 – 44" },
  { value: "45+", label: "45+" },
];

const CURRENCY = "USD";

export function AudiencePage() {
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState<Gender>("all");
  const [age, setAge] = useState("");
  const [budget, setBudget] = useState("5");

  const [est, setEst] = useState<AdEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const [dash, setDash] = useState<AdDashboard | null>(null);

  useEffect(() => {
    let on = true;
    adsService.dashboard()
      .then((d) => { if (on) setDash(d); })
      .catch(() => { /* optional row - ignore failures */ });
    return () => { on = false; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstimating(true);
    try {
      const result = await adsService.estimate({
        country: country || undefined,
        gender,
        age_range: age || undefined,
        daily_budget: Number(budget) || 5,
        currency: CURRENCY,
      });
      setEst(result);
    } catch (err) {
      toast.error(apiMessage(err));
    } finally {
      setEstimating(false);
    }
  };

  const reachTotal = dash
    ? dash.recent_campaigns.reduce((sum, c) => sum + c.reach, 0)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Audience" subtitle="Estimate your reach and refine targeting." />

      {/* Your current audience */}
      {dash && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile icon={Radar} iconBg="bg-[#dbeafe]" iconColor="text-[#2563eb]"
            label="People reached" value={compact(reachTotal)} hint="recent campaigns" />
          <StatTile icon={Eye} iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]"
            label="Impressions" value={compact(dash.tiles.impressions.value)} hint="this period" />
          <StatTile icon={MousePointerClick} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
            label="Clicks" value={compact(dash.tiles.clicks.value)} hint="this period" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
        {/* LEFT - targeting form */}
        <Card>
          <CardHead title="Define your audience" subtitle="Set targeting to estimate potential reach." />
          <form onSubmit={submit} className="space-y-5 px-5 pb-5 pt-4">
            {/* Location */}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Location</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. United States"
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fd4605]"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Gender</label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#f3f4f6] p-1">
                {(["all", "male", "female"] as Gender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={cn(
                      "rounded-lg py-2 text-[12px] font-semibold capitalize transition",
                      gender === g ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#111827]",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Age */}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Age range</label>
              <select
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] text-[#111827] outline-none transition focus:border-[#fd4605]"
              >
                {AGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Daily budget */}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#374151]">Daily budget</label>
              <div className="flex items-center rounded-xl border border-[#e5e7eb] bg-white pr-3 transition focus-within:border-[#fd4605]">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full rounded-xl bg-transparent px-3.5 py-2.5 text-[13px] text-[#111827] outline-none tabular-nums"
                />
                <span className="text-[12px] font-semibold text-[#9ca3af]">{CURRENCY}</span>
              </div>
            </div>

            <PrimaryButton type="submit" className="w-full">
              <Target className="h-4 w-4" />
              {estimating ? "Estimating…" : "Estimate audience"}
            </PrimaryButton>
          </form>
        </Card>

        {/* RIGHT - results */}
        <div>
          {estimating && !est ? (
            <div className="space-y-4">
              <Skeleton className="h-[140px]" />
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[128px]" />)}
              </div>
            </div>
          ) : !est ? (
            <Card className="flex h-full items-center justify-center p-6">
              <EmptyState icon={Users} title="Estimate your audience"
                desc="Fill in targeting on the left to see potential reach." />
            </Card>
          ) : (
            <div className="space-y-5">
              {/* Big audience size */}
              <Card className="p-6">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#fff3ec]">
                    <Users className="h-[18px] w-[18px] text-[#fd4605]" />
                  </span>
                  <span className="text-[13px] font-semibold text-[#6b7280]">Estimated audience size</span>
                </div>
                <p className="mt-4 text-[34px] font-extrabold leading-none tracking-tight text-[#111827] tabular-nums">
                  {compact(est.audience.min)} – {compact(est.audience.max)}
                </p>
                <p className="mt-2 text-[13px] text-[#9ca3af]">people match your targeting</p>
              </Card>

              {/* Per-day tiles */}
              <div className="grid grid-cols-2 gap-4">
                <StatTile icon={Radar} iconBg="bg-[#dbeafe]" iconColor="text-[#2563eb]"
                  label="Reach" value={`${compact(est.per_day.reach.min)} – ${compact(est.per_day.reach.max)}`} hint="per day" />
                <StatTile icon={Eye} iconBg="bg-[#ede9fe]" iconColor="text-[#7c3aed]"
                  label="Impressions" value={`${compact(est.per_day.impressions.min)} – ${compact(est.per_day.impressions.max)}`} hint="per day" />
                <StatTile icon={Play} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
                  label="Views" value={`${compact(est.per_day.views.min)} – ${compact(est.per_day.views.max)}`} hint="per day" />
                <StatTile icon={MousePointerClick} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
                  label="Clicks" value={`${compact(est.per_day.clicks.min)} – ${compact(est.per_day.clicks.max)}`} hint="per day" />
              </div>

              {est.note && (
                <p className="text-[12px] text-[#9ca3af]">{est.note}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
