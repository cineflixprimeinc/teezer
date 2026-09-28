"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, ChevronDown, Coins, Gift, ImageUp, Package, Pencil, Plus,
  RotateCcw, Search, Send, Trash2, X,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { apiMessage } from "@/services/api";
import { giftCoinService, giftIcon, type GiftRow, type ListQuery } from "@/services/gift-coin.service";

const money = (n: number) => `$${Number(n).toFixed(2)}`;
const num = (n: number) => Number(n).toLocaleString();

type StatusFilter = "active" | "retired" | "all";
type SortFilter = "catalog" | "price_low" | "price_high" | "coins_low" | "coins_high";

/* "active" is the default: the live catalog a user can actually buy. Retired packs
   from the old pricing model are hidden unless you ask for them. */
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Live gifts" },
  { value: "retired", label: "Retired" },
  { value: "all", label: "All" },
];

const SORT_OPTIONS: { value: SortFilter; label: string }[] = [
  { value: "catalog", label: "Catalog order" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "coins_low", label: "Coins: low to high" },
  { value: "coins_high", label: "Coins: high to low" },
];

export default function GiftsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortFilter>("catalog");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<GiftRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const say = (msg: string, bad = false) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3000);
  };

  const statsQ = useQuery({ queryKey: ["gift-coin-stats"], queryFn: giftCoinService.stats });

  const query: ListQuery = {
    search: debounced || undefined,
    status,
    page,
    per_page: 24,
  };

  const listQ = useQuery({
    queryKey: ["gift-catalog-admin", query],
    queryFn: () => giftCoinService.list(query),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["gift-catalog-admin"] });
    qc.invalidateQueries({ queryKey: ["gift-coin-stats"] });
  };

  const iconM = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => giftCoinService.uploadIcon(id, file),
    onSuccess: () => { refresh(); say("Icon updated."); },
    onError: (e) => say(apiMessage(e), true),
  });

  const resetM = useMutation({
    mutationFn: (id: number) => giftCoinService.resetIcon(id),
    onSuccess: () => { refresh(); say("Icon reset to the default artwork."); },
    onError: (e) => say(apiMessage(e), true),
  });

  const delM = useMutation({
    mutationFn: (id: number) => giftCoinService.remove(id),
    onSuccess: (r: { message?: string }) => { refresh(); say(r?.message ?? "Deleted."); },
    onError: (e) => say(apiMessage(e), true),
  });

  const s = statsQ.data;
  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.meta.total ?? 0;
  const lastPage = listQ.data?.meta.last_page ?? 1;

  // Sorting is applied to the page in hand. The API paginates in catalog order, so
  // this reorders what you can see rather than pretending to sort all 200.
  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case "price_low":  return a.price_usd - b.price_usd;
      case "price_high": return b.price_usd - a.price_usd;
      case "coins_low":  return a.coins - b.coins;
      case "coins_high": return b.coins - a.coins;
      default:           return a.sort_order - b.sort_order;
    }
  });

  const filtersOn = !!debounced || status !== "active" || sort !== "catalog";

  return (
    <AdminShell title="Gifts & Coins">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">Gift &amp; Coins Management</h2>
            <p className="text-[13px] text-[#6b7280]">
              Every gift has two prices: what a user pays to <b>buy</b> it, and what it costs in coins to{" "}
              <b>send</b> it. Both are edited together here.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#fe2c55] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e0193f]"
          >
            <Plus className="h-4 w-4" /> New gift
          </button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Live gifts" value={s ? num(s.packages_active) : "-"} sub="buyable in the app" icon={Gift} color="#fe2c55" />
          <Stat label="Sendable" value={s ? num(s.gifts_active) : "-"} sub="in the gift sheet" icon={Package} color="#7c3aed" />
          <Stat label="Gifts sent" value={s ? num(s.gifts_sent) : "-"} sub="all time" icon={Send} color="#2563eb" />
          <Stat label="Coins spent" value={s ? num(s.coins_spent) : "-"} sub="on gifts" icon={Coins} color="#f59e0b" />
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, slug, coins or catalog number"
                className="w-full rounded-[10px] border border-[#e5e7eb] py-2.5 pl-9 pr-3 text-[13px] outline-none transition focus:border-[#fe2c55]"
              />
            </div>

            <Dropdown
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(v) => { setStatus(v); setPage(1); }}
            />
            <Dropdown label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />

            {filtersOn && (
              <button
                onClick={() => { setSearch(""); setStatus("active"); setSort("catalog"); setPage(1); }}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-[12.5px] font-semibold text-[#6b7280] transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}

            <span className="ml-auto text-[12px] font-semibold text-[#9ca3af]">{num(total)} gifts</span>
          </div>
        </Card>

        {/* Grid */}
        {listQ.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[196px] animate-pulse rounded-[16px] bg-[#f3f4f6]" />
            ))}
          </div>
        ) : total === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-[14px] font-bold text-[#111827]">No gifts found</p>
            <p className="mt-1 text-[12.5px] text-[#6b7280]">Try a different search or filter.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((g) => (
              <GiftCard
                key={g.id}
                g={g}
                busy={iconM.isPending || resetM.isPending}
                onEdit={() => setEditing(g)}
                onIcon={(file) => iconM.mutate({ id: g.id, file })}
                onReset={() => resetM.mutate(g.id)}
                onDelete={() => {
                  if (confirm(`Delete "${g.plan_name}"? Gifts that have been bought or sent are deactivated instead.`)) {
                    delM.mutate(g.id);
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-[8px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold transition hover:border-[#fe2c55] disabled:opacity-40 disabled:hover:border-[#e5e7eb]"
            >
              Previous
            </button>
            <span className="text-[12px] text-[#6b7280]">Page {page} of {lastPage}</span>
            <button
              disabled={page >= lastPage}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-[8px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold transition hover:border-[#fe2c55] disabled:opacity-40 disabled:hover:border-[#e5e7eb]"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {editing && (
        <Editor
          g={editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); refresh(); say(m); }}
          onError={(m) => say(m, true)}
        />
      )}
      {creating && (
        <Creator
          onClose={() => setCreating(false)}
          onSaved={(m) => { setCreating(false); refresh(); say(m); }}
          onError={(m) => say(m, true)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-[10px] px-4 py-2.5 text-[13px] font-bold text-white shadow-lg ${
            toast.bad ? "bg-[#dc2626]" : "bg-[#111827]"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

/* ── A real dropdown, not a native <select> ───────────────────────────────── */
function Dropdown<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape - a dropdown you cannot dismiss is a trap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];
  const isDefault = value === options[0].value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex min-w-[160px] items-center justify-between gap-2 rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold transition ${
          isDefault
            ? "border-[#e5e7eb] text-[#374151] hover:border-[#d1d5db]"
            : "border-[#fe2c55] bg-[#fff5f7] text-[#fe2c55]"
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">{label}</span>
          <span>{current.label}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-1.5 w-[200px] overflow-hidden rounded-[12px] border border-[#f0f1f5] bg-white p-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                role="option"
                aria-selected={on}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[12.5px] font-semibold transition ${
                  on ? "bg-[#fff0f4] text-[#fe2c55]" : "text-[#374151] hover:bg-[#f8f9fb]"
                }`}
              >
                {o.label}
                {on && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Cards ────────────────────────────────────────────────────────────────── */
function Stat({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: string; sub: string; icon: React.ElementType; color: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
          <p className="mt-2 text-[22px] font-bold text-[#111827]">{value}</p>
          <p className="text-[11px] text-[#9ca3af]">{sub}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color + "15" }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
    </Card>
  );
}

/** The artwork IS the upload button - click it to replace it. */
function IconSlot({
  src, alt, busy, onPick,
}: {
  src: string | null; alt: string; busy: boolean; onPick: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        title="Upload a PNG, SVG, GIF or WebP"
        className="group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[12px] border border-[#f0f1f5] bg-[#f8f9fb] transition hover:border-[#fe2c55] disabled:opacity-50"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-10 w-10 object-contain" />
        ) : (
          <Gift className="h-5 w-5 text-[#d1d5db]" />
        )}
        <span className="absolute inset-0 hidden items-center justify-center bg-black/45 group-hover:flex">
          <ImageUp className="h-4 w-4 text-white" />
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function GiftCard({
  g, busy, onEdit, onIcon, onReset, onDelete,
}: {
  g: GiftRow;
  busy: boolean;
  onEdit: () => void;
  onIcon: (f: File) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={`p-4 ${g.is_active ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <IconSlot src={giftIcon(g)} alt={g.plan_name} busy={busy} onPick={onIcon} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#d1d5db]">
              {String(g.sort_order).padStart(3, "0")}
            </span>
            {g.bonus?.has_bonus && g.bonus.bonus_label && (
              <span className="rounded-[6px] bg-[#fef3c7] px-2 py-[3px] text-[10px] font-bold text-[#92400e]">
                {g.bonus.bonus_label}
              </span>
            )}
            {g.badge && (
              <span className="rounded-full bg-[#fff0f4] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#fe2c55]">
                {g.badge}
              </span>
            )}
            {!g.is_active && (
              <span className="rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#6b7280]">
                Retired
              </span>
            )}
            {g.gift_id === null && g.is_active && (
              <span
                title="This gift has no entry in the gift catalog, so it can be bought but not sent."
                className="rounded-full bg-[#fffbeb] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#d97706]"
              >
                Not sendable
              </span>
            )}
          </div>
          <p className="truncate text-[13px] font-bold text-[#111827]">{g.plan_name}</p>
          <p className="truncate text-[10.5px] text-[#9ca3af]">{g.icon}</p>
        </div>
      </div>

      {/* Both prices, side by side - the whole point of merging the two tables. */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#f3f4f6] pt-3">
        <div className="rounded-[10px] bg-[#f8f9fb] px-2.5 py-2">
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#9ca3af]">Buy for</p>
          <p className="text-[16px] font-black leading-tight text-[#111827]">{money(g.price_usd)}</p>
          <p className="text-[9.5px] text-[#9ca3af]">{num(g.coins)} RC · {g.coins_per_usd}/$1</p>
        </div>
        <div className="rounded-[10px] bg-[#fffbeb] px-2.5 py-2">
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#b45309]">Send for</p>
          <p className="text-[16px] font-black leading-tight text-[#f59e0b]">
            {g.coin_value !== null ? num(g.coin_value) : "-"}
          </p>
          <p className="text-[9.5px] text-[#b45309]">coins</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1">
        {g.icon_url && (
          <button
            onClick={onReset}
            disabled={busy}
            title="Reset to the default artwork"
            className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e5e7eb] text-[#6b7280] transition hover:border-[#f59e0b] hover:text-[#f59e0b]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          title="Edit prices and details"
          className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e5e7eb] text-[#6b7280] transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="grid h-8 w-8 place-items-center rounded-[8px] border border-[#e5e7eb] text-[#6b7280] transition hover:border-[#dc2626] hover:text-[#dc2626]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}

/* ── Modals ───────────────────────────────────────────────────────────────── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[18px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
          <h3 className="text-[15px] font-black text-[#111827]">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full bg-[#f3f4f6] text-[#6b7280]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] text-[#9ca3af]">{hint}</span>}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-[13px] outline-none transition focus:border-[#fe2c55]";

function Editor({
  g, onClose, onSaved, onError,
}: {
  g: GiftRow;
  onClose: () => void;
  onSaved: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(g.plan_name);
  const [coins, setCoins] = useState(String(g.coins));
  const [price, setPrice] = useState(String(g.price_usd));
  const [coinValue, setCoinValue] = useState(g.coin_value !== null ? String(g.coin_value) : "");
  const [badge, setBadge] = useState(g.badge ?? "");
  const [bonusOn, setBonusOn] = useState(g.bonus_enabled ?? false);
  const [bonusCoins, setBonusCoins] = useState(String(g.bonus_coins ?? 0));
  const [bonusPct, setBonusPct] = useState(String(g.bonus_percent ?? 0));
  const [bonusLabel, setBonusLabel] = useState(g.bonus_label ?? "");
  const [bonusEnds, setBonusEnds] = useState(g.bonus_ends_at ? g.bonus_ends_at.slice(0, 10) : "");
  const [iosProductId, setIosProductId] = useState(g.ios_product_id ?? "");
  const [androidProductId, setAndroidProductId] = useState(g.android_product_id ?? "");
  const [active, setActive] = useState(g.is_active);
  const [front, setFront] = useState(g.is_front_visible);

  const m = useMutation({
    mutationFn: () => {
      const body: Partial<GiftRow> = {
        plan_name: name.trim(),
        coins: parseInt(coins, 10),
        price_usd: parseFloat(price),
        badge: badge.trim() || null,
        bonus_enabled: bonusOn,
        bonus_coins: parseInt(bonusCoins, 10) || 0,
        bonus_percent: parseFloat(bonusPct) || 0,
        bonus_label: bonusLabel.trim() || null,
        // Sent as null rather than "" so clearing the date really clears it.
        bonus_ends_at: bonusEnds || null,
        // Empty means "not sold on this platform", which is null rather than
        // an empty string - the column is unique, and two packs sharing "" would
        // collide on the second save.
        ios_product_id: iosProductId.trim() || null,
        android_product_id: androidProductId.trim() || null,
        is_active: active,
        is_front_visible: front,
      };
      // Only send the coin half if this gift actually has one.
      if (g.gift_id !== null && coinValue.trim()) {
        body.coin_value = parseInt(coinValue, 10);
      }
      return giftCoinService.update(g.id, body);
    },
    onSuccess: () => onSaved("Gift updated."),
    onError: (e) => onError(apiMessage(e)),
  });

  const coinsN = parseInt(coins, 10) || 0;
  const priceN = parseFloat(price) || 0;
  const rate = priceN > 0 ? Math.round(coinsN / priceN) : 0;

  return (
    <Modal title={`Edit - ${g.plan_name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Buying this gift</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coins in pack">
            <input className={inputCls} inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value)} />
          </Field>
          <Field label="Price (USD)">
            <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <div className="rounded-[10px] bg-[#f8f9fb] px-3 py-2 text-[12px] text-[#6b7280]">
          Buyers get <b className="text-[#111827]">{rate} RC per $1</b> at this price.
        </div>

        <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Sending this gift</p>
        {g.gift_id !== null ? (
          <Field label="Coin value" hint="What a user spends, in coins, to send this gift.">
            <input
              className={inputCls}
              inputMode="numeric"
              value={coinValue}
              onChange={(e) => setCoinValue(e.target.value)}
            />
          </Field>
        ) : (
          <p className="rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11.5px] text-[#92400e]">
            This gift has no entry in the gift catalog, so it can be bought but not sent.
          </p>
        )}

        <Field label="Badge" hint="Shown on the gift, e.g. Popular. Blank for none.">
          <input className={inputCls} value={badge} onChange={(e) => setBadge(e.target.value)} />
        </Field>

        {/* Bonus. Base coins stay what the pack SELLS; the bonus is extra on
            top, so the buyer sees "1000 + 200" and the promotion is its own
            fact rather than a number folded into the pack. */}
        <Toggle
          checked={bonusOn}
          onChange={setBonusOn}
          label="Bonus coins"
          hint="Give extra coins on top of this pack. Shown as a bonus everywhere it is sold."
        />

        {bonusOn && (
          <div className="space-y-3 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] p-3">
            <Field label="Flat bonus coins" hint="Extra coins added outright. 0 for none.">
              <input type="number" min={0} className={inputCls} value={bonusCoins}
                     onChange={(e) => setBonusCoins(e.target.value)} />
            </Field>
            <Field label="Bonus percent" hint="Percent of the base coins, e.g. 20 for +20%. Adds to the flat bonus.">
              <input type="number" min={0} step="0.01" className={inputCls} value={bonusPct}
                     onChange={(e) => setBonusPct(e.target.value)} />
            </Field>
            <Field label="Badge text" hint='Blank auto-generates, e.g. "+20% BONUS".'>
              <input className={inputCls} value={bonusLabel}
                     onChange={(e) => setBonusLabel(e.target.value)} />
            </Field>
            <Field label="Ends on" hint="Blank runs until you turn the bonus off.">
              <input type="date" className={inputCls} value={bonusEnds}
                     onChange={(e) => setBonusEnds(e.target.value)} />
            </Field>

            {/* Same arithmetic the server uses, so what an admin previews here
                is what a buyer is actually credited. */}
            <p className="text-[11.5px] font-medium text-[#92400e]">
              Buyer receives{" "}
              {(parseInt(coins, 10) || 0)
                + (parseInt(bonusCoins, 10) || 0)
                + Math.round((parseInt(coins, 10) || 0) * (parseFloat(bonusPct) || 0) / 100)}
              {" "}coins ({parseInt(coins, 10) || 0} base +{" "}
              {(parseInt(bonusCoins, 10) || 0)
                + Math.round((parseInt(coins, 10) || 0) * (parseFloat(bonusPct) || 0) / 100)} bonus)
            </p>
          </div>
        )}

        {/* ── Selling this pack in the apps ──
            Coins are digital content, so Apple and Google require their own
            billing - StoreKit and Play Billing. A pack with no product id for
            a platform cannot be sold in that app at all; it is shown as
            unavailable rather than linked out to the web, which is an App
            Review rejection.

            The price is set in App Store Connect and the Play Console, NOT
            here: the stores charge their own local tier and will not accept an
            amount from us. The USD price above governs the website. */}
        <div className="space-y-3 rounded-[10px] border border-[#e0f2fe] bg-[#f0f9ff] p-3">
          <p className="text-[12px] font-black text-[#0c4a6e]">Selling in the apps</p>

          <Field label="iOS product id" hint="From App Store Connect. Blank means this pack cannot be bought on iOS.">
            <input className={inputCls} placeholder="com.teezer.coins.25"
                   value={iosProductId} onChange={(e) => setIosProductId(e.target.value)} />
          </Field>
          <Field label="Android product id" hint="From the Play Console. Blank means this pack cannot be bought on Android.">
            <input className={inputCls} placeholder="coins_25"
                   value={androidProductId} onChange={(e) => setAndroidProductId(e.target.value)} />
          </Field>

          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[#0369a1]">
            <span className="mt-[1px]">ℹ</span>
            <span>
              Apple and Google charge their own local price for these products — the ${priceN.toFixed(2)}{" "}
              above applies to the website only. Bonus coins are credited by us after the receipt is
              verified, so they work the same in the app as on the web.
            </span>
          </p>

          {/* States the consequence rather than leaving it to be discovered
              when a purchase fails in review. */}
          <p className="text-[11px] font-bold text-[#0c4a6e]">
            {iosProductId.trim() && androidProductId.trim()
              ? "Sellable on iOS and Android."
              : iosProductId.trim()
                ? "Sellable on iOS only — Android buyers will not see this pack."
                : androidProductId.trim()
                  ? "Sellable on Android only — iOS buyers will not see this pack."
                  : "Web only — this pack is hidden in both apps."}
          </p>
        </div>

        <Toggle checked={active} onChange={setActive} label="Active" hint="Off removes it from sale and from the gift sheet." />
        <Toggle checked={front} onChange={setFront} label="Featured" hint="Show in the short front-page list." />

        <button
          onClick={() => m.mutate()}
          disabled={m.isPending || !name.trim() || coinsN < 1 || priceN <= 0}
          className="mt-2 w-full rounded-[10px] bg-[#fe2c55] py-3 text-[13px] font-black text-white transition hover:bg-[#e0193f] disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

function Creator({
  onClose, onSaved, onError,
}: {
  onClose: () => void;
  onSaved: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [coins, setCoins] = useState("");
  const [price, setPrice] = useState("");
  const [coinValue, setCoinValue] = useState("");
  const [badge, setBadge] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("plan_name", name.trim());
      fd.append("coins", coins);
      fd.append("price_usd", price);
      fd.append("coin_value", coinValue);
      if (badge.trim()) fd.append("badge", badge.trim());
      if (file) fd.append("icon_file", file);
      return giftCoinService.create(fd);
    },
    onSuccess: () => onSaved("Gift created."),
    onError: (e) => onError(apiMessage(e)),
  });

  const valid =
    name.trim() &&
    (parseInt(coins, 10) || 0) >= 1 &&
    (parseFloat(price) || 0) > 0 &&
    (parseInt(coinValue, 10) || 0) >= 1;

  return (
    <Modal title="New gift" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <IconSlot
            src={preview}
            alt=""
            busy={false}
            onPick={(f) => { setFile(f); setPreview(URL.createObjectURL(f)); }}
          />
          <p className="text-[11.5px] text-[#6b7280]">
            Click to upload artwork.
            <br />
            <span className="text-[#9ca3af]">PNG, SVG, GIF or WebP, up to 2 MB.</span>
          </p>
        </div>

        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Heart Ribbon" />
        </Field>

        <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Buying this gift</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coins in pack">
            <input className={inputCls} inputMode="numeric" value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="15" />
          </Field>
          <Field label="Price (USD)">
            <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.19" />
          </Field>
        </div>

        <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Sending this gift</p>
        <Field label="Coin value" hint="What a user spends, in coins, to send it.">
          <input className={inputCls} inputMode="numeric" value={coinValue} onChange={(e) => setCoinValue(e.target.value)} placeholder="15" />
        </Field>

        <Field label="Badge" hint="Optional, e.g. Popular.">
          <input className={inputCls} value={badge} onChange={(e) => setBadge(e.target.value)} />
        </Field>

        <button
          onClick={() => m.mutate()}
          disabled={m.isPending || !valid}
          className="mt-2 w-full rounded-[10px] bg-[#fe2c55] py-3 text-[13px] font-black text-white transition hover:bg-[#e0193f] disabled:opacity-50"
        >
          {m.isPending ? "Creating…" : "Create gift"}
        </button>
      </div>
    </Modal>
  );
}

function Toggle({
  checked, onChange, label, hint,
}: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-left transition hover:border-[#d1d5db]"
    >
      <span>
        <span className="block text-[12.5px] font-bold text-[#374151]">{label}</span>
        {hint && <span className="block text-[10.5px] text-[#9ca3af]">{hint}</span>}
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
