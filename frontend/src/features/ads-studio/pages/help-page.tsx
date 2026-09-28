"use client";

import { useMemo, useState } from "react";
import {
  Search, ChevronDown, Rocket, CreditCard, ShieldCheck, Users, Activity, Wrench, LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHead, PrimaryButton, PageHeader } from "@/features/ads-studio/ui";
import { cn } from "@/lib/utils";

type Category = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  articles: string[];
};

const CATEGORIES: Category[] = [
  {
    icon: Rocket, iconBg: "bg-[#fff0f4]", iconColor: "text-[#fe2c55]", title: "Getting started",
    articles: ["Create your first campaign", "Understand the Ads Manager layout", "Add a payment method"],
  },
  {
    icon: CreditCard, iconBg: "bg-[#dcfce7]", iconColor: "text-[#16a34a]", title: "Billing & payments",
    articles: ["How your balance is charged", "Add or top up funds", "Read your billing history"],
  },
  {
    icon: ShieldCheck, iconBg: "bg-[#dbeafe]", iconColor: "text-[#2563eb]", title: "Ad policies",
    articles: ["What we allow and prohibit", "Why ads get rejected", "Appeal a review decision"],
  },
  {
    icon: Users, iconBg: "bg-[#ede9fe]", iconColor: "text-[#7c3aed]", title: "Targeting & audiences",
    articles: ["Build a custom audience", "Location and interest targeting", "Reach vs. frequency"],
  },
  {
    icon: Activity, iconBg: "bg-[#fef3c7]", iconColor: "text-[#d97706]", title: "Measurement & Pixel",
    articles: ["Install the Teezer Pixel", "Track conversions", "Compare metrics over time"],
  },
  {
    icon: Wrench, iconBg: "bg-[#cffafe]", iconColor: "text-[#0891b2]", title: "Troubleshooting",
    articles: ["My ad isn't delivering", "Events not showing up", "Fix a declined payment"],
  },
];

type Faq = { q: string; a: string; keywords: string };

const FAQS: Faq[] = [
  {
    q: "How do I create a campaign?",
    a: "Go to Campaigns and select Create. Choose an objective, set your budget and schedule, define your audience, then add the ad creative. Once you submit, the campaign enters review before it can deliver.",
    keywords: "create campaign new start setup objective budget",
  },
  {
    q: "When do my ads go live?",
    a: "Every new ad goes through review first. Most ads are reviewed within a few hours, though it can take up to 24 hours. When an ad is approved and your balance is funded, it begins delivering automatically at its scheduled start time.",
    keywords: "go live review approval when active delivering start pending",
  },
  {
    q: "How does billing and my balance work?",
    a: "Teezer Ads runs on a prepaid balance. You add funds, and spend is deducted as your ads deliver impressions and clicks. When your balance runs low, delivery slows and then pauses until you top up. You can review every charge in Billing.",
    keywords: "billing balance payment charge prepaid funds top up spend cost money",
  },
  {
    q: "Why was my ad rejected?",
    a: "Ads are rejected when they don't meet our advertising policies - for example prohibited content, misleading claims, or missing required disclosures. Open the ad to see the specific reason, fix the issue, and resubmit for another review.",
    keywords: "rejected declined disapproved policy violation appeal resubmit reason",
  },
  {
    q: "How do I target an audience?",
    a: "When building an ad set, define your audience by location, age, gender, and interests. You can also save custom audiences to reuse. Narrower targeting reaches fewer but more relevant people; broader targeting increases scale.",
    keywords: "target audience targeting location interest demographics custom reach",
  },
  {
    q: "What do CTR and cost per result mean?",
    a: "CTR (click-through rate) is the share of people who clicked after seeing your ad - a higher CTR signals more engaging creative. Cost per result is the average amount you pay for each outcome you're optimizing for, such as a click, lead, or purchase.",
    keywords: "ctr click through rate cost per result metrics performance meaning definition",
  },
  {
    q: "How do I pause an ad?",
    a: "Open Ads, find the ad you want to stop, and toggle it off. Delivery pauses right away and no further budget is spent. You can switch it back on at any time and it resumes without going through review again.",
    keywords: "pause stop off toggle turn off resume delivery",
  },
  {
    q: "How are conversions tracked?",
    a: "Install the Teezer Pixel on your website and fire standard events like Purchase or Lead on the relevant actions. The pixel reports those conversions back to Ads Manager so you can measure results and optimize campaigns toward them.",
    keywords: "conversions tracking pixel events measure purchase lead optimize",
  },
];

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const q = query.trim().toLowerCase();

  const filteredFaqs = useMemo(() => {
    if (!q) return FAQS;
    return FAQS.filter(
      (f) => f.q.toLowerCase().includes(q) || f.keywords.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
    );
  }, [q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Help Center" subtitle="Guides and answers for Teezer Ads." />

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ca3af]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles and FAQs…"
          className="w-full rounded-2xl border border-[#eef0f3] bg-white py-3.5 pl-11 pr-4 text-[14px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fe2c55]"
        />
      </div>

      {/* Categories */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => (
          <Card key={c.title} className="p-5">
            <div className="flex items-center gap-2.5">
              <span className={cn("grid h-10 w-10 place-items-center rounded-full", c.iconBg)}>
                <c.icon className={cn("h-[20px] w-[20px]", c.iconColor)} />
              </span>
              <p className="text-[14px] font-bold text-[#111827]">{c.title}</p>
            </div>
            <ul className="mt-4 space-y-2.5">
              {c.articles.map((a) => (
                <li key={a}>
                  <a href="#" className="text-[13px] text-[#6b7280] transition hover:text-[#fe2c55]">
                    {a}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {/* FAQ accordion */}
      <Card>
        <CardHead
          title="Frequently asked questions"
          subtitle={q ? `${filteredFaqs.length} result${filteredFaqs.length === 1 ? "" : "s"} for “${query.trim()}”` : "Quick answers to the most common questions."}
        />
        <div className="px-5 pb-5 pt-3">
          {filteredFaqs.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#9ca3af]">
              No results found. Try a different search or contact support below.
            </p>
          ) : (
            <div className="divide-y divide-[#f1f3f5]">
              {filteredFaqs.map((f) => {
                const idx = FAQS.indexOf(f);
                const open = openIndex === idx;
                return (
                  <div key={f.q}>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? null : idx)}
                      className="flex w-full items-center justify-between gap-4 py-4 text-left"
                    >
                      <span className="text-[14px] font-bold text-[#111827]">{f.q}</span>
                      <ChevronDown
                        className={cn(
                          "h-[18px] w-[18px] flex-shrink-0 text-[#9ca3af] transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>
                    {open && (
                      <p className="pb-4 pr-8 text-[13.5px] leading-relaxed text-[#6b7280]">{f.a}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Still need help */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[#fff0f4]">
              <LifeBuoy className="h-[22px] w-[22px] text-[#fe2c55]" />
            </span>
            <div>
              <p className="text-[15px] font-bold text-[#111827]">Still need help?</p>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">
                Our support team usually replies within one business day.
              </p>
            </div>
          </div>
          <PrimaryButton href="mailto:support@teezer.live">Contact support</PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
