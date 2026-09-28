"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check, ChevronDown, ChevronRight, Clock, Globe,
  Hash, Languages, Loader2, MapPin, Play, Plus, RefreshCw,
  RotateCcw, Search, ShieldAlert, Sparkles, Tag,
  ThumbsDown, Trash2, TrendingUp, Wifi, X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  contentService, type ContentPrefs, DEFAULT_CONTENT_PREFS,
  hiddenWordsService, recentSearches,
  type HiddenWord, type HiddenWordType,
} from "@/services/content.service";

/* ─────────────────────────────────────────────────────────────────
   Static data: languages + countries
───────────────────────────────────────────────────────────────── */
const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: "en", name: "English",    native: "English"    },
  { code: "es", name: "Spanish",    native: "Español"    },
  { code: "fr", name: "French",     native: "Français"   },
  { code: "de", name: "German",     native: "Deutsch"    },
  { code: "hi", name: "Hindi",      native: "हिन्दी"      },
  { code: "ne", name: "Nepali",     native: "नेपाली"      },
  { code: "ja", name: "Japanese",   native: "日本語"       },
  { code: "ko", name: "Korean",     native: "한국어"       },
  { code: "zh", name: "Chinese",    native: "中文"        },
  { code: "ar", name: "Arabic",     native: "العربية"     },
  { code: "pt", name: "Portuguese", native: "Português"  },
  { code: "ru", name: "Russian",    native: "Русский"    },
  { code: "it", name: "Italian",    native: "Italiano"   },
  { code: "tr", name: "Turkish",    native: "Türkçe"     },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "th", name: "Thai",       native: "ภาษาไทย"    },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "ms", name: "Malay",      native: "Bahasa Melayu" },
  { code: "bn", name: "Bengali",    native: "বাংলা"       },
  { code: "uk", name: "Ukrainian",  native: "Українська" },
  { code: "pl", name: "Polish",     native: "Polski"     },
  { code: "nl", name: "Dutch",      native: "Nederlands" },
  { code: "sv", name: "Swedish",    native: "Svenska"    },
  { code: "fi", name: "Finnish",    native: "Suomi"      },
  { code: "no", name: "Norwegian",  native: "Norsk"      },
  { code: "da", name: "Danish",     native: "Dansk"      },
];

