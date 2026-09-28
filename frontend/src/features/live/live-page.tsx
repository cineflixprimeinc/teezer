"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { liveService, type HappeningSpace } from "@/services/live.service";
import { AppShell } from "@/components/layout/app-shell";

/* ────────────────────────────────────────────────────────────────────────────
 * Live - built to the Claude Design prototype "ReelSoo Web Live Page.dc.html"
 * (the `isBrowse` panel).
 *
 * This file used to say the sidebar and top bar "belong to the (main) layout".
 * They do not - there is no app/(main)/layout.tsx. Every main page mounts the
 * chrome itself by wrapping in <AppShell>, and because this one did not, /live
 * rendered with no sidebar at all.
 *
 * Fed by GET /spaces. Reelsoo has no live-video backend - no streams table, no
 * stream routes, no playback URL - so the grid lists live AUDIO rooms, which
 * are real. The prototype anticipates this: its third panel (`isRoom`) is a
 * "LIVE AUDIO" room, and that is where a card leads.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The prototype's palette. */
const C = {
  ink: "#121014",
  accent: "#F42B5B",
  page: "#FAFAFB",
  line: "#EDEAF0",
  muted: "#8A8592",
  faint: "#B6B1BE",
  slate: "#4A4653",
  mid: "#6E6979",
  fill: "#F4F2F5",
  wash: "#FDECF1",
} as const;

/** Cover art stands in for a room that has none - a look, not a fact. */
const TINTS = [
  "linear-gradient(140deg,#3F3D56,#5B5470)",
  "linear-gradient(140deg,#B3405E,#8C2F49)",
  "linear-gradient(140deg,#2F6F62,#1F4F45)",
  "linear-gradient(140deg,#4C4A9E,#33326E)",
  "linear-gradient(140deg,#B5652F,#8A4A20)",
  "linear-gradient(140deg,#2E5E8A,#1F4160)",
] as const;
const tintFor = (id: string) => {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % TINTS.length;
  return TINTS[n];
};

const initial = (name?: string | null) => (name?.trim()?.[0] ?? "?").toUpperCase();

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
      : String(n ?? 0);

/** "48m" / "2h 10m" since the room opened. Blank when the server sends no time. */
function elapsedSince(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

type SortKey = "listeners" | "newest";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "listeners", label: "Most listeners" },
  { key: "newest", label: "Newest" },
];

