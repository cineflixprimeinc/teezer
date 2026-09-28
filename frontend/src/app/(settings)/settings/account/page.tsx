"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, Globe, Languages,
  MapPin, Wifi, Lock, Download, ShieldCheck, Eye,
  X, ExternalLink, Plus, Search, RefreshCw, AlertCircle,
  Clock, ShieldAlert,
} from "lucide-react";
import {
  BRAND, PageHeader, SectionBadge, SectionTitle,
  ActionBar, StatusBadge, NiceSelect,
} from "@/features/settings/settings-ui";
import { DOBPicker } from "@/features/auth/dob-picker";
import { CountryLockCard } from "@/features/settings/country-lock-card";
import { ContactChangeModal } from "@/features/settings/contact-change-modal";
import { LocationChangeModal } from "@/features/settings/location-change-modal";
import { EmailVerifyModal } from "@/features/settings/email-verify-modal";
import { useAuthStore } from "@/store/auth.store";
import {
  profileService,
  type ProfileResource,
  type SocialLinkPayload,
  type SocialPlatform,
} from "@/services/profile.service";
import { accountService, type AccountStatus, type ActiveRestriction } from "@/services/account.service";
import { countryService, type DetectedCountry } from "@/services/country.service";
import { apiMessage } from "@/services/api";

/* ── SVG Social Icons ──────────────────────────────────────────────────── */
function FbIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
function IgIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <defs>
        <linearGradient id="ig-acct" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <path fill="url(#ig-acct)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}