const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code:"US", name:"United States",      flag:"🇺🇸" }, { code:"GB", name:"United Kingdom",     flag:"🇬🇧" },
  { code:"IN", name:"India",              flag:"🇮🇳" }, { code:"NP", name:"Nepal",               flag:"🇳🇵" },
  { code:"AU", name:"Australia",          flag:"🇦🇺" }, { code:"CA", name:"Canada",              flag:"🇨🇦" },
  { code:"DE", name:"Germany",            flag:"🇩🇪" }, { code:"JP", name:"Japan",               flag:"🇯🇵" },
  { code:"KR", name:"South Korea",        flag:"🇰🇷" }, { code:"CN", name:"China",               flag:"🇨🇳" },
  { code:"FR", name:"France",             flag:"🇫🇷" }, { code:"IT", name:"Italy",               flag:"🇮🇹" },
  { code:"ES", name:"Spain",              flag:"🇪🇸" }, { code:"BR", name:"Brazil",              flag:"🇧🇷" },
  { code:"MX", name:"Mexico",             flag:"🇲🇽" }, { code:"AR", name:"Argentina",           flag:"🇦🇷" },
  { code:"RU", name:"Russia",             flag:"🇷🇺" }, { code:"PK", name:"Pakistan",            flag:"🇵🇰" },
  { code:"BD", name:"Bangladesh",         flag:"🇧🇩" }, { code:"NG", name:"Nigeria",             flag:"🇳🇬" },
  { code:"ID", name:"Indonesia",          flag:"🇮🇩" }, { code:"PH", name:"Philippines",         flag:"🇵🇭" },
  { code:"EG", name:"Egypt",              flag:"🇪🇬" }, { code:"TR", name:"Turkey",              flag:"🇹🇷" },
  { code:"SA", name:"Saudi Arabia",       flag:"🇸🇦" }, { code:"TH", name:"Thailand",            flag:"🇹🇭" },
  { code:"VN", name:"Vietnam",            flag:"🇻🇳" }, { code:"ZA", name:"South Africa",        flag:"🇿🇦" },
  { code:"UA", name:"Ukraine",            flag:"🇺🇦" }, { code:"PL", name:"Poland",              flag:"🇵🇱" },
  { code:"NL", name:"Netherlands",        flag:"🇳🇱" }, { code:"SE", name:"Sweden",              flag:"🇸🇪" },
  { code:"NO", name:"Norway",             flag:"🇳🇴" }, { code:"FI", name:"Finland",             flag:"🇫🇮" },
  { code:"DK", name:"Denmark",            flag:"🇩🇰" }, { code:"CH", name:"Switzerland",         flag:"🇨🇭" },
  { code:"BE", name:"Belgium",            flag:"🇧🇪" }, { code:"AT", name:"Austria",             flag:"🇦🇹" },
  { code:"PT", name:"Portugal",           flag:"🇵🇹" }, { code:"GR", name:"Greece",              flag:"🇬🇷" },
  { code:"CZ", name:"Czech Republic",     flag:"🇨🇿" }, { code:"RO", name:"Romania",             flag:"🇷🇴" },
  { code:"HU", name:"Hungary",            flag:"🇭🇺" }, { code:"BG", name:"Bulgaria",            flag:"🇧🇬" },
  { code:"HR", name:"Croatia",            flag:"🇭🇷" }, { code:"SK", name:"Slovakia",            flag:"🇸🇰" },
  { code:"SI", name:"Slovenia",           flag:"🇸🇮" }, { code:"RS", name:"Serbia",              flag:"🇷🇸" },
  { code:"IL", name:"Israel",             flag:"🇮🇱" }, { code:"AE", name:"UAE",                 flag:"🇦🇪" },
  { code:"QA", name:"Qatar",              flag:"🇶🇦" }, { code:"KW", name:"Kuwait",              flag:"🇰🇼" },
  { code:"JO", name:"Jordan",             flag:"🇯🇴" }, { code:"LB", name:"Lebanon",             flag:"🇱🇧" },
  { code:"IQ", name:"Iraq",               flag:"🇮🇶" }, { code:"IR", name:"Iran",                flag:"🇮🇷" },
  { code:"MY", name:"Malaysia",           flag:"🇲🇾" }, { code:"SG", name:"Singapore",           flag:"🇸🇬" },
  { code:"HK", name:"Hong Kong",          flag:"🇭🇰" }, { code:"TW", name:"Taiwan",              flag:"🇹🇼" },
  { code:"NZ", name:"New Zealand",        flag:"🇳🇿" }, { code:"IE", name:"Ireland",             flag:"🇮🇪" },
  { code:"ZW", name:"Zimbabwe",           flag:"🇿🇼" }, { code:"KE", name:"Kenya",               flag:"🇰🇪" },
  { code:"GH", name:"Ghana",              flag:"🇬🇭" }, { code:"ET", name:"Ethiopia",            flag:"🇪🇹" },
  { code:"TZ", name:"Tanzania",           flag:"🇹🇿" }, { code:"UG", name:"Uganda",              flag:"🇺🇬" },
  { code:"MA", name:"Morocco",            flag:"🇲🇦" }, { code:"DZ", name:"Algeria",             flag:"🇩🇿" },
  { code:"TN", name:"Tunisia",            flag:"🇹🇳" }, { code:"LY", name:"Libya",               flag:"🇱🇾" },
  { code:"SD", name:"Sudan",              flag:"🇸🇩" }, { code:"CM", name:"Cameroon",            flag:"🇨🇲" },
  { code:"CI", name:"Côte d'Ivoire",      flag:"🇨🇮" }, { code:"SN", name:"Senegal",             flag:"🇸🇳" },
  { code:"CO", name:"Colombia",           flag:"🇨🇴" }, { code:"VE", name:"Venezuela",           flag:"🇻🇪" },
  { code:"PE", name:"Peru",               flag:"🇵🇪" }, { code:"CL", name:"Chile",               flag:"🇨🇱" },
  { code:"EC", name:"Ecuador",            flag:"🇪🇨" }, { code:"BO", name:"Bolivia",             flag:"🇧🇴" },
  { code:"PY", name:"Paraguay",           flag:"🇵🇾" }, { code:"UY", name:"Uruguay",             flag:"🇺🇾" },
  { code:"MN", name:"Mongolia",           flag:"🇲🇳" }, { code:"KZ", name:"Kazakhstan",          flag:"🇰🇿" },
  { code:"UZ", name:"Uzbekistan",         flag:"🇺🇿" }, { code:"AF", name:"Afghanistan",         flag:"🇦🇫" },
  { code:"LK", name:"Sri Lanka",          flag:"🇱🇰" }, { code:"MM", name:"Myanmar",             flag:"🇲🇲" },
  { code:"KH", name:"Cambodia",           flag:"🇰🇭" }, { code:"LA", name:"Laos",               flag:"🇱🇦" },
  { code:"NE", name:"Niger",              flag:"🇳🇪" }, { code:"ML", name:"Mali",               flag:"🇲🇱" },
  { code:"MG", name:"Madagascar",         flag:"🇲🇬" }, { code:"MZ", name:"Mozambique",         flag:"🇲🇿" },
  { code:"AO", name:"Angola",             flag:"🇦🇴" }, { code:"ZM", name:"Zambia",             flag:"🇿🇲" },
  { code:"PG", name:"Papua New Guinea",   flag:"🇵🇬" }, { code:"FJ", name:"Fiji",               flag:"🇫🇯" },
  { code:"IS", name:"Iceland",            flag:"🇮🇸" }, { code:"LU", name:"Luxembourg",         flag:"🇱🇺" },
  { code:"CY", name:"Cyprus",             flag:"🇨🇾" }, { code:"MT", name:"Malta",              flag:"🇲🇹" },
  { code:"MK", name:"North Macedonia",    flag:"🇲🇰" }, { code:"AL", name:"Albania",            flag:"🇦🇱" },
  { code:"BY", name:"Belarus",            flag:"🇧🇾" }, { code:"LT", name:"Lithuania",          flag:"🇱🇹" },
  { code:"LV", name:"Latvia",             flag:"🇱🇻" }, { code:"EE", name:"Estonia",            flag:"🇪🇪" },
  { code:"MD", name:"Moldova",            flag:"🇲🇩" }, { code:"GE", name:"Georgia",            flag:"🇬🇪" },
  { code:"AM", name:"Armenia",            flag:"🇦🇲" }, { code:"AZ", name:"Azerbaijan",         flag:"🇦🇿" },
  { code:"TM", name:"Turkmenistan",       flag:"🇹🇲" }, { code:"TJ", name:"Tajikistan",         flag:"🇹🇯" },
  { code:"KG", name:"Kyrgyzstan",         flag:"🇰🇬" }, { code:"GU", name:"Guam",               flag:"🇬🇺" },
];