export function LivePage() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("listeners");
  const [limit, setLimit] = useState(9);

  const { data, isLoading } = useQuery({
    queryKey: ["live-spaces"],
    queryFn: () => liveService.list(),
    staleTime: 30_000,
  });

  const happening = data?.happening ?? [];
  const scheduled = data?.scheduled ?? [];

  /* Categories are the topics actually in use, so a chip can never lead to an
     empty shelf. "All" first, then each topic with its own count. */
  const cats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of happening) if (s.topic) counts.set(s.topic, (counts.get(s.topic) ?? 0) + 1);
    return [
      { id: "", label: "All" },
      ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, label: id })),
    ];
  }, [happening]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = happening.filter((s) => {
      if (topic && s.topic !== topic) return false;
      if (!q) return true;
      return (
        s.title?.toLowerCase().includes(q) ||
        s.host?.name?.toLowerCase().includes(q) ||
        s.host?.username?.toLowerCase().includes(q)
      );
    });
    rows = [...rows].sort((a, b) =>
      sort === "listeners" ? b.listening - a.listening : String(b.id).localeCompare(String(a.id)),
    );
    return rows;
  }, [happening, query, topic, sort]);

  const shown = filtered.slice(0, limit);

  /* The rail ranks the hosts who are live right now by their audience. Derived
     from the same rows the grid shows, so it can never disagree with them. */
  const leaderboard = useMemo(
    () =>
      [...happening]
        .filter((s) => s.host)
        .sort((a, b) => b.listening - a.listening)
        .slice(0, 5)
        .map((s, i) => ({
          rank: i + 1,
          id: s.id,
          name: s.host!.name || s.host!.username,
          kind: s.topic || "Live now",
          metric: compact(s.listening),
        })),
    [happening],
  );

  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of happening) {
      if (!s.topic) continue;
      counts.set(s.topic, (counts.get(s.topic) ?? 0) + s.listening);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, n]) => ({ label, metric: `${compact(n)} listening` }));
  }, [happening]);

  /*
   * AppShell + .page-scroll, matching every other main page (Explore, Trending,
   * Following).
   *
   * Without AppShell this page rendered with no left sidebar at all - the nav
   * did not "hide" on /live, it was never mounted, because LivePage returned a
   * bare div while its siblings wrap in the shell.
   *
   * .page-scroll is the second half of the same fix. globals.css sets
   * `overflow: hidden` on html/body so the feed can own the viewport, which
   * means a full-page route must provide its own scroll container. This used
   * `minHeight: 100vh` on a plain div, so anything past the fold was
   * unreachable - the same defect the activate-license page had.
   */
  return (
    <AppShell>
      <div className="page-scroll">
        <div style={{ padding: "28px 32px 44px", background: C.page, color: C.ink, minHeight: "100%" }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, paddingBottom: 22 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <LiveGlyph />
            <span style={{ whiteSpace: "nowrap", fontSize: 31, fontWeight: 800, letterSpacing: "-.05em", color: C.ink }}>
              Live
            </span>
          </span>
          <span style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>
            Rooms that are open right now, and what is starting next.
          </span>
        </div>

        <div style={{ flex: "0 0 320px", display: "flex", alignItems: "center", gap: 9, height: 46, padding: "0 16px", border: `1px solid ${C.line}`, borderRadius: 14, background: "#fff" }}>
          <SearchGlyph />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms or hosts"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "none", font: "inherit", fontSize: 13.5, color: C.ink }}
          />
        </div>

        <Link
          href="/live/create"
          style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 20px", borderRadius: 14, background: C.accent, boxShadow: "0 8px 20px rgba(244,43,91,.26)", textDecoration: "none" }}
        >
          <PlusGlyph />
          <span style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", color: "#fff" }}>
            Go live
          </span>
        </Link>
      </div>

      {/* ── Mode tabs ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, borderBottom: `1px solid ${C.line}`, marginBottom: 18 }}>
        <ModeTab label="Live now" count={happening.length} active />
        <ModeTab label="Scheduled" count={scheduled.length} href="/spaces" />
      </div>

      {/* ── Promo banner ────────────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, background: "linear-gradient(100deg,#FFF3F6,#FDECF1 62%,#FFF7F4)", padding: "26px 28px", display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ flex: 1.15, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.035em", color: C.ink, lineHeight: 1.25 }}>
            Start a room and talk to your audience live
          </span>
          <span style={{ fontSize: 13, color: "#7A6E76", lineHeight: 1.55, maxWidth: 330 }}>
            Open a room in seconds, invite speakers up on stage, and let listeners send gifts while you talk.
          </span>
          <Link
            href="/live/create"
            style={{ alignSelf: "flex-start", marginTop: 8, display: "flex", alignItems: "center", gap: 8, height: 42, padding: "0 19px", borderRadius: 12, background: C.accent, textDecoration: "none" }}
          >
            <PlayGlyph />
            <span style={{ whiteSpace: "nowrap", fontSize: 13, fontWeight: 800, color: "#fff" }}>Start a room</span>
          </Link>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 15 }}>
          <Perk title="Bring people on stage" sub="Up to 10 speakers at once" />
          <Perk title="Gifts while you talk" sub="Listeners send coins in real time" />
          <Perk title="Replays afterwards" sub="Keep the room available to replay" />
        </div>
      </div>

      {/* ── Categories + sort ───────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 0 18px" }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 7, overflowX: "auto" }}>
          {cats.map((c) => {
            const on = c.id === topic;
            return (
              <button
                key={c.id || "all"}
                type="button"
                onClick={() => setTopic(c.id)}
                style={{
                  flex: "0 0 auto", height: 40, padding: "0 16px", borderRadius: 12, cursor: "pointer",
                  font: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
                  border: `1px solid ${on ? C.ink : C.line}`,
                  background: on ? C.ink : "#fff",
                  color: on ? "#fff" : C.slate,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setSort((s) => (s === "listeners" ? "newest" : "listeners"))}
          style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 15px", border: `1px solid ${C.line}`, borderRadius: 12, background: "#fff", cursor: "pointer", font: "inherit" }}
        >
          <span style={{ whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 700, color: C.slate }}>
            {SORTS.find((s) => s.key === sort)!.label}
          </span>
          <ChevronGlyph />
        </button>
      </div>

      {/* ── Grid + rail ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 14 }}>
            <DotGlyph />
            <span style={{ whiteSpace: "nowrap", fontSize: 16, fontWeight: 800, letterSpacing: "-.03em", color: C.ink }}>
              Happening now
            </span>
            <span style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, color: C.accent, background: C.wash, padding: "5px 10px", borderRadius: 999 }}>
              {filtered.length}
            </span>
          </div>

          {isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 18, background: "#fff", height: 250 }} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "52px 20px", border: `1px solid ${C.line}`, borderRadius: 20, background: "#fff" }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-.015em", color: C.ink }}>
                Nothing live in this category
              </span>
              <span style={{ fontSize: 12.5, color: C.muted, textAlign: "center" }}>
                Try another category, or start your own.
              </span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 16 }}>
              {shown.map((s) => <RoomCard key={s.id} space={s} />)}
            </div>
          )}

          {shown.length < filtered.length && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + 9)}
              style={{ width: "100%", marginTop: 16, height: 52, border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", cursor: "pointer", font: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <span style={{ whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 700, color: C.slate }}>Load more</span>
              <ChevronGlyph />
            </button>
          )}
        </div>

        <aside style={{ flex: "0 0 292px", display: "flex", flexDirection: "column", gap: 16 }}>
          <section style={{ border: `1px solid ${C.line}`, borderRadius: 18, background: "#fff", padding: 17 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 6 }}>
              <span style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>
                Biggest rooms
              </span>
              <Link href="/spaces" style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, textDecoration: "none" }}>
                View all
              </Link>
            </div>

            {leaderboard.length === 0 ? (
              <p style={{ margin: "10px 0 2px", fontSize: 12, color: C.muted }}>Nobody is live yet.</p>
            ) : leaderboard.map((u) => (
              <Link
                key={u.id}
                href={`/live/${u.id}`}
                style={{ width: "100%", padding: "11px 0", borderBottom: `1px solid #F7F6F8`, display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}
              >
                <span style={{ flex: "0 0 12px", fontSize: 12, fontWeight: 800, color: C.faint }}>{u.rank}</span>
                <span style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: 999, background: C.fill, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: C.slate }}>
                  {initial(u.name)}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 700, color: C.ink }}>{u.name}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: C.muted }}>{u.kind}</span>
                </span>
                <span style={{ flex: "0 0 auto", whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 800, color: C.accent, background: C.wash, padding: "5px 9px", borderRadius: 999 }}>
                  {u.metric}
                </span>
              </Link>
            ))}
          </section>

          <section style={{ border: `1px solid ${C.line}`, borderRadius: 18, background: "#fff", padding: 17 }}>
            <span style={{ display: "block", whiteSpace: "nowrap", fontSize: 14, fontWeight: 800, letterSpacing: "-.02em", color: C.ink, paddingBottom: 4 }}>
              Trending categories
            </span>
            {trending.length === 0 ? (
              <p style={{ margin: "10px 0 2px", fontSize: 12, color: C.muted }}>No categories yet.</p>
            ) : trending.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setTopic(t.label)}
                style={{ width: "100%", textAlign: "left", border: 0, background: "none", padding: "11px 0", borderBottom: `1px solid #F7F6F8`, display: "flex", alignItems: "center", gap: 11, cursor: "pointer", font: "inherit" }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 700, color: C.ink }}>{t.label}</span>
                <span style={{ flex: "0 0 auto", whiteSpace: "nowrap", fontSize: 11, color: C.muted }}>{t.metric}</span>
              </button>
            ))}
          </section>
        </aside>
      </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ── One room card ────────────────────────────────────────────────────────── */
function RoomCard({ space: s }: { space: HappeningSpace }) {
  const faces = s.speakers?.slice(0, 4) ?? [];
  const more = Math.max(0, (s.speakers_count ?? faces.length) - faces.length);
  const elapsed = elapsedSince(s.started_at);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 18, background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Link
        href={`/live/${s.id}`}
        style={{ position: "relative", display: "block", width: "100%", aspectRatio: "16/10", background: tintFor(s.id) }}
      >
        <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.22) 0%,transparent 42%,rgba(0,0,0,.5) 100%)" }} />
        <span style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: 6, background: C.accent }}>
          <span style={{ width: 4, height: 4, borderRadius: 999, background: "#fff" }} />
          <span style={{ whiteSpace: "nowrap", fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", color: "#fff" }}>LIVE</span>
        </span>
        <span style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", borderRadius: 6, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)" }}>
          <EarGlyph />
          <span style={{ whiteSpace: "nowrap", fontSize: 10, fontWeight: 800, color: "#fff" }}>{compact(s.listening)}</span>
        </span>
        <span style={{ position: "absolute", left: 10, bottom: 10, display: "flex", alignItems: "center" }}>
          {faces.map((f, i) => (
            <span
              key={f.id}
              style={{ width: 26, height: 26, borderRadius: 999, background: "rgba(255,255,255,.9)", border: "2px solid rgba(255,255,255,.85)", marginLeft: i === 0 ? 0 : -9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: C.slate }}
            >
              {initial(f.name)}
            </span>
          ))}
          {more > 0 && (
            <span style={{ height: 26, padding: "0 8px", borderRadius: 999, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", marginLeft: -9, display: "flex", alignItems: "center", fontSize: 10.5, fontWeight: 800, color: "#fff" }}>
              +{more}
            </span>
          )}
        </span>
      </Link>

      <div style={{ padding: "13px 14px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 800, letterSpacing: "-.02em", color: C.ink }}>
          {s.title}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: C.mid }}>
            {s.host?.name || s.host?.username || "Unknown host"}
          </span>
          {s.host?.verified && <VerifiedGlyph />}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!!s.topic && (
            <span style={{ whiteSpace: "nowrap", fontSize: 10, fontWeight: 700, color: C.mid, background: C.fill, padding: "4px 9px", borderRadius: 999 }}>
              {s.topic}
            </span>
          )}
          {!!elapsed && <span style={{ whiteSpace: "nowrap", fontSize: 10.5, color: C.faint }}>{elapsed}</span>}
        </span>
        <Link
          href={`/live/${s.id}`}
          style={{ height: 38, borderRadius: 11, background: C.ink, color: "#fff", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
        >
          Join room
        </Link>
      </div>
    </div>
  );
}

function ModeTab({ label, count, active, href }: { label: string; count: number; active?: boolean; href?: string }) {
  const body = (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 11, padding: "0 4px 13px", marginBottom: -1 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
        <span style={{ whiteSpace: "nowrap", fontSize: 14.5, fontWeight: 800, letterSpacing: "-.02em", color: active ? C.ink : C.muted }}>
          {label}
        </span>
        <span style={{ whiteSpace: "nowrap", fontSize: 11, fontWeight: 800, color: active ? C.accent : C.muted, background: active ? C.wash : C.fill, padding: "4px 9px", borderRadius: 999 }}>
          {count}
        </span>
      </span>
      <span style={{ height: 2, width: "100%", borderRadius: 2, background: active ? C.ink : "transparent" }} />
    </span>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: "none" }}>{body}</Link>
  ) : (
    <span>{body}</span>
  );
}