function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#000">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.28a8.27 8.27 0 004.83 1.54V7.38a4.85 4.85 0 01-1.06-.69z" />
    </svg>
  );
}
function YTIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#FF0000">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#000">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function Field({
  label, value, onChange, placeholder, type = "text", rows, error, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; rows?: number; error?: string | null; maxLength?: number;
}) {
  const shared =
    "w-full rounded-[10px] border bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#c0c4cc] outline-none transition-colors focus:border-[#fe2c55]";
  const borderCls = error ? "border-[#fe2c55]" : "border-[#e8eaf0]";
  return (
    <div className="flex flex-col gap-[3px]">
      <label className="text-[11px] font-semibold text-[#6b7280]">{label}</label>
      {rows ? (
        <div className="relative">
          <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder} maxLength={150}
            className={`${shared} ${borderCls} resize-none py-2 leading-snug`} />
          <span className="absolute bottom-1.5 right-2 text-[10px] text-[#c0c4cc]">
            {value.length} / 150
          </span>
        </div>
      ) : (
        <div className="relative">
          <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder} maxLength={maxLength}
            className={`${shared} ${borderCls} h-8${maxLength ? " pr-12" : ""}`} />
          {maxLength && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#c0c4cc]">
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      )}
      {error && (
        <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-[#fe2c55]">
          <AlertCircle className="h-2.5 w-2.5" />
          {error}
        </p>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon, label, value, action, badge,
}: {
  icon: React.ElementType; label: string; value: string;
  action?: React.ReactNode; badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] leading-none text-[#9ca3af]">{label}</p>
          <p className="mt-0.5 truncate text-[12px] font-semibold leading-tight text-[#111827]">{value}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {badge}
          {action}
        </div>
      </div>
    </div>
  );
}

/* ── Interests data + picker ────────────────────────────────────────────── */
const ALL_INTERESTS = [
  "Creator", "Photography", "Music", "Travel", "Dance", "Lifestyle", "Food",
  "Fashion", "Beauty", "Fitness", "Sports", "Gaming", "Education", "Technology",
  "Business", "Motivation", "News", "Entertainment", "Vlog", "Art",
  "Animals & Pets", "Nature", "Cars & Bikes", "Health", "DIY & Crafts", "Reviews",
  "Tutorials", "Religious / Spiritual", "Other",
];

/* ── Profile categories (max 3 - shown on public profile) ───────────────── */
const PROFILE_CATEGORIES = [
  // Content / Creator
  "Creator", "Vlogger", "Blogger", "Podcaster", "Streamer", "Influencer",
  // Entertainment
  "Music", "Singer", "Musician", "Dance", "Choreography", "Comedy", "Acting",
  "Drama", "Memes", "Movies", "Animation", "Voice Over",
  // Visual Arts
  "Photography", "Videography", "Cinematography", "Art", "Painting",
  "Illustration", "Design", "Graphic Design", "Animation Artist",
  // Lifestyle
  "Lifestyle", "Fashion", "Beauty", "Makeup", "Skincare", "Hair", "Nails",
  "Streetwear", "Modeling",
  // Food
  "Food", "Cooking", "Baking", "Recipes", "Restaurant Reviews", "Street Food",
  "Mixology",
  // Travel & Outdoors
  "Travel", "Adventure", "Backpacking", "Camping", "Road Trips", "Outdoors",
  "Hiking", "Mountaineering",
  // Sports & Fitness
  "Fitness", "Gym", "Yoga", "Pilates", "Football", "Basketball", "Cricket",
  "Martial Arts", "Boxing", "Running", "Cycling", "Skating", "Surfing",
  // Gaming
  "Gaming", "Esports", "Streamer (Gaming)", "Game Reviews", "Speedrunner",
  // Tech & Science
  "Technology", "AI & ML", "Coding", "Web Development", "Mobile Apps", "Gadgets",
  "Cybersecurity", "Web3", "Crypto", "Science", "Astronomy", "Robotics",
  // Education & Books
  "Education", "Teacher", "Tutoring", "Languages", "Books", "Writing",
  "Poetry", "History",
  // Business & Finance
  "Business", "Entrepreneurship", "Startup", "Marketing", "Branding", "Sales",
  "Finance", "Investing", "Stock Market", "Real Estate",
  // Health & Wellness
  "Health", "Mental Health", "Meditation", "Wellness", "Nutrition",
  "Therapy", "Parenting",
  // Cars / Bikes
  "Cars", "Bikes", "Motorsports", "Auto Reviews",
  // Nature / Animals
  "Animals & Pets", "Pet Care", "Dog Training", "Wildlife", "Nature",
  "Environment", "Gardening", "Farming",
  // DIY / Crafts
  "DIY & Crafts", "Home Improvement", "Woodworking", "Crochet", "Pottery",
  // Reviews / Tutorials
  "Reviews", "Product Reviews", "Tutorials", "How-To", "Tips & Tricks",
  // Spiritual
  "Religious / Spiritual", "Astrology", "Tarot",
  // News / Politics
  "News", "Politics", "Current Affairs",
  // Other
  "Charity", "Activism", "Other",
];

function InterestsPicker({
  selected,
  onChange,
  options = ALL_INTERESTS,
  max     = 20,
  noun    = "interests",
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  options?: string[];
  max?: number;
  noun?: string;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const available = options.filter(
    (t) => !selected.includes(t) && t.toLowerCase().includes(query.toLowerCase()),
  );

  const reachedMax = selected.length >= max;

  function add(tag: string) {
    if (reachedMax) { toast.warning(`You can pick up to ${max} ${noun}.`); return; }
    onChange([...selected, tag]); setQuery("");
  }
  function remove(tag: string) { onChange(selected.filter((t) => t !== tag)); }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-[10px] border border-[#e8eaf0] bg-white px-2.5 py-2 transition-colors focus-within:border-[#fe2c55]">
        {selected.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
            style={{ background: "#fe2c55" }}
          >
            {tag}
            <button type="button" onClick={() => remove(tag)} className="opacity-80 hover:opacity-100 transition-opacity">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => !reachedMax && setOpen(true)}
          disabled={reachedMax}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#d1d5db] px-2.5 py-0.5 text-[11px] font-semibold text-[#9ca3af] transition-colors hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#d1d5db] disabled:hover:text-[#9ca3af]"
        >
          <Plus className="h-2.5 w-2.5" />
          {reachedMax ? `${max} max` : "Add"}
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[200] overflow-hidden rounded-[12px] border border-[#e8eaf0] bg-white"
          style={{ boxShadow: "0 8px 28px rgba(0,0,0,0.12)" }}
        >
          <div className="flex items-center gap-2 border-b border-[#f0f1f5] px-3 py-2">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
            <input
              ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search interests..."
              className="flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
            />
            {query && (
              <button onClick={() => setQuery("")}>
                <X className="h-3 w-3 text-[#9ca3af] hover:text-[#374151]" />
              </button>
            )}
          </div>
          <div
            className="flex max-h-[200px] flex-wrap gap-1.5 overflow-y-auto overscroll-contain p-2.5"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#cbd5e1 transparent" }}
            onWheel={(e) => e.stopPropagation()}
          >
            {available.length === 0 ? (
              <p className="w-full py-3 text-center text-[12px] text-[#9ca3af]">No matching {noun}</p>
            ) : (
              available.map((tag) => (
                <button key={tag} type="button" onClick={() => add(tag)}
                  className="rounded-full border border-[#e8eaf0] px-2.5 py-1 text-[11px] font-semibold text-[#374151] transition-colors hover:border-[#fe2c55] hover:bg-[#fff1f3] hover:text-[#fe2c55]"
                >
                  + {tag}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Language constants ─────────────────────────────────────────────────── */
const LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: "en", name: "English",     native: "English"         },
  { code: "ne", name: "Nepali",      native: "नेपाली"           },
  { code: "hi", name: "Hindi",       native: "हिन्दी"          },
  { code: "zh", name: "Chinese",     native: "中文"            },
  { code: "ru", name: "Russian",     native: "Русский"        },
  { code: "ja", name: "Japanese",    native: "日本語"          },
  { code: "ko", name: "Korean",      native: "한국어"          },
  { code: "ar", name: "Arabic",      native: "العربية"        },
  { code: "es", name: "Spanish",     native: "Español"        },
  { code: "fr", name: "French",      native: "Français"       },
  { code: "de", name: "German",      native: "Deutsch"        },
  { code: "pt", name: "Portuguese",  native: "Português"      },
  { code: "bn", name: "Bengali",     native: "বাংলা"          },
  { code: "ur", name: "Urdu",        native: "اردو"           },
  { code: "id", name: "Indonesian",  native: "Bahasa Indonesia" },
  { code: "tr", name: "Turkish",     native: "Türkçe"         },
  { code: "it", name: "Italian",     native: "Italiano"       },
  { code: "th", name: "Thai",        native: "ไทย"            },
  { code: "vi", name: "Vietnamese",  native: "Tiếng Việt"     },
];

const GENDERS: { value: string; label: string }[] = [
  { value: "prefer_not_to_say", label: "Prefer not to say" },
  { value: "male",              label: "Male" },
  { value: "female",            label: "Female" },
  { value: "non_binary",        label: "Non-binary" },
  { value: "other",             label: "Other" },
];

const SOCIAL_KEYS: { key: SocialPlatform; label: string; icon: React.ReactNode; placeholder: string }[] = [
  { key: "facebook",  label: "Facebook",    icon: <FbIcon />,     placeholder: "facebook.com/yourprofile" },
  { key: "instagram", label: "Instagram",   icon: <IgIcon />,     placeholder: "@username" },
  { key: "tiktok",    label: "TikTok",      icon: <TikTokIcon />, placeholder: "@username" },
  { key: "youtube",   label: "YouTube",     icon: <YTIcon />,     placeholder: "youtube.com/@channel" },
  { key: "twitter",   label: "X / Twitter", icon: <XIcon />,      placeholder: "@username" },
  { key: "website",   label: "Website",     icon: <ExternalLink className="h-4 w-4 text-[#6b7280]" />, placeholder: "https://yoursite.com" },
];

/* ── Normalizers ────────────────────────────────────────────────────────── */
function normalizeSocialUrl(platform: SocialPlatform, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  // Already a full URL - accept as-is
  if (/^https?:\/\//i.test(v)) return v;

  // Username-only (@user) → expand based on platform
  if (v.startsWith("@")) {
    const u = v.slice(1).trim();
    if (!u) return null;
    if (platform === "instagram") return `https://instagram.com/${u}`;
    if (platform === "twitter")   return `https://x.com/${u}`;
    if (platform === "tiktok")    return `https://tiktok.com/@${u}`;
    if (platform === "youtube")   return `https://youtube.com/@${u}`;
    if (platform === "facebook")  return `https://facebook.com/${u}`;
    return null; // website/other cannot be a bare handle
  }

  // Looks like a domain (has a dot, e.g. example.com or facebook.com/path)
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(v)) {
    return `https://${v}`;
  }

  // Plain identifier (no @, no dot) → treat as handle for known platforms
  if (platform === "instagram") return `https://instagram.com/${v}`;
  if (platform === "twitter")   return `https://x.com/${v}`;
  if (platform === "tiktok")    return `https://tiktok.com/@${v}`;
  if (platform === "youtube")   return `https://youtube.com/@${v}`;
  if (platform === "facebook")  return `https://facebook.com/${v}`;
  return null;
}

function statusBadgeColor(status?: string): { color: "green" | "blue" | "red" | "orange"; label: string } {
  switch (status) {
    case "active":               return { color: "green",  label: "Active" };
    case "suspended":            return { color: "red",    label: "Suspended" };
    case "restricted":           return { color: "orange", label: "Restricted" };
    case "pending_verification": return { color: "blue",   label: "Pending Verification" };
    default:                     return { color: "green",  label: "Active" };
  }
}

function visibilityLabel(v?: string): { color: "blue" | "purple"; label: string } {
  if (v === "private") return { color: "purple", label: "Private" };
  return { color: "blue", label: "Public" };
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function AccountSettingsPage() {
  const { user, authReady, isAuthenticated, openAuthModal, setUser } = useAuthStore();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Auth guard ── */
  useEffect(() => {
    if (authReady && !isAuthenticated) openAuthModal("login");
  }, [authReady, isAuthenticated, openAuthModal]);

  /* ── Fetch profile ── */
  const { data: profile } = useQuery<ProfileResource>({
    queryKey: ["account-profile"],
    queryFn: () => profileService.show(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  /* ── Fetch account status ── */
  const { data: accountStatus } = useQuery<AccountStatus>({
    queryKey: ["account-status"],
    queryFn: () => accountService.status(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  /* ── Fetch active restrictions ── */
  const { data: restrictionsData } = useQuery({
    queryKey: ["account-restrictions"],
    queryFn: () => accountService.restrictions(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const activeRestrictions = restrictionsData?.active_restrictions ?? [];

  /* ── Detect country / ISP (refreshable) ── */
  const { data: detected, refetch: refetchDetect, isFetching: detectFetching } = useQuery<DetectedCountry>({
    queryKey: ["detect-country"],
    queryFn: () => countryService.detect(),
    staleTime: 5 * 60_000,
  });

  /* ── Local state (initialized once profile loads) ── */
  const [hydrated,    setHydrated]    = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile,  setAvatarFile]  = useState<File | null>(null);
  const [fullName,    setFullName]    = useState("");
  const [username,    setUsername]    = useState("");
  const [bio,         setBio]         = useState("");
  const [website,     setWebsite]     = useState("");
  const [gender,      setGender]      = useState("prefer_not_to_say");
  const [birthday,    setBirthday]    = useState("");
  const [location,    setLocation]    = useState("");
  const [interests,   setInterests]   = useState<string[]>([]);
  const [categories,  setCategories]  = useState<string[]>([]);
  const [language,    setLanguage]    = useState("en");
  const [socials,     setSocials]     = useState<Record<SocialPlatform, string>>({
    facebook: "", instagram: "", tiktok: "", youtube: "", twitter: "", website: "", other: "",
  });

  const [usernameErr, setUsernameErr] = useState<string | null>(null);
  const [isSaving,    setIsSaving]    = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [emailModal,    setEmailModal]    = useState(false);
  const [verifyEmailModal, setVerifyEmailModal] = useState(false);
  const [phoneModal,    setPhoneModal]    = useState(false);
  const [locationModal, setLocationModal] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [confirmRemove,  setConfirmRemove]  = useState(false);

  /* ── Original (server) snapshot for dirty tracking ── */
  const originalRef = useRef<string>("");

  function snapshot() {
    return JSON.stringify({
      fullName, username, bio, website, gender, birthday, location, interests, categories, language, socials,
    });
  }

  /* Hydrate state from API response */
  useEffect(() => {
    if (!profile || hydrated) return;
    setFullName(profile.name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setWebsite(profile.website ?? "");
    setGender(profile.gender ?? "prefer_not_to_say");
    setBirthday(profile.date_of_birth ?? "");
    setLocation(profile.location ?? "");
    setInterests(profile.interests ?? []);
    setCategories(profile.categories ?? []);
    setLanguage(profile.language ?? "en");

    // Map social_links array → keyed object
    const next: Record<SocialPlatform, string> = {
      facebook: "", instagram: "", tiktok: "", youtube: "", twitter: "", website: "", other: "",
    };
    (profile.social_links ?? []).forEach((l) => {
      if (l.platform in next) next[l.platform as SocialPlatform] = l.url;
    });
    setSocials(next);

    setAvatarPreview(profile.avatar ?? null);
    setHydrated(true);

    // Capture initial snapshot AFTER state settles
    setTimeout(() => {
      originalRef.current = JSON.stringify({
        fullName: profile.name ?? "",
        username: profile.username ?? "",
        bio: profile.bio ?? "",
        website: profile.website ?? "",
        gender: profile.gender ?? "prefer_not_to_say",
        birthday: profile.date_of_birth ?? "",
        location: profile.location ?? "",
        interests: profile.interests ?? [],
        categories: profile.categories ?? [],
        language: profile.language ?? "en",
        socials: next,
      });
    }, 0);
  }, [profile, hydrated]);

  const isDirty = hydrated && (originalRef.current !== snapshot() || avatarFile !== null);

  /* ── Username availability check (debounced) ── */
  useEffect(() => {
    if (!hydrated) return;
    if (!username || username === profile?.username) { setUsernameErr(null); return; }
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
      setUsernameErr("Username can only contain letters, numbers, underscore, and dot.");
      return;
    }
    if (username.length < 3) { setUsernameErr("Username must be at least 3 characters."); return; }
    const t = setTimeout(async () => {
      try {
        const r = await profileService.checkUsername(username);
        setUsernameErr(r.available ? null : (r.reason ?? "Username already taken."));
      } catch {
        /* ignore network blips */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [username, hydrated, profile?.username]);

  /* ── Avatar handling ── */
  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Image must be 5 MB or smaller."); return; }
    if (!/^image\/(jpe?g|png|webp)$/.test(f.type)) { toast.error("Use JPG, PNG, or WEBP."); return; }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
    // Reset the input so the same file can be re-selected if needed
    if (fileRef.current) fileRef.current.value = "";
  }

  /** First click discards a pending file OR opens the confirm UI; second click confirms delete. */
  function handleAvatarRemoveClick() {
    // Pending file: discard immediately, no confirmation needed
    if (avatarFile) {
      setAvatarFile(null);
      setAvatarPreview(profile?.avatar ?? null);
      toast.info("Pending photo discarded.");
      return;
    }
    if (!profile?.has_avatar) return;
    setConfirmRemove(true);
  }

  async function performAvatarRemove() {
    setConfirmRemove(false);
    setRemovingAvatar(true);
    try {
      await profileService.removeAvatar();
      // Optimistic clear of every avatar surface
      setAvatarPreview(null);
      setAvatarFile(null);
      setUser({ avatar: null, has_avatar: false });
      qc.setQueryData(["account-profile"], (old: ProfileResource | undefined) =>
        old ? { ...old, avatar: null, has_avatar: false } : old,
      );
      // Belt-and-braces: refetch profile from server so we're never out of sync
      await qc.invalidateQueries({ queryKey: ["account-profile"] });
      // Drop every cached avatar surface - public profile, followers list, comments,
      // suggested accounts. Use predicate-based invalidation so we catch every
      // "profile" / "user" / "feed" / "followers" query regardless of params.
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return k === "profile"
              || k === "user-profile"
              || k === "profile-videos"
              || k === "profile-liked"
              || k === "followers"
              || k === "following"
              || k === "suggested-accounts";
        },
      });
      toast.success("Profile photo removed.");
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setRemovingAvatar(false);
    }
  }

  /* ── Reset ── */
  function handleReset() {
    if (!hydrated || !profile) return;
    setHydrated(false);
    setAvatarFile(null);
    requestAnimationFrame(() => qc.invalidateQueries({ queryKey: ["account-profile"] }));
    toast.info("Changes reverted.");
  }

  /* ── Save ── */
  async function handleSave() {
    if (usernameErr) { toast.error(usernameErr); return; }
    if (!fullName.trim())   { toast.error("Full Name is required."); return; }
    if (!username.trim())   { toast.error("Username is required."); return; }

    setIsSaving(true);
    try {
      // 1) Profile core fields
      const updated = await profileService.update({
        name:          fullName.trim(),
        username:      username.trim(),
        bio:           bio.trim() || null,
        website:       website.trim() || null,
        gender,
        language,
        interests,
        categories,
        location:      location.trim() || null,
        date_of_birth: birthday || null,
      });

      // 2) Avatar (if new)
      if (avatarFile) {
        const r = await profileService.uploadAvatar(avatarFile);
        updated.avatar = r.avatar_url;
        updated.has_avatar = true;
        setAvatarFile(null);
      }

      // 3) Social links - normalize + filter empty, saved independently so a
      //    social-link validation error never blocks the profile save success.
      const links: SocialLinkPayload[] = [];
      (Object.keys(socials) as SocialPlatform[]).forEach((k) => {
        const url = normalizeSocialUrl(k, socials[k]);
        if (url) links.push({ platform: k, url });
      });
      let savedLinks = links;
      try {
        await profileService.updateSocialLinks(links);
      } catch (socialErr) {
        // Social links save failed - profile itself was already saved. Show a
        // non-blocking warning and continue so the success toast still fires.
        toast.warning(
          "Profile saved, but social links could not be updated: " +
          apiMessage(socialErr),
        );
        // Keep whatever the server currently has so we don't optimistically lie.
        savedLinks = profile?.social_links ?? [];
      }

      // 4) Sync auth store + caches
      setUser({
        name:          updated.name,
        username:      updated.username,
        bio:           updated.bio,
        website:       updated.website,
        location:      updated.location,
        gender:        updated.gender,
        language:      updated.language,
        interests:     updated.interests,
        categories:    updated.categories,
        avatar:        updated.avatar,
        has_avatar:    updated.has_avatar,
        date_of_birth: updated.date_of_birth,
        social_links:  savedLinks,
      });
      qc.setQueryData(["account-profile"], { ...updated, social_links: savedLinks });

      // Invalidate every query that shows the user's avatar / profile data.
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return k === "profile"
              || k === "user-profile"
              || k === "profile-videos"
              || k === "profile-liked"
              || k === "followers"
              || k === "following"
              || k === "suggested-accounts";
        },
      });

      // Re-snapshot so isDirty resets to false.
      setHydrated(false);
      requestAnimationFrame(() => setHydrated(true));

      toast.success("Account settings updated successfully.");
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setIsSaving(false);
    }
  }

  /* ── Export ── */
  async function handleExport() {
    setExporting(true);
    try {
      await accountService.exportData();
      toast.success("Account data downloaded.");
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setExporting(false);
    }
  }

  /* ── Derived display ── */
  const detectedCountryStr = detected?.countryName ?? "Unable to detect";
  const detectedRegionStr  = detected ? (detected.countryName ?? "-") : "Unable to detect";
  const detectedIspStr     = detected?.ispOrganization ?? "Unknown";

  const statusBadge      = statusBadgeColor(accountStatus?.account_status);
  const visibilityBadge  = visibilityLabel(accountStatus?.profile_visibility_status);

  const card = "flex flex-col gap-2.5 rounded-2xl border border-[#e8eaf0] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]";

  if (authReady && !isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h2 className="text-[18px] font-extrabold text-[#111827]">Sign in to manage your account</h2>
          <p className="mt-1 text-[13px] text-[#6b7280]">Account Settings is available to logged-in users only.</p>
          <button
            onClick={() => openAuthModal("login")}
            className="mt-4 rounded-full bg-[#fe2c55] px-5 py-2 text-[13px] font-bold text-white"
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader title="Account Settings" subtitle="Manage your profile and account information" />

      {/* Active account restrictions banner */}
      {activeRestrictions.length > 0 && (
        <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="mb-2.5 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0 text-[#d97706]" />
            <p className="text-[13px] font-bold text-[#92400e]">Active Account Restrictions</p>
          </div>
          <div className="flex flex-col gap-2">
            {activeRestrictions.map((r: ActiveRestriction) => (
              <div
                key={r.type}
                className="flex items-start gap-3 rounded-[10px] border border-[#fde68a] bg-white px-3 py-2.5"
              >
                <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#d97706]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-[#111827]">{r.label}</p>
                  {r.is_permanent ? (
                    <p className="mt-0.5 text-[11px] text-[#dc2626] font-semibold">Permanent restriction</p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-[#92400e]">
                      {r.time_remaining
                        ? <><span className="font-semibold">{r.time_remaining} remaining</span>{r.expires_at_label ? ` - until ${r.expires_at_label}` : ""}</>
                        : r.expires_at_label ? `Until ${r.expires_at_label}` : null
                      }
                    </p>
                  )}
                  {r.reason && (
                    <p className="mt-0.5 text-[11px] text-[#6b7280]">Reason: {r.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[10.5px] text-[#92400e]">
              These restrictions were applied by Teezer.
            </p>
            <a
              href="/settings/restrictions"
              className="flex-shrink-0 text-[10.5px] font-bold text-[#d97706] hover:underline"
            >
              View countdown &amp; details →
            </a>
          </div>
        </div>
      )}

      {/* Row 1: 3 cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Card 1: Profile Information */}
        <div className={card} style={{ minHeight: 380 }}>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SectionBadge n={1} />
            <SectionTitle>Profile Information</SectionTitle>
          </div>
          <div className="flex flex-1 gap-3">
            <div className="flex w-[90px] flex-shrink-0 flex-col items-center gap-2 pt-1">
              <div className="relative">
                <div className="h-[72px] w-[72px] overflow-hidden rounded-full ring-2 ring-[#e8eaf0]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarPreview || "/default-avatar.svg"}
                    alt="avatar"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      if (!img.src.endsWith("/default-avatar.svg")) img.src = "/default-avatar.svg";
                    }}
                  />
                </div>
                <button onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-2 border-white shadow-sm"
                  style={{ background: BRAND }}>
                  <Camera className="h-3 w-3 text-white" />
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
              </div>
              <button onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border border-[#e8eaf0] bg-white px-2 py-1 text-center text-[10px] font-semibold text-[#374151] transition-colors hover:border-[#fe2c55] hover:text-[#fe2c55]">
                {avatarFile ? "Replace" : (profile?.has_avatar ? "Change Photo" : "Upload Photo")}
              </button>
              {(avatarFile || profile?.has_avatar) && !confirmRemove && (
                <button
                  onClick={handleAvatarRemoveClick}
                  disabled={removingAvatar}
                  className="w-full rounded-lg border border-[#fee2e2] bg-white px-2 py-1 text-center text-[10px] font-semibold text-[#dc2626] transition-colors hover:bg-[#fef2f2] hover:border-[#fecaca] disabled:opacity-60"
                >
                  {removingAvatar ? "Removing…" : (avatarFile ? "Discard" : "Remove")}
                </button>
              )}
              {confirmRemove && !avatarFile && (
                <div className="flex w-full flex-col gap-1">
                  <p className="text-center text-[9px] font-semibold leading-tight text-[#dc2626]">
                    Remove photo?
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setConfirmRemove(false)}
                      className="flex-1 rounded-lg border border-[#e8eaf0] bg-white py-1 text-[10px] font-semibold text-[#374151] hover:bg-[#f8fafc]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={performAvatarRemove}
                      disabled={removingAvatar}
                      className="flex-1 rounded-lg border border-[#dc2626] bg-[#dc2626] py-1 text-[10px] font-semibold text-white hover:bg-[#b91c1c] disabled:opacity-60"
                    >
                      {removingAvatar ? "…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-center text-[9px] leading-tight text-[#c0c4cc]">JPG, PNG, WEBP<br />up to 5 MB</p>
            </div>
            <div className="flex flex-1 min-w-0 flex-col gap-2 overflow-y-auto pr-0.5">
              <Field label="Full Name"   value={fullName} onChange={setFullName} placeholder="Your full name" maxLength={20} />
              <Field label="Username"    value={username} onChange={setUsername} placeholder="your_username" error={usernameErr} maxLength={25} />
              <Field label="Bio"         value={bio}      onChange={setBio}      placeholder="Tell your story…" rows={3} />
              <div className="flex flex-col gap-[3px]">
                <div className="flex items-baseline justify-between">
                  <label className="text-[11px] font-semibold text-[#6b7280]">Profile Category / Interests</label>
                  <span className="text-[10px] text-[#c0c4cc]">{categories.length} / 3 · shown on your profile</span>
                </div>
                <InterestsPicker
                  selected={categories}
                  onChange={setCategories}
                  options={PROFILE_CATEGORIES}
                  max={3}
                  noun="categories"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Personal Information */}
        <div className={card} style={{ minHeight: 380 }}>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SectionBadge n={2} />
            <SectionTitle>Personal Information</SectionTitle>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            <div className="flex flex-col gap-[3px]">
              <label className="text-[11px] font-semibold text-[#6b7280]">Gender</label>
              <NiceSelect
                value={GENDERS.find((g) => g.value === gender)?.label ?? "Prefer not to say"}
                onChange={(lbl) => setGender(GENDERS.find((g) => g.label === lbl)?.value ?? "prefer_not_to_say")}
                options={GENDERS.map((g) => g.label)}
                fullWidth
              />
            </div>
            <div className="flex flex-col gap-[3px]">
              <label className="text-[11px] font-semibold text-[#6b7280]">Birthday</label>
              <DOBPicker value={birthday} onChange={setBirthday} />
            </div>
            <InfoRow icon={Globe} label="Email Address" value={user?.email ?? "-"}
              action={
                <button onClick={() => setEmailModal(true)}
                  className="rounded-full border border-[#e8eaf0] px-2 py-0.5 text-[10px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors">
                  Change
                </button>
              }
            />
            <InfoRow icon={Wifi} label="Phone Number" value={user?.phone ?? "-"}
              action={
                <button onClick={() => setPhoneModal(true)}
                  className="rounded-full border border-[#e8eaf0] px-2 py-0.5 text-[10px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors">
                  Change
                </button>
              }
            />
            {/* Location - enhanced row with Change button */}
            <div className="flex flex-col gap-[3px]">
              <label className="text-[11px] font-semibold text-[#6b7280]">Location</label>
              <div className="flex items-center gap-2 rounded-[10px] border border-[#e8eaf0] bg-white px-2.5 py-2">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
                <span className={`flex-1 truncate text-[13px] ${location ? "text-[#111827]" : "text-[#9ca3af]"}`}>
                  {location || "Not set"}
                </span>
                <button
                  type="button"
                  onClick={() => setLocationModal(true)}
                  className="flex-shrink-0 rounded-full border border-[#e8eaf0] px-2 py-0.5 text-[10px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Social Links */}
        <div className={card} style={{ minHeight: 380 }}>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SectionBadge n={3} />
            <SectionTitle>Social Links</SectionTitle>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {SOCIAL_KEYS.map(({ key, label, icon, placeholder }) => (
              <div key={key} className="flex items-center gap-2.5 rounded-[10px] border border-[#e8eaf0] bg-white px-2.5 py-1.5">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#f4f5f7]">
                  {icon}
                </span>
                <div className="flex flex-1 min-w-0 flex-col">
                  <span className="text-[10px] font-semibold text-[#9ca3af]">{label}</span>
                  <input
                    value={socials[key]}
                    onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Country + Language/ISP + Account Data */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Country Lock Card (full feature) */}
        <CountryLockCard />

        {/* Language + Region/ISP */}
        <div className={card}>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SectionBadge n={4} />
            <SectionTitle>Language &amp; Region</SectionTitle>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-[3px]">
              <label className="text-[11px] font-semibold text-[#6b7280]">App Language</label>
              <NiceSelect
                value={(LANGUAGES.find((l) => l.code === language)?.name) ?? "English"}
                onChange={(lbl) => {
                  const l = LANGUAGES.find((x) => x.name === lbl);
                  if (l) setLanguage(l.code);
                }}
                options={LANGUAGES.map((l) => l.name)}
                fullWidth
              />
              <p className="mt-0.5 text-[10px] text-[#9ca3af]">
                {LANGUAGES.find((l) => l.code === language)?.native ?? "English"} · saved to your profile.
              </p>
            </div>
            <InfoRow icon={Languages} label="Language Code"     value={language.toUpperCase()} />
            <InfoRow icon={MapPin}    label="Detected Country"  value={detectedCountryStr} />
            <InfoRow icon={Globe}     label="Region / Location" value={detectedRegionStr} />
            <InfoRow icon={Wifi}      label="ISP Info"          value={detectedIspStr}
              badge={
                <button
                  type="button"
                  onClick={() => refetchDetect()}
                  disabled={detectFetching}
                  className="grid h-5 w-5 place-items-center rounded-full text-[#9ca3af] hover:text-[#fe2c55] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${detectFetching ? "animate-spin" : ""}`} />
                </button>
              }
            />
          </div>
        </div>

        {/* Account Data */}
        <div className={card}>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SectionBadge n={5} />
            <SectionTitle>Account Data</SectionTitle>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-[10px] border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff]">
                <Download className="h-4 w-4 text-[#3b82f6]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold leading-tight text-[#111827]">Download Your Data</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#9ca3af]">
                  Get a JSON copy of your Teezer profile and activity.
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex-shrink-0 rounded-full border border-[#e8eaf0] px-3 py-1 text-[11px] font-semibold text-[#374151] transition-colors hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-60"
              >
                {exporting ? "Preparing…" : "Download"}
              </button>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#f0fdf4]">
                <ShieldCheck className="h-4 w-4 text-[#16a34a]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold leading-tight text-[#111827]">Account Status</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#9ca3af]">Current standing of your account.</p>
              </div>
              <StatusBadge label={statusBadge.label} color={statusBadge.color} />
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#f5f3ff]">
                <Eye className="h-4 w-4 text-[#7c3aed]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold leading-tight text-[#111827]">Profile Visibility</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#9ca3af]">
                  Controlled from Privacy &amp; Safety settings.
                </p>
              </div>
              <StatusBadge label={visibilityBadge.label} color={visibilityBadge.color} />
            </div>
            <div
              onClick={() => { if (!accountStatus?.email_verified) setVerifyEmailModal(true); }}
              className={`flex items-center gap-3 rounded-[10px] border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2 ${accountStatus?.email_verified ? "" : "cursor-pointer hover:bg-[#f3f4f6]"}`}
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#fff7ed]">
                <Lock className="h-4 w-4 text-[#f97316]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold leading-tight text-[#111827]">Email Verified</p>
                <p className="mt-0.5 text-[10px] leading-snug text-[#9ca3af]">
                  {accountStatus?.email_verified ? "Your email address is verified." : "Tap to verify your email with a code."}
                </p>
              </div>
              <StatusBadge label={accountStatus?.email_verified ? "Verified" : "Pending"} color={accountStatus?.email_verified ? "green" : "blue"} />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky save bar - only when dirty */}
      {isDirty && (
        <div className="sticky bottom-3 z-40">
          <div className="mt-2 flex items-center justify-between rounded-2xl border border-[#e8eaf0] bg-white px-5 py-3 shadow-[0_6px_20px_rgba(0,0,0,0.10)]">
            <div className="flex items-center gap-2 text-[12px] text-[#6b7280]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" />
              You have unsaved changes
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                disabled={isSaving}
                className="rounded-[10px] border border-[#e8eaf0] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#374151] hover:border-[#d1d5db] hover:text-[#111827] disabled:opacity-60"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !!usernameErr}
                className="rounded-[10px] bg-[#fe2c55] px-5 py-1.5 text-[12.5px] font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                style={{ boxShadow: "0 2px 12px rgba(254,44,85,0.30)" }}
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Always-on action bar (Reset/Save) at the bottom of page */}
      {!isDirty && (
        <ActionBar onReset={handleReset} onSave={handleSave} />
      )}

      {/* Email / Phone change modals */}
      <ContactChangeModal
        open={emailModal}
        mode="email"
        currentValue={user?.email}
        onClose={() => setEmailModal(false)}
        onSaved={(v) => setUser({ email: v })}
      />
      <ContactChangeModal
        open={phoneModal}
        mode="phone"
        currentValue={user?.phone}
        onClose={() => setPhoneModal(false)}
        onSaved={(v) => setUser({ phone: v })}
      />

      <EmailVerifyModal
        open={verifyEmailModal}
        email={user?.email ?? ""}
        onClose={() => setVerifyEmailModal(false)}
        onVerified={() => qc.invalidateQueries({ queryKey: ["account-status"] })}
      />

      {/* Location change modal */}
      {locationModal && (
        <LocationChangeModal
          currentLocation={location}
          countryCode={profile?.country ?? user?.country ?? null}
          countryName={profile?.country ?? user?.country ?? null}
          onSaved={(formatted) => {
            setLocation(formatted);
            // Mark dirty so the main Save button reflects the change
            qc.setQueryData<ProfileResource>(["account-profile"], (old) =>
              old ? { ...old, location: formatted } : old,
            );
          }}
          onClose={() => setLocationModal(false)}
        />
      )}
    </div>
  );
}