/* ─────────────────────────────────────────────────────────────────
   SearchDropdown - portal-based, searchable, flag/icon support
───────────────────────────────────────────────────────────────── */
interface DropdownItem { value: string; label: string; sublabel?: string; prefix?: string }

function SearchDropdown({
  value, items, placeholder = "Search…", onChange, disabled,
  renderTrigger,
}: {
  value: string;
  items: DropdownItem[];
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  renderTrigger?: (selected: DropdownItem | undefined, open: boolean) => React.ReactNode;
}) {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 0 });
  const btnRef   = useRef<HTMLButtonElement>(null);
  const menuRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.value === value);

  const filtered = query.trim()
    ? items.filter((i) =>
        i.label.toLowerCase().includes(query.toLowerCase()) ||
        i.value.toLowerCase().includes(query.toLowerCase()) ||
        (i.sublabel ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : items;

  function openMenu() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 260) });
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openMenu()}
        className={`flex h-9 min-w-[150px] items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 ${
          open
            ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605] shadow-[0_0_0_3px_rgba(253,70,5,0.10)]"
            : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fd4605] hover:bg-[#fff8f9] hover:text-[#fd4605]"
        }`}
      >
        {renderTrigger
          ? renderTrigger(selected, open)
          : (
            <>
              {selected?.prefix && <span className="text-base leading-none">{selected.prefix}</span>}
              <span className="flex-1 text-left truncate">{selected?.label ?? value}</span>
              <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-[#fd4605]" : "text-[#9ca3af]"}`} />
            </>
          )
        }
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, maxHeight: 320 }}
          className="flex flex-col rounded-2xl border border-[#f0f1f5] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.14)] overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-[#f3f4f6] px-3 py-2.5">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-[13px] text-[#111827] placeholder-[#9ca3af] outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-[#9ca3af] hover:text-[#374151]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-[12px] text-[#9ca3af]">No results for &ldquo;{query}&rdquo;</p>
            )}
            {filtered.map((item) => {
              const active = item.value === value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => { onChange(item.value); setOpen(false); setQuery(""); }}
                  className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                    active ? "bg-[#fff3ec]" : "hover:bg-[#f8f9fb]"
                  }`}
                >
                  {item.prefix && (
                    <span className="text-[18px] leading-none flex-shrink-0">{item.prefix}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-semibold leading-tight ${active ? "text-[#fd4605]" : "text-[#111827]"}`}>
                      {item.label}
                    </p>
                    {item.sublabel && (
                      <p className={`text-[11px] leading-tight ${active ? "text-[#f87185]" : "text-[#9ca3af]"}`}>{item.sublabel}</p>
                    )}
                  </div>
                  {active && (
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#fd4605]">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Toggle
───────────────────────────────────────────────────────────────── */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[26px] w-12 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-40 ${on ? "bg-[#fd4605]" : "bg-[#d1d5db]"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Row
───────────────────────────────────────────────────────────────── */
function Row({
  icon: Icon, iconBg, iconColor, title, desc, right, last, onClick,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc?: string; right?: React.ReactNode;
  last?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-3.5 ${!last ? "border-b border-[#f3f4f6]" : ""} ${onClick ? "cursor-pointer transition hover:bg-[#f9fafb]" : ""}`}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] ${iconBg}`}>
        <Icon className={`h-[16px] w-[16px] ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] leading-tight">{title}</p>
        {desc && <p className="mt-0.5 text-[11.5px] text-[#9ca3af]">{desc}</p>}
      </div>
      {right && <div className="flex-shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Card
───────────────────────────────────────────────────────────────── */
function Card({ n, title, children, className = "" }: {
  n: number; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-[#f0f1f5] bg-white shadow-sm ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-[#f3f4f6] px-5 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#fd4605] text-[11px] font-black text-white">{n}</span>
        <p className="text-[12px] font-bold uppercase tracking-widest text-[#374151]">{title}</p>
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Confirm dialog
───────────────────────────────────────────────────────────────── */
function ConfirmModal({ title, desc, onConfirm, onClose, loading }: {
  title: string; desc: string; onConfirm: () => void;
  onClose: () => void; loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#fef2f2]">
            <Trash2 className="h-4 w-4 text-[#ef4444]" />
          </div>
          <p className="text-[15px] font-bold text-[#111827]">{title}</p>
        </div>
        <p className="mb-5 ml-[52px] text-[12.5px] text-[#9ca3af]">{desc}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-[10px] border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f9fafb]">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#ef4444] py-2.5 text-[13px] font-bold text-white hover:bg-[#dc2626] disabled:opacity-60">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Clearing…" : "Yes, Clear"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Word blocklist modal (Keyword / Hashtag / Not-Interested filters)
───────────────────────────────────────────────────────────────── */
function WordListModal({
  type, title, subtitle, placeholder, icon: Icon, iconBg, iconColor, onClose,
}: {
  type: HiddenWordType; title: string; subtitle: string; placeholder: string;
  icon: React.ElementType; iconBg: string; iconColor: string; onClose: () => void;
}) {
  const [words,   setWords]   = useState<HiddenWord[]>([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);

  useEffect(() => {
    setLoading(true);
    hiddenWordsService.list()
      .then((m) => setWords(m[type] ?? []))
      .catch(() => toast.error("Could not load your list."))
      .finally(() => setLoading(false));
  }, [type]);

  async function add() {
    const w = input.trim();
    if (!w || adding) return;
    setAdding(true);
    try {
      const created = await hiddenWordsService.add(type, w);
      setWords((cur) => cur.some((x) => x.id === created.id) ? cur : [created, ...cur]);
      setInput("");
    } catch { toast.error("Could not add that word."); }
    finally { setAdding(false); }
  }

  async function remove(id: number) {
    const prev = words;
    setWords((cur) => cur.filter((x) => x.id !== id));
    try { await hiddenWordsService.remove(id); }
    catch { setWords(prev); toast.error("Could not remove that word."); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-[#f3f4f6] px-5 py-4">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
            <Icon className={`h-[18px] w-[18px] ${iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-[#111827]">{title}</p>
            <p className="text-[12px] text-[#9ca3af]">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] transition hover:text-[#374151]"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex items-center gap-2 px-5 py-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={placeholder}
            maxLength={100}
            className="flex-1 rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-[13px] text-[#111827] outline-none placeholder-[#9ca3af] transition focus:border-[#fd4605] focus:shadow-[0_0_0_3px_rgba(253,70,5,0.10)]"
          />
          <button onClick={add} disabled={!input.trim() || adding}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] bg-[#fd4605] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e03e04] disabled:opacity-40">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={3} />} Add
          </button>
        </div>

        <div className="min-h-[128px] flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#fd4605]" /></div>
          ) : words.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Icon className={`mb-2 h-7 w-7 ${iconColor} opacity-40`} />
              <p className="text-[13px] font-semibold text-[#6b7280]">No words yet</p>
              <p className="text-[11.5px] text-[#9ca3af]">Add words above to start blocking them.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {words.map((w) => (
                <span key={w.id} className="flex items-center gap-1.5 rounded-full border border-[#f0f1f5] bg-[#f8f9fb] py-1.5 pl-3 pr-2 text-[12.5px] font-semibold text-[#374151]">
                  {w.word}
                  <button onClick={() => remove(w.id)} className="flex h-4 w-4 items-center justify-center rounded-full text-[#9ca3af] transition hover:bg-[#fee2e2] hover:text-[#ef4444]">
                    <X className="h-3 w-3" strokeWidth={3} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#f3f4f6] bg-[#fafbfc] px-5 py-3">
          <p className="text-[11px] leading-relaxed text-[#9ca3af]">
            Other people can&rsquo;t use these words in comments on your videos or in messages to you.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Search history modal (client-side recent searches)
───────────────────────────────────────────────────────────────── */
function SearchHistoryModal({ onClose }: { onClose: () => void }) {
  const [terms, setTerms] = useState<string[]>([]);
  useEffect(() => { setTerms(recentSearches.list()); }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-5 py-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#f0fdf4]">
            <Search className="h-[18px] w-[18px] text-[#16a34a]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-[#111827]">Search History</p>
            <p className="text-[12px] text-[#9ca3af]">Your recent searches on this device</p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] transition hover:text-[#374151]"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-[128px] flex-1 overflow-y-auto px-3 py-2">
          {terms.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-center">
              <Search className="mb-2 h-7 w-7 text-[#16a34a] opacity-40" />
              <p className="text-[13px] font-semibold text-[#6b7280]">No recent searches</p>
              <p className="text-[11.5px] text-[#9ca3af]">Your searches will appear here.</p>
            </div>
          ) : (
            terms.map((t) => (
              <div key={t} className="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5 transition hover:bg-[#f8f9fb]">
                <Clock className="h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#374151]">{t}</span>
                <button onClick={() => setTerms(recentSearches.remove(t))}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[#9ca3af] transition hover:bg-[#fee2e2] hover:text-[#ef4444]">
                  <X className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-[#f3f4f6] px-5 py-3">
          <button onClick={() => { recentSearches.clear(); setTerms([]); toast.success("Search history cleared."); }}
            disabled={terms.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#fca5a5] bg-[#fef2f2] py-2.5 text-[13px] font-bold text-[#ef4444] transition hover:bg-[#fee2e2] disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="h-4 w-4" /> Clear All
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────────────── */
export default function ContentPreferencesPage() {
  const [prefs,    setPrefs]    = useState<ContentPrefs>(DEFAULT_CONTENT_PREFS);
  const [original, setOriginal] = useState<ContentPrefs>(DEFAULT_CONTENT_PREFS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);

  const [confirmClearWatch,  setConfirmClearWatch]  = useState(false);
  const [confirmClearSearch, setConfirmClearSearch] = useState(false);
  const [confirmReset,       setConfirmReset]       = useState(false);
  const [activeModal, setActiveModal] = useState<null | HiddenWordType | "search">(null);

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(original);

  useEffect(() => {
    contentService.get()
      .then((d) => { setPrefs(d); setOriginal(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof ContentPrefs>(key: K) {
    return (v: ContentPrefs[K]) => setPrefs((p) => ({ ...p, [key]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await contentService.save(prefs);
      setPrefs(updated); setOriginal(updated);
      toast.success("Content preferences saved.");
    } catch { toast.error("Could not save. Please try again."); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    setConfirmReset(false);
    setResetting(true);
    try {
      await contentService.resetFeed();
      toast.success("Feed preferences reset. Refreshing your recommendations...");
    } catch { toast.error("Could not reset feed. Please try again."); }
    finally { setResetting(false); }
  }

  async function handleClearWatch() {
    setClearingHistory(true);
    try {
      await contentService.clearWatchHistory();
      setConfirmClearWatch(false);
      toast.success("Watch history cleared.");
    } catch { toast.error("Could not clear watch history."); }
    finally { setClearingHistory(false); }
  }

  function handleClearSearch() {
    recentSearches.clear();
    setConfirmClearSearch(false);
    toast.success("Search history cleared.");
  }

  /* Derived items */
  const langItems  = LANGUAGES.map((l) => ({ value: l.code, label: l.name, sublabel: l.native }));
  const countryItems = COUNTRIES.map((c) => ({ value: c.code, label: c.name, prefix: c.flag }));

  const selLang    = LANGUAGES.find((l) => l.code === prefs.preferred_language);
  const selCountry = COUNTRIES.find((c) => c.code === prefs.preferred_country);

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-[#fd4605]" />
    </div>
  );

  return (
    <>
      {confirmClearWatch  && <ConfirmModal title="Clear Watch History" desc="This will remove all your watched video history. This cannot be undone."
        loading={clearingHistory} onConfirm={handleClearWatch} onClose={() => setConfirmClearWatch(false)} />}
      {confirmClearSearch && <ConfirmModal title="Clear Search History" desc="This will remove all your recent searches. This cannot be undone."
        onConfirm={handleClearSearch} onClose={() => setConfirmClearSearch(false)} />}
      {confirmReset && <ConfirmModal title="Reset Feed Algorithm" desc="Your personalised feed recommendations will be cleared and rebuilt from scratch."
        loading={resetting} onConfirm={handleReset} onClose={() => setConfirmReset(false)} />}

      {activeModal === "keyword" && <WordListModal type="keyword"
        title="Keyword Filters" subtitle="Block content with specific keywords"
        placeholder="Add a keyword to block…" icon={Tag} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
        onClose={() => setActiveModal(null)} />}
      {activeModal === "hashtag" && <WordListModal type="hashtag"
        title="Hashtag Filters" subtitle="Block content with specific hashtags"
        placeholder="Add a hashtag (e.g. spoilers)…" icon={Hash} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
        onClose={() => setActiveModal(null)} />}
      {activeModal === "not_interested" && <WordListModal type="not_interested"
        title="Not Interested Keywords" subtitle="Topics you want to see less of"
        placeholder="Add a keyword…" icon={ThumbsDown} iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
        onClose={() => setActiveModal(null)} />}
      {activeModal === "search" && <SearchHistoryModal onClose={() => setActiveModal(null)} />}

      <div className="flex min-h-full flex-col">
        <div className="flex-1 p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-black text-[#111827]">Content Preferences</h1>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">Customize your feed and content experience</p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

            {/* ── 1 Feed Preferences ── */}
            <Card n={1} title="Feed Preferences">
              <Row icon={Sparkles} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
                title="Choose Interests" desc="Select topics you want to see more of"
                right={
                  <Link href="/settings/account"
                    className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                    Manage <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />

              {/* Language */}
              <Row icon={Languages} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
                title="Preferred Language" desc="Show content in your language"
                right={
                  <SearchDropdown
                    value={prefs.preferred_language}
                    items={langItems}
                    placeholder="Search language…"
                    onChange={set("preferred_language")}
                    renderTrigger={(sel, open) => (
                      <>
                        <span className="flex-1 text-left text-[13px] font-semibold">{sel?.label ?? prefs.preferred_language}</span>
                        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-[#fd4605]" : "text-[#9ca3af]"}`} />
                      </>
                    )}
                  />
                }
              />

              {/* Country */}
              <Row icon={Globe} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
                title="Preferred Country Content" desc="Prioritize content from a specific region"
                right={
                  <SearchDropdown
                    value={prefs.preferred_country}
                    items={countryItems}
                    placeholder="Search country…"
                    onChange={set("preferred_country")}
                    renderTrigger={(sel, open) => (
                      <>
                        {selCountry && <span className="text-[18px] leading-none">{selCountry.flag}</span>}
                        <span className="flex-1 text-left text-[13px] font-semibold truncate max-w-[90px]">{selCountry?.name ?? prefs.preferred_country}</span>
                        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-[#fd4605]" : "text-[#9ca3af]"}`} />
                      </>
                    )}
                  />
                }
              />

              <Row icon={MapPin}     iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
                title="Show Local Videos First" desc="Prioritize videos from your country"
                right={<Toggle on={prefs.show_local_first} onChange={set("show_local_first")} />} />
              <Row icon={TrendingUp} iconBg="bg-[#f0fdfa]" iconColor="text-[#0d9488]"
                title="Show Trending Videos" desc="Include trending content in your feed"
                right={<Toggle on={prefs.show_trending} onChange={set("show_trending")} />} />

              {/* Reset */}
              <Row icon={RefreshCw} iconBg="bg-[#f8fafc]" iconColor="text-[#64748b]"
                title="Reset Feed Algorithm" desc="Start fresh with feed recommendations"
                last
                right={
                  <button
                    onClick={() => setConfirmReset(true)}
                    disabled={resetting}
                    className="flex items-center gap-1.5 rounded-[10px] border border-[#fde68a] bg-[#fffbeb] px-3 py-1.5 text-[12px] font-bold text-[#d97706] transition hover:bg-[#fef3c7] disabled:opacity-50">
                    {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Reset
                  </button>
                }
              />
            </Card>

            {/* ── 2 Content Control ── */}
            <Card n={2} title="Content Control">
              <Row icon={ShieldAlert} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
                title="Sensitive Content Filter" desc="Filter potentially sensitive content"
                right={<Toggle on={prefs.sensitive_content_filter} onChange={set("sensitive_content_filter")} />} />
              <Row icon={Tag}        iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
                title="Keyword Filters" desc="Block content with specific keywords"
                onClick={() => setActiveModal("keyword")}
                right={<span className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#374151] cursor-pointer hover:border-[#fd4605] hover:text-[#fd4605] transition">Manage <ChevronRight className="h-3.5 w-3.5" /></span>} />
              <Row icon={Hash}       iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
                title="Hashtag Filters" desc="Block content with specific hashtags"
                onClick={() => setActiveModal("hashtag")}
                right={<span className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#374151] cursor-pointer hover:border-[#fd4605] hover:text-[#fd4605] transition">Manage <ChevronRight className="h-3.5 w-3.5" /></span>} />
              <Row icon={ThumbsDown} iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
                title="Not Interested Keywords" desc="Topics you want to see less of"
                onClick={() => setActiveModal("not_interested")}
                right={<span className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#374151] cursor-pointer hover:border-[#fd4605] hover:text-[#fd4605] transition">Manage <ChevronRight className="h-3.5 w-3.5" /></span>} />
              <Row icon={Play}       iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
                title="Autoplay Videos" desc="Videos play automatically as you scroll"
                right={<Toggle on={prefs.autoplay_videos} onChange={set("autoplay_videos")} />} />
              <Row icon={Wifi}       iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
                title="Data Saver Mode" desc="Reduce data usage while watching"
                last right={<Toggle on={prefs.data_saver_mode} onChange={set("data_saver_mode")} />} />
            </Card>

            {/* ── 3 History ── */}
            <Card n={3} title="History" className="lg:col-span-2">
              <div className="grid grid-cols-1 divide-y divide-[#f3f4f6] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <div>
                  <Link href="/settings/history">
                    <div className="flex cursor-pointer items-center gap-4 px-5 py-3.5 transition hover:bg-[#f9fafb]">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#eff6ff]">
                        <Clock className="h-4 w-4 text-[#3b82f6]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-semibold text-[#111827]">Watch History</p>
                        <p className="text-[11.5px] text-[#9ca3af]">See everything you have watched</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#d1d5db]" />
                    </div>
                  </Link>
                  <div className="flex items-center gap-4 border-t border-[#f3f4f6] px-5 py-3.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#fef2f2]">
                      <Trash2 className="h-4 w-4 text-[#dc2626]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#111827]">Clear Watch History</p>
                      <p className="text-[11.5px] text-[#9ca3af]">Remove all watched video history</p>
                    </div>
                    <button onClick={() => setConfirmClearWatch(true)}
                      className="rounded-[10px] border border-[#fca5a5] bg-[#fef2f2] px-3.5 py-1.5 text-[12px] font-bold text-[#ef4444] transition hover:bg-[#fee2e2]">
                      Clear
                    </button>
                  </div>
                </div>
                <div>
                  <div onClick={() => setActiveModal("search")}
                    className="flex cursor-pointer items-center gap-4 px-5 py-3.5 transition hover:bg-[#f9fafb]">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#f0fdf4]">
                      <Search className="h-4 w-4 text-[#16a34a]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#111827]">Search History</p>
                      <p className="text-[11.5px] text-[#9ca3af]">See all your recent searches</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#d1d5db]" />
                  </div>
                  <div className="flex items-center gap-4 border-t border-[#f3f4f6] px-5 py-3.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#fef2f2]">
                      <Trash2 className="h-4 w-4 text-[#dc2626]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#111827]">Clear Search History</p>
                      <p className="text-[11.5px] text-[#9ca3af]">Remove all search history</p>
                    </div>
                    <button onClick={() => setConfirmClearSearch(true)}
                      className="rounded-[10px] border border-[#fca5a5] bg-[#fef2f2] px-3.5 py-1.5 text-[12px] font-bold text-[#ef4444] transition hover:bg-[#fee2e2]">
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </Card>

          </div>
        </div>

        {/* ── Sticky action bar ── */}
        <div className="sticky bottom-0 z-10 border-t border-[#f0f1f5] bg-white/95 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={() => setPrefs(original)} disabled={!isDirty || saving}
              className="flex items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-40">
              <RotateCcw className="h-3.5 w-3.5" /> Reset Changes
            </button>
            <div className="flex items-center gap-3">
              {isDirty && !saving && (
                <p className="text-[12px] font-medium text-[#f59e0b]">You have unsaved changes</p>
              )}
              <button type="button" onClick={save} disabled={!isDirty || saving}
                className="flex items-center gap-2 rounded-[10px] bg-[#fd4605] px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(253,70,5,0.25)] transition hover:bg-[#e03e04] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><Check className="h-4 w-4" strokeWidth={3} /> Save Changes</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