function Perk({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 999, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <SparkGlyph />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 800, letterSpacing: "-.015em", color: C.ink }}>{title}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11.5, color: C.muted }}>{sub}</span>
      </span>
    </div>
  );
}

/* ── Glyphs (inline, so the page carries no icon dependency) ──────────────── */
const LiveGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M6.5 17.5a7.5 7.5 0 0 1 0-11" /><path d="M17.5 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
const SearchGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2.1" strokeLinecap="round" style={{ flex: "0 0 17px" }}>
    <circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.4-4.4" />
  </svg>
);
const PlusGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 5.5v13" /><path d="M5.5 12h13" />
  </svg>
);
const PlayGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M8 5.5 19 12 8 18.5z" /></svg>
);
const ChevronGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.3" strokeLinecap="round"><path d="m6 9.5 6 6 6-6" /></svg>
);
const DotGlyph = () => (
  <span style={{ width: 9, height: 9, borderRadius: 999, background: C.accent, display: "inline-block", flex: "0 0 9px" }} />
);
const EarGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 1 1 12 0c0 3-2 4-2 6a3 3 0 0 1-6 0" /><path d="M9 8a3 3 0 0 1 6 0" />
  </svg>
);
const VerifiedGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={C.accent} stroke="none" style={{ flex: "0 0 12px" }}>
    <path d="M12 1.6l2.4 2 3.1-.3 1.2 2.9 2.8 1.4-.8 3 1 3-2.6 1.7-1 3-3.1.1L12 22.4l-2.9-1.9-3.1-.1-1-3-2.6-1.7 1-3-.8-3 2.8-1.4L6.4 3.3l3.1.3z" />
    <path d="M8.6 12.2l2.3 2.3 4.6-4.6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SparkGlyph = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3.2" />
  </svg>
);
