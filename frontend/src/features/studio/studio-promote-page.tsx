"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity, AlertCircle, BarChart2, BookOpen, Bookmark, Briefcase, Building2,
  Camera, Car, ChefHat, Clapperboard, Check, ChevronDown, Contact,
  CreditCard, Dumbbell, Eye, Flame, Gamepad2, GraduationCap, Grid3X3,
  Hammer, Heart, HeartPulse, HelpCircle, Info, Leaf, Loader2,
  Monitor, Music, Newspaper, Palette, PawPrint, Plane, Play, PlayCircle,
  Search, Shield, Shirt, Smile, Sparkles, Sun, ThumbsUp, TrendingUp, Trees,
  Trophy, UserPlus, Users, Utensils, Video, Wallet, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { detectUserCountry } from "@/lib/country";
import { api } from "@/services/api";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import type { ReelsooVideo } from "@/types/video";

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Objective = "more_views" | "more_followers" | "more_profile_visits" | "more_engagement";
type Gender    = "all" | "male" | "female";
type PayMethod = "reelsoo_balance" | "credit_card" | "e_wallet" | "bank_transfer";

/* ─── All world countries ────────────────────────────────────────────────── */
const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code:"AF", name:"Afghanistan",              flag:"🇦🇫" },
  { code:"AL", name:"Albania",                  flag:"🇦🇱" },
  { code:"DZ", name:"Algeria",                  flag:"🇩🇿" },
  { code:"AD", name:"Andorra",                  flag:"🇦🇩" },
  { code:"AO", name:"Angola",                   flag:"🇦🇴" },
  { code:"AG", name:"Antigua and Barbuda",      flag:"🇦🇬" },
  { code:"AR", name:"Argentina",                flag:"🇦🇷" },
  { code:"AM", name:"Armenia",                  flag:"🇦🇲" },
  { code:"AU", name:"Australia",                flag:"🇦🇺" },
  { code:"AT", name:"Austria",                  flag:"🇦🇹" },
  { code:"AZ", name:"Azerbaijan",               flag:"🇦🇿" },
  { code:"BS", name:"Bahamas",                  flag:"🇧🇸" },
  { code:"BH", name:"Bahrain",                  flag:"🇧🇭" },
  { code:"BD", name:"Bangladesh",               flag:"🇧🇩" },
  { code:"BB", name:"Barbados",                 flag:"🇧🇧" },
  { code:"BY", name:"Belarus",                  flag:"🇧🇾" },
  { code:"BE", name:"Belgium",                  flag:"🇧🇪" },
  { code:"BZ", name:"Belize",                   flag:"🇧🇿" },
  { code:"BJ", name:"Benin",                    flag:"🇧🇯" },
  { code:"BT", name:"Bhutan",                   flag:"🇧🇹" },
  { code:"BO", name:"Bolivia",                  flag:"🇧🇴" },
  { code:"BA", name:"Bosnia and Herzegovina",   flag:"🇧🇦" },
  { code:"BW", name:"Botswana",                 flag:"🇧🇼" },
  { code:"BR", name:"Brazil",                   flag:"🇧🇷" },
  { code:"BN", name:"Brunei",                   flag:"🇧🇳" },
  { code:"BG", name:"Bulgaria",                 flag:"🇧🇬" },
  { code:"BF", name:"Burkina Faso",             flag:"🇧🇫" },
  { code:"BI", name:"Burundi",                  flag:"🇧🇮" },
  { code:"CV", name:"Cabo Verde",               flag:"🇨🇻" },
  { code:"KH", name:"Cambodia",                 flag:"🇰🇭" },
  { code:"CM", name:"Cameroon",                 flag:"🇨🇲" },
  { code:"CA", name:"Canada",                   flag:"🇨🇦" },
  { code:"CF", name:"Central African Republic", flag:"🇨🇫" },
  { code:"TD", name:"Chad",                     flag:"🇹🇩" },
  { code:"CL", name:"Chile",                    flag:"🇨🇱" },
  { code:"CN", name:"China",                    flag:"🇨🇳" },
  { code:"CO", name:"Colombia",                 flag:"🇨🇴" },
  { code:"KM", name:"Comoros",                  flag:"🇰🇲" },
  { code:"CG", name:"Congo",                    flag:"🇨🇬" },
  { code:"CR", name:"Costa Rica",               flag:"🇨🇷" },
  { code:"HR", name:"Croatia",                  flag:"🇭🇷" },
  { code:"CU", name:"Cuba",                     flag:"🇨🇺" },
  { code:"CY", name:"Cyprus",                   flag:"🇨🇾" },
  { code:"CZ", name:"Czech Republic",           flag:"🇨🇿" },
  { code:"DK", name:"Denmark",                  flag:"🇩🇰" },
  { code:"DJ", name:"Djibouti",                 flag:"🇩🇯" },
  { code:"DM", name:"Dominica",                 flag:"🇩🇲" },
  { code:"DO", name:"Dominican Republic",       flag:"🇩🇴" },
  { code:"EC", name:"Ecuador",                  flag:"🇪🇨" },
  { code:"EG", name:"Egypt",                    flag:"🇪🇬" },
  { code:"SV", name:"El Salvador",              flag:"🇸🇻" },
  { code:"GQ", name:"Equatorial Guinea",        flag:"🇬🇶" },
  { code:"ER", name:"Eritrea",                  flag:"🇪🇷" },
  { code:"EE", name:"Estonia",                  flag:"🇪🇪" },
  { code:"SZ", name:"Eswatini",                 flag:"🇸🇿" },
  { code:"ET", name:"Ethiopia",                 flag:"🇪🇹" },
  { code:"FJ", name:"Fiji",                     flag:"🇫🇯" },
  { code:"FI", name:"Finland",                  flag:"🇫🇮" },
  { code:"FR", name:"France",                   flag:"🇫🇷" },
  { code:"GA", name:"Gabon",                    flag:"🇬🇦" },
  { code:"GM", name:"Gambia",                   flag:"🇬🇲" },
  { code:"GE", name:"Georgia",                  flag:"🇬🇪" },
  { code:"DE", name:"Germany",                  flag:"🇩🇪" },
  { code:"GH", name:"Ghana",                    flag:"🇬🇭" },
  { code:"GR", name:"Greece",                   flag:"🇬🇷" },
  { code:"GD", name:"Grenada",                  flag:"🇬🇩" },
  { code:"GT", name:"Guatemala",                flag:"🇬🇹" },
  { code:"GN", name:"Guinea",                   flag:"🇬🇳" },
  { code:"GW", name:"Guinea-Bissau",            flag:"🇬🇼" },
  { code:"GY", name:"Guyana",                   flag:"🇬🇾" },
  { code:"HT", name:"Haiti",                    flag:"🇭🇹" },
  { code:"HN", name:"Honduras",                 flag:"🇭🇳" },
  { code:"HU", name:"Hungary",                  flag:"🇭🇺" },
  { code:"IS", name:"Iceland",                  flag:"🇮🇸" },
  { code:"IN", name:"India",                    flag:"🇮🇳" },
  { code:"ID", name:"Indonesia",                flag:"🇮🇩" },
  { code:"IR", name:"Iran",                     flag:"🇮🇷" },
  { code:"IQ", name:"Iraq",                     flag:"🇮🇶" },
  { code:"IE", name:"Ireland",                  flag:"🇮🇪" },
  { code:"IL", name:"Israel",                   flag:"🇮🇱" },
  { code:"IT", name:"Italy",                    flag:"🇮🇹" },
  { code:"JM", name:"Jamaica",                  flag:"🇯🇲" },
  { code:"JP", name:"Japan",                    flag:"🇯🇵" },
  { code:"JO", name:"Jordan",                   flag:"🇯🇴" },
  { code:"KZ", name:"Kazakhstan",               flag:"🇰🇿" },
  { code:"KE", name:"Kenya",                    flag:"🇰🇪" },
  { code:"KI", name:"Kiribati",                 flag:"🇰🇮" },
  { code:"KW", name:"Kuwait",                   flag:"🇰🇼" },
  { code:"KG", name:"Kyrgyzstan",               flag:"🇰🇬" },
  { code:"LA", name:"Laos",                     flag:"🇱🇦" },
  { code:"LV", name:"Latvia",                   flag:"🇱🇻" },
  { code:"LB", name:"Lebanon",                  flag:"🇱🇧" },
  { code:"LS", name:"Lesotho",                  flag:"🇱🇸" },
  { code:"LR", name:"Liberia",                  flag:"🇱🇷" },
  { code:"LY", name:"Libya",                    flag:"🇱🇾" },
  { code:"LI", name:"Liechtenstein",            flag:"🇱🇮" },
  { code:"LT", name:"Lithuania",                flag:"🇱🇹" },
  { code:"LU", name:"Luxembourg",               flag:"🇱🇺" },
  { code:"MG", name:"Madagascar",               flag:"🇲🇬" },
  { code:"MW", name:"Malawi",                   flag:"🇲🇼" },
  { code:"MY", name:"Malaysia",                 flag:"🇲🇾" },
  { code:"MV", name:"Maldives",                 flag:"🇲🇻" },
  { code:"ML", name:"Mali",                     flag:"🇲🇱" },
  { code:"MT", name:"Malta",                    flag:"🇲🇹" },
  { code:"MH", name:"Marshall Islands",         flag:"🇲🇭" },
  { code:"MR", name:"Mauritania",               flag:"🇲🇷" },
  { code:"MU", name:"Mauritius",                flag:"🇲🇺" },
  { code:"MX", name:"Mexico",                   flag:"🇲🇽" },
  { code:"FM", name:"Micronesia",               flag:"🇫🇲" },
  { code:"MD", name:"Moldova",                  flag:"🇲🇩" },
  { code:"MC", name:"Monaco",                   flag:"🇲🇨" },
  { code:"MN", name:"Mongolia",                 flag:"🇲🇳" },
  { code:"ME", name:"Montenegro",               flag:"🇲🇪" },
  { code:"MA", name:"Morocco",                  flag:"🇲🇦" },
  { code:"MZ", name:"Mozambique",               flag:"🇲🇿" },
  { code:"MM", name:"Myanmar",                  flag:"🇲🇲" },
  { code:"NA", name:"Namibia",                  flag:"🇳🇦" },
  { code:"NR", name:"Nauru",                    flag:"🇳🇷" },
  { code:"NP", name:"Nepal",                    flag:"🇳🇵" },
  { code:"NL", name:"Netherlands",              flag:"🇳🇱" },
  { code:"NZ", name:"New Zealand",              flag:"🇳🇿" },
  { code:"NI", name:"Nicaragua",                flag:"🇳🇮" },
  { code:"NE", name:"Niger",                    flag:"🇳🇪" },
  { code:"NG", name:"Nigeria",                  flag:"🇳🇬" },
  { code:"NO", name:"Norway",                   flag:"🇳🇴" },
  { code:"OM", name:"Oman",                     flag:"🇴🇲" },
  { code:"PK", name:"Pakistan",                 flag:"🇵🇰" },
  { code:"PW", name:"Palau",                    flag:"🇵🇼" },
  { code:"PA", name:"Panama",                   flag:"🇵🇦" },
  { code:"PG", name:"Papua New Guinea",         flag:"🇵🇬" },
  { code:"PY", name:"Paraguay",                 flag:"🇵🇾" },
  { code:"PE", name:"Peru",                     flag:"🇵🇪" },
  { code:"PH", name:"Philippines",              flag:"🇵🇭" },
  { code:"PL", name:"Poland",                   flag:"🇵🇱" },
  { code:"PT", name:"Portugal",                 flag:"🇵🇹" },
  { code:"QA", name:"Qatar",                    flag:"🇶🇦" },
  { code:"RO", name:"Romania",                  flag:"🇷🇴" },
  { code:"RU", name:"Russia",                   flag:"🇷🇺" },
  { code:"RW", name:"Rwanda",                   flag:"🇷🇼" },
  { code:"KN", name:"Saint Kitts and Nevis",    flag:"🇰🇳" },
  { code:"LC", name:"Saint Lucia",              flag:"🇱🇨" },
  { code:"VC", name:"Saint Vincent & Grenadines",flag:"🇻🇨"},
  { code:"WS", name:"Samoa",                    flag:"🇼🇸" },
  { code:"SM", name:"San Marino",               flag:"🇸🇲" },
  { code:"ST", name:"Sao Tome and Principe",    flag:"🇸🇹" },
  { code:"SA", name:"Saudi Arabia",             flag:"🇸🇦" },
  { code:"SN", name:"Senegal",                  flag:"🇸🇳" },
  { code:"RS", name:"Serbia",                   flag:"🇷🇸" },
  { code:"SC", name:"Seychelles",               flag:"🇸🇨" },
  { code:"SL", name:"Sierra Leone",             flag:"🇸🇱" },
  { code:"SG", name:"Singapore",                flag:"🇸🇬" },
  { code:"SK", name:"Slovakia",                 flag:"🇸🇰" },
  { code:"SI", name:"Slovenia",                 flag:"🇸🇮" },
  { code:"SB", name:"Solomon Islands",          flag:"🇸🇧" },
  { code:"SO", name:"Somalia",                  flag:"🇸🇴" },
  { code:"ZA", name:"South Africa",             flag:"🇿🇦" },
  { code:"SS", name:"South Sudan",              flag:"🇸🇸" },
  { code:"ES", name:"Spain",                    flag:"🇪🇸" },
  { code:"LK", name:"Sri Lanka",                flag:"🇱🇰" },
  { code:"SD", name:"Sudan",                    flag:"🇸🇩" },
  { code:"SR", name:"Suriname",                 flag:"🇸🇷" },
  { code:"SE", name:"Sweden",                   flag:"🇸🇪" },
  { code:"CH", name:"Switzerland",              flag:"🇨🇭" },
  { code:"SY", name:"Syria",                    flag:"🇸🇾" },
  { code:"TW", name:"Taiwan",                   flag:"🇹🇼" },
  { code:"TJ", name:"Tajikistan",               flag:"🇹🇯" },
  { code:"TZ", name:"Tanzania",                 flag:"🇹🇿" },
  { code:"TH", name:"Thailand",                 flag:"🇹🇭" },
  { code:"TL", name:"Timor-Leste",              flag:"🇹🇱" },
  { code:"TG", name:"Togo",                     flag:"🇹🇬" },
  { code:"TO", name:"Tonga",                    flag:"🇹🇴" },
  { code:"TT", name:"Trinidad and Tobago",      flag:"🇹🇹" },
  { code:"TN", name:"Tunisia",                  flag:"🇹🇳" },
  { code:"TR", name:"Turkey",                   flag:"🇹🇷" },
  { code:"TM", name:"Turkmenistan",             flag:"🇹🇲" },
  { code:"TV", name:"Tuvalu",                   flag:"🇹🇻" },
  { code:"UG", name:"Uganda",                   flag:"🇺🇬" },
  { code:"UA", name:"Ukraine",                  flag:"🇺🇦" },
  { code:"AE", name:"United Arab Emirates",     flag:"🇦🇪" },
  { code:"GB", name:"United Kingdom",           flag:"🇬🇧" },
  { code:"US", name:"United States",            flag:"🇺🇸" },
  { code:"UY", name:"Uruguay",                  flag:"🇺🇾" },
  { code:"UZ", name:"Uzbekistan",               flag:"🇺🇿" },
  { code:"VU", name:"Vanuatu",                  flag:"🇻🇺" },
  { code:"VE", name:"Venezuela",                flag:"🇻🇪" },
  { code:"VN", name:"Vietnam",                  flag:"🇻🇳" },
  { code:"YE", name:"Yemen",                    flag:"🇾🇪" },
  { code:"ZM", name:"Zambia",                   flag:"🇿🇲" },
  { code:"ZW", name:"Zimbabwe",                 flag:"🇿🇼" },
];

/* ─── Interests - same as Account Settings page ──────────────────────────── */
const ALL_INTERESTS = [
  "Creator", "Photography", "Music", "Travel", "Dance", "Lifestyle", "Food",
  "Fashion", "Beauty", "Fitness", "Sports", "Gaming", "Education", "Technology",
  "Business", "Motivation", "News", "Entertainment", "Vlog", "Art",
  "Animals & Pets", "Nature", "Cars & Bikes", "Health", "DIY & Crafts", "Reviews",
  "Tutorials", "Religious / Spiritual", "Other",
];

/* ─── Icon map per interest (from upload-page CATEGORY_ICONS) ────────────── */
const INTEREST_ICON: Record<string, React.ElementType> = {
  "Creator":               Sparkles,
  "Photography":           Camera,
  "Music":                 Music,
  "Travel":                Plane,
  "Dance":                 Zap,
  "Lifestyle":             Leaf,
  "Food":                  Utensils,
  "Fashion":               Shirt,
  "Beauty":                Sparkles,
  "Fitness":               Dumbbell,
  "Sports":                Trophy,
  "Gaming":                Gamepad2,
  "Education":             GraduationCap,
  "Technology":            Monitor,
  "Business":              Briefcase,
  "Motivation":            Flame,
  "News":                  Newspaper,
  "Entertainment":         Clapperboard,
  "Vlog":                  Video,
  "Art":                   Palette,
  "Animals & Pets":        PawPrint,
  "Nature":                Trees,
  "Cars & Bikes":          Car,
  "Health":                HeartPulse,
  "DIY & Crafts":          Hammer,
  "Reviews":               ThumbsUp,
  "Tutorials":             BookOpen,
  "Religious / Spiritual": Sun,
  "Other":                 HelpCircle,
};

/* ─── Interest categories with icons (filter tabs) ──────────────────────── */
const INTEREST_CATEGORIES: { label: string; icon: React.ElementType; items: string[] }[] = [
  { label: "All",          icon: Grid3X3,       items: ALL_INTERESTS },
  { label: "Entertainment",icon: Clapperboard,  items: ["Music","Dance","Entertainment","Vlog","Gaming","Creator"] },
  { label: "Lifestyle",    icon: Leaf,          items: ["Lifestyle","Fashion","Beauty","Food","Cooking"] },
  { label: "Creative",     icon: Palette,       items: ["Photography","Art","DIY & Crafts"] },
  { label: "Sports",       icon: Trophy,        items: ["Fitness","Sports"] },
  { label: "Knowledge",    icon: GraduationCap, items: ["Education","Tutorials","Reviews","Motivation","News"] },
  { label: "Tech & Biz",   icon: Monitor,       items: ["Technology","Business"] },
  { label: "Travel",       icon: Plane,         items: ["Travel","Nature","Animals & Pets"] },
  { label: "Other",        icon: HelpCircle,    items: ["Health","Cars & Bikes","Religious / Spiritual","Other"] },
];

/* ─── Age ranges ─────────────────────────────────────────────────────────── */
const AGE_RANGES = [
  { value: "all",   label: "All Ages", sub: "13+"         },
  { value: "13-17", label: "13 - 17",  sub: "Teen"        },
  { value: "18-24", label: "18 - 24",  sub: "Young Adult" },
  { value: "18-34", label: "18 - 34",  sub: "Adults"      },
  { value: "25-34", label: "25 - 34",  sub: "Adults"      },
  { value: "35-44", label: "35 - 44",  sub: "Mid Adults"  },
  { value: "45-54", label: "45 - 54",  sub: "Mature"      },
  { value: "55+",   label: "55+",      sub: "Senior"      },
];

/* ─── Objectives ─────────────────────────────────────────────────────────── */
const OBJECTIVES: { id: Objective; label: string; desc: string; icon: React.ElementType }[] = [
  { id:"more_views",          label:"More Views",         desc:"Get more views for your video",     icon:Eye     },
  { id:"more_followers",      label:"More Followers",     desc:"Grow your follower base",            icon:UserPlus},
  { id:"more_profile_visits", label:"More Profile Visits",desc:"Drive traffic to your profile",      icon:Contact },
  { id:"more_engagement",     label:"More Engagement",    desc:"Increase likes, comments & shares",  icon:Heart   },
];

/* ─── Payment methods ────────────────────────────────────────────────────── */
const PAY_METHODS: { id: PayMethod; label: string; sub: string; icon: React.ElementType }[] = [
  { id:"reelsoo_balance", label:"Teezer Balance",    sub:"Available balance",        icon:Wallet     },
  { id:"credit_card",     label:"Credit / Debit Card",sub:"Visa, Mastercard, JCB",   icon:CreditCard },
  { id:"e_wallet",        label:"E-Wallet",           sub:"eSewa, Khalti, PayPal",   icon:Zap        },
  { id:"bank_transfer",   label:"Bank Transfer",      sub:"Manual verification",     icon:Building2  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n/1_000)}K`;
  return String(n);
}
function fmtDur(s?: number | null) {
  if (!s) return "0:00";
  return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}
function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}
function addDays(date: Date, days: number) { const d=new Date(date); d.setDate(d.getDate()+days); return d; }
function toDateInput(d: Date) { return d.toISOString().split("T")[0]; }
function calcDuration(start: string, end: string) {
  if (!start||!end) return 0;
  return Math.max(1, Math.round((new Date(end).getTime()-new Date(start).getTime())/86_400_000)+1);
}
function fmtDateRange(start: string, end: string) {
  const f=(s:string)=>new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  return (!start||!end)?"-":`${f(start)} - ${f(end)}`;
}
function calcReach(daily: number, days: number) {
  const s=daily*days;
  return {
    impressionsMin:Math.round(s*5_000), impressionsMax:Math.round(s*12_000),
    viewsMin:Math.round(s*1_500),       viewsMax:Math.round(s*5_000),
    visitsMin:Math.round(s*20),         visitsMax:Math.round(s*100),
  };
}

/* ─── FieldLabel ─────────────────────────────────────────────────────────── */
function FieldLabel({children}:{children:React.ReactNode}) {
  return <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">{children}</p>;
}
function SectionHeader({n,title,sub}:{n:number;title:string;sub:string}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <div className="grid h-5 w-5 place-items-center rounded-full bg-[#fe2c55] text-[10px] font-extrabold text-white">{n}</div>
        <p className="text-[13px] font-bold text-[#111827]">{title}</p>
      </div>
      <p className="mt-0.5 pl-7 text-[11px] text-[#9ca3af]">{sub}</p>
    </div>
  );
}

/* ─── Countries Multi-Select (max 3) ────────────────────────────────────── */
function CountriesMultiPicker({value,onChange}:{value:string[];onChange:(v:string[])=>void}) {
  const [open,setOpen]   = useState(false);
  const [query,setQuery] = useState("");
  const ref              = useRef<HTMLDivElement>(null);

  const filtered = useMemo(()=>
    COUNTRIES.filter(c=>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.code.toLowerCase().includes(query.toLowerCase())
    ), [query]);

  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node)){setOpen(false);setQuery("");}};
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  function toggle(name:string){
    if(value.includes(name)) onChange(value.filter(v=>v!==name));
    else if(value.length<3)  onChange([...value,name]);
    else toast.warning("You can select up to 3 countries.");
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div onClick={()=>setOpen(true)}
        className={cn("flex min-h-[38px] cursor-pointer flex-wrap items-center gap-1 rounded-xl border px-2.5 py-1.5 transition",
          open?"border-[#fe2c55] ring-2 ring-[#fe2c55]/15":"border-[#e5e7eb] hover:border-[#fe2c55]/50")}>
        {value.length===0&&!open&&(
          <span className="flex items-center gap-1.5 text-[12px] text-[#9ca3af]"><span className="text-[15px]">🌍</span>Select countries</span>
        )}
        {value.map(name=>{
          const c=COUNTRIES.find(x=>x.name===name);
          return (
            <span key={name} className="inline-flex items-center gap-1 rounded-full bg-[#fff0f4] px-2 py-0.5 text-[11px] font-semibold text-[#fe2c55]">
              {c?.flag} {name}
              <button type="button" onMouseDown={e=>{e.stopPropagation();toggle(name);}}
                className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-[#fe2c55]/20">
                <X className="h-2.5 w-2.5"/>
              </button>
            </span>
          );
        })}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-transform",open&&"rotate-180")}/>
      </div>

      {open&&(
        <div className="absolute left-0 right-0 top-full z-[200] mt-1 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#f0f0f0] px-3 py-2">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]"/>
              <input autoFocus value={query} onChange={e=>setQuery(e.target.value)}
                placeholder="Search country…"
                className="bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#9ca3af]" style={{width:140}}/>
            </div>
            <span className={cn("text-[11px] font-semibold",value.length>=3?"text-[#fe2c55]":"text-[#9ca3af]")}>{value.length}/3</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length===0
              ? <p className="px-3 py-4 text-center text-[12px] text-[#9ca3af]">No country found</p>
              : filtered.map(c=>{
                const sel=value.includes(c.name);
                return (
                  <button key={c.code} type="button" onClick={()=>toggle(c.name)}
                    className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-[#fff5f7]",sel&&"bg-[#fff0f4]")}>
                    <span className="text-[15px]">{c.flag}</span>
                    <span className={cn("flex-1 text-[12px] font-medium",sel?"text-[#fe2c55]":"text-[#374151]")}>{c.name}</span>
                    <div className={cn("grid h-4 w-4 place-items-center rounded border-2 transition",sel?"border-[#fe2c55] bg-[#fe2c55]":"border-[#d1d5db]")}>
                      {sel&&<Check className="h-2.5 w-2.5 text-white" strokeWidth={3}/>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Age Ranges Multi-Select (max 3) ───────────────────────────────────── */
function AgeRangesMultiPicker({value,onChange}:{value:string[];onChange:(v:string[])=>void}) {
  const [open,setOpen] = useState(false);
  const ref            = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  function toggle(val:string){
    if(value.includes(val)) onChange(value.filter(v=>v!==val));
    else if(value.length<3)  onChange([...value,val]);
    else toast.warning("You can select up to 3 age groups.");
  }

  const displayLabel = value.length===0
    ? <span className="text-[12px] text-[#9ca3af]">Select age ranges</span>
    : <div className="flex flex-wrap gap-1">
        {value.map(v=>{
          const a=AGE_RANGES.find(x=>x.value===v);
          return (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-[#fff0f4] px-2 py-0.5 text-[11px] font-semibold text-[#fe2c55]">
              {a?.label??v}
              <button type="button" onMouseDown={e=>{e.stopPropagation();toggle(v);}}
                className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-[#fe2c55]/20">
                <X className="h-2.5 w-2.5"/>
              </button>
            </span>
          );
        })}
      </div>;

  return (
    <div ref={ref} className="relative">
      <div onClick={()=>setOpen(o=>!o)}
        className={cn("flex min-h-[38px] cursor-pointer items-center justify-between gap-1 rounded-xl border px-2.5 py-1.5 transition",
          open?"border-[#fe2c55] ring-2 ring-[#fe2c55]/15":"border-[#e5e7eb] hover:border-[#fe2c55]/50")}>
        <div className="flex-1 min-w-0">{displayLabel}</div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("text-[10px] font-semibold",value.length>=3?"text-[#fe2c55]":"text-[#9ca3af]")}>{value.length}/3</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform",open&&"rotate-180")}/>
        </div>
      </div>

      {open&&(
        <div className="absolute left-0 right-0 top-full z-[200] mt-1 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-2xl">
          {AGE_RANGES.map(a=>{
            const sel=value.includes(a.value);
            return (
              <button key={a.value} type="button" onClick={()=>toggle(a.value)}
                className={cn("flex w-full items-center gap-3 px-3 py-2.5 transition hover:bg-[#fff5f7]",sel&&"bg-[#fff0f4]")}>
                <div className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition",sel?"border-[#fe2c55] bg-[#fe2c55]":"border-[#d1d5db]")}>
                  {sel&&<Check className="h-2.5 w-2.5 text-white" strokeWidth={3}/>}
                </div>
                <div className="flex-1 text-left">
                  <p className={cn("text-[12px] font-bold",sel?"text-[#fe2c55]":"text-[#374151]")}>{a.label}</p>
                  <p className="text-[10px] text-[#9ca3af]">{a.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Interests Picker with category filter + icons ─────────────────────── */
function InterestsPicker({value,onChange}:{value:string[];onChange:(v:string[])=>void}) {
  const [open,setOpen]           = useState(false);
  const [query,setQuery]         = useState("");
  const [activeCategory,setActiveCategory] = useState("All");
  const ref                      = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const h=(e:MouseEvent)=>{
      if(!ref.current?.contains(e.target as Node)){setOpen(false);setQuery("");}
    };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  function toggle(tag:string) {
    if (value.includes(tag)) onChange(value.filter(v=>v!==tag));
    else if (value.length<10) onChange([...value,tag]);
  }

  const catItems = INTEREST_CATEGORIES.find(c=>c.label===activeCategory)?.items ?? ALL_INTERESTS;
  const displayed = query
    ? ALL_INTERESTS.filter(i=>i.toLowerCase().includes(query.toLowerCase()))
    : catItems;

  return (
    <div ref={ref} className="relative">
      {/* Trigger box */}
      <div onClick={()=>setOpen(true)}
        className={cn("flex min-h-[40px] cursor-text flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-2 transition",
          open?"border-[#fe2c55] ring-2 ring-[#fe2c55]/15":"border-[#e5e7eb] hover:border-[#fe2c55]/50")}>
        {value.map(tag=>{
          const Icon=INTEREST_ICON[tag]??HelpCircle;
          return (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#fff0f4] px-2 py-1 text-[11px] font-semibold text-[#fe2c55]">
              <Icon className="h-3 w-3" />
              {tag}
              <button type="button" onMouseDown={e=>{e.stopPropagation();toggle(tag);}}
                className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-[#fe2c55]/20 transition">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        })}
        {value.length===0&&!open&&(
          <span className="text-[12px] text-[#9ca3af]">Select interests (max 10)…</span>
        )}
        {open&&(
          <input autoFocus value={query} onChange={e=>{setQuery(e.target.value);setActiveCategory("All");}}
            placeholder="Search interests…"
            className="min-w-[120px] flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#9ca3af]" />
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
      </div>

      {/* Dropdown */}
      {open&&(
        <div className="absolute left-0 right-0 top-full z-[200] mt-1 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-2xl">

          {/* Header row */}
          <div className="flex items-center justify-between border-b border-[#f0f0f0] px-3 py-2">
            <p className="text-[11px] font-semibold text-[#6b7280]">{value.length}/10 selected</p>
            {value.length>0&&(
              <button type="button" onClick={()=>onChange([])}
                className="text-[11px] font-semibold text-[#fe2c55] hover:underline">Clear all</button>
            )}
          </div>

          {/* Category filter chips - scrollable row */}
          {!query&&(
            <div className="flex gap-1.5 overflow-x-auto border-b border-[#f0f0f0] px-3 py-2" style={{scrollbarWidth:"none"}}>
              {INTEREST_CATEGORIES.map(cat=>{
                const Icon=cat.icon;
                const active=activeCategory===cat.label;
                return (
                  <button key={cat.label} type="button" onClick={()=>setActiveCategory(cat.label)}
                    className={cn("flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                      active?"bg-[#fe2c55] text-white":"border border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55]")}>
                    <Icon className="h-3 w-3" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Items grid */}
          <div className="max-h-[200px] overflow-y-auto p-2.5">
            {displayed.length===0
              ? <p className="py-3 text-center text-[12px] text-[#9ca3af]">No interests found</p>
              : (
                <div className="flex flex-wrap gap-1.5">
                  {displayed.map(i=>{
                    const Icon=INTEREST_ICON[i]??HelpCircle;
                    const sel=value.includes(i);
                    return (
                      <button key={i} type="button" onClick={()=>toggle(i)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition",
                          sel
                            ?"border-[#fe2c55] bg-[#fff0f4] text-[#fe2c55]"
                            :"border-[#e5e7eb] text-[#374151] hover:border-[#fe2c55] hover:bg-[#fff5f7] hover:text-[#fe2c55]",
                        )}>
                        <Icon className="h-3 w-3" />
                        {i}
                        {sel&&<Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export function StudioPromotePage({videoId}:{videoId:number}) {
  const router = useRouter();
  const {user,isAuthenticated,authReady} = useAuthStore();
  const [collapsed,setCollapsed] = useState(false);
  const [dateRange,setDateRange] = useState({start:new Date(Date.now()-6*86_400_000),end:new Date()});

  /* form state */
  const [objective,   setObjective]   = useState<Objective>("more_views");
  const [countries,   setCountries]   = useState<string[]>([]);
  const [ageRanges,   setAgeRanges]   = useState<string[]>(["18-34"]);
  const [gender,      setGender]      = useState<Gender>("all");
  const [interests,   setInterests]   = useState<string[]>([]);
  const today      = toDateInput(new Date());
  const defaultEnd = toDateInput(addDays(new Date(),6));
  const [startDate,   setStartDate]   = useState(today);
  const [endDate,     setEndDate]     = useState(defaultEnd);
  const [dailyBudget, setDailyBudget] = useState<string>("1");
  const [budgetError, setBudgetError] = useState("");
  const [payMethod,   setPayMethod]   = useState<PayMethod|"">("");

  /* derived */
  const budgetNum    = parseFloat(dailyBudget)||0;
  const durationDays = useMemo(()=>calcDuration(startDate,endDate),[startDate,endDate]);
  const totalBudget  = useMemo(()=>(budgetNum*durationDays).toFixed(2),[budgetNum,durationDays]);
  const reach        = useMemo(()=>calcReach(budgetNum,durationDays),[budgetNum,durationDays]);

  /* auth guard */
  useEffect(()=>{
    if(authReady&&!isAuthenticated) router.replace("/");
  },[authReady,isAuthenticated,router]);

  /* auto-detect country from account or IP (pre-select as first item) */
  useEffect(()=>{
    if(countries.length>0) return;
    if(user){
      const det=detectUserCountry(user);
      if(det.name){
        const m=COUNTRIES.find(c=>c.name.toLowerCase()===det.name!.toLowerCase()||c.code===det.code);
        if(m){setCountries([m.name]);return;}
      }
    }
    api.get("/detect-country").then(({data})=>{
      const name:string|undefined=data?.data?.name||data?.name;
      const code:string|undefined=data?.data?.code||data?.code;
      if(name||code){
        const m=COUNTRIES.find(c=>(name&&c.name.toLowerCase()===name.toLowerCase())||(code&&c.code===code?.toUpperCase()));
        if(m) setCountries([m.name]);
      }
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user]);

  /* load video */
  const {data:videoData,isLoading:videoLoading} = useQuery({
    queryKey:["studio-promote-video",videoId],
    queryFn:async()=>{
      const {data}=await api.get(`/studio/content`);
      const all:ReelsooVideo[]=data.data??[];
      return all.find(v=>v.id===videoId)??null;
    },
    enabled:authReady&&isAuthenticated&&!!videoId,
    staleTime:60_000,retry:1,
  });
  const video:ReelsooVideo|null=videoData??null;

  /* validation */
  function validate(){
    if(budgetNum<1){setBudgetError("Minimum $1 per day.");return false;}
    if(!payMethod){toast.error("Please select a payment method.");return false;}
    if(!startDate||!endDate){toast.error("Please set promotion dates.");return false;}
    setBudgetError(""); return true;
  }

  /* submit */
  const createMut=useMutation({
    mutationFn:async(status:"draft"|"pending_review")=>{
      const {data}=await api.post("/studio/promotions",{
        video_id:videoId,objective,country:countries[0]||null,countries,age_range:ageRanges[0]||null,age_ranges:ageRanges,gender,interests,
        daily_budget:budgetNum,total_budget:parseFloat(totalBudget),currency:"USD",
        start_date:startDate,end_date:endDate,duration_days:durationDays,payment_method:payMethod||null,
        est_impressions_min:reach.impressionsMin,est_impressions_max:reach.impressionsMax,
        est_views_min:reach.viewsMin,est_views_max:reach.viewsMax,
        est_profile_visits_min:reach.visitsMin,est_profile_visits_max:reach.visitsMax,status,
      });
      return data;
    },
    onSuccess:(_,status)=>{
      toast.success(status==="draft"?"Draft saved.":"Promotion submitted for review!");
      router.push("/studio/content");
    },
    onError:()=>toast.error("Failed to submit. Please try again."),
  });

  function handleDraft(){void createMut.mutate("draft");}
  function handleCreate(){if(validate())void createMut.mutate("pending_review");}
  function onBudgetChange(v:string){setDailyBudget(v);setBudgetError(parseFloat(v)<1&&v!==""?"Minimum $1 per day.":"");}
  function onStartChange(v:string){setStartDate(v);if(endDate&&v>endDate)setEndDate(toDateInput(addDays(new Date(v),durationDays-1)));}

  const canCreate=budgetNum>=1&&!!payMethod&&!!startDate&&!!endDate&&!createMut.isPending;
  const objLabel=OBJECTIVES.find(o=>o.id===objective)?.label??"-";
  const ageLabel=ageRanges.length>0
    ? ageRanges.map(v=>AGE_RANGES.find(a=>a.value===v)?.label??v).join(", ")
    : "All ages";
  const countryLabel=countries.length>0
    ? countries.map(n=>{const c=COUNTRIES.find(x=>x.name===n);return c?`${c.flag} ${c.name}`:n;}).join(", ")
    : "-";

  if(!authReady||!isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper collapsed={collapsed} onToggle={()=>setCollapsed(o=>!o)} activeHref="/studio/content" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared
          title="Promote Video" subtitle="Boost your content reach with targeted promotion."
          showBack onBack={()=>router.back()}
          dateRange={dateRange} onDateRangeChange={setDateRange}
        />
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-4">

          {/* ══ FORM ══ */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto" style={{scrollbarWidth:"none"}}>

            {/* Video preview */}
            <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-[#f0f0f0] bg-white p-4">
              {videoLoading?(
                <div className="flex w-full items-center gap-4">
                  <div className="h-[90px] w-[54px] animate-pulse rounded-xl bg-[#f3f4f6]"/>
                  <div className="flex-1 space-y-2"><div className="h-4 w-48 animate-pulse rounded bg-[#f3f4f6]"/><div className="h-3 w-32 animate-pulse rounded bg-[#f3f4f6]"/></div>
                </div>
              ):video?(
                <>
                  <div className="relative h-[90px] w-[54px] shrink-0 overflow-hidden rounded-xl bg-black">
                    {video.thumbnail_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ?<img src={video.thumbnail_url} alt="" className="h-full w-full object-cover"/>
                      :<div className="flex h-full w-full items-center justify-center bg-[#1a1a2e]"><Play className="h-5 w-5 text-white/60"/></div>}
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white">{fmtDur(video.duration)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-[#111827]">{video.title??video.caption??"Untitled"}</p>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">{video.category??"-"} · Published {fmtDate(video.created_at)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {([
                        {icon:Eye,      v:video.views_count,    label:"Views"},
                        {icon:Heart,    v:video.likes_count,    label:"Likes"},
                        {icon:Users,    v:video.comments_count, label:"Comments"},
                        {icon:BarChart2,v:video.shares_count,   label:"Shares"},
                        {icon:Bookmark, v:video.saves_count,    label:"Saves"},
                      ] as const).map(({icon:Icon,v,label})=>(
                        <div key={label} className="flex items-center gap-1 rounded-lg border border-[#f0f0f0] bg-[#f8f9fb] px-2.5 py-1.5">
                          <Icon className="h-3.5 w-3.5 text-[#9ca3af]"/>
                          <span className="text-[12px] font-bold text-[#374151]">{fmtK(v??0)}</span>
                          <span className="text-[10px] text-[#9ca3af]">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ):<p className="text-[13px] text-[#9ca3af]">Video not found.</p>}
            </div>

            {/* Row 1 - Objective + Audience */}
            <div className="grid shrink-0 grid-cols-2 gap-3">

              {/* Section 1 */}
              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                <SectionHeader n={1} title="Campaign Objective" sub="Choose the main goal for your promotion." />
                <div className="grid grid-cols-2 gap-2">
                  {OBJECTIVES.map(obj=>{
                    const Icon=obj.icon;
                    const active=objective===obj.id;
                    return (
                      <button key={obj.id} type="button" onClick={()=>setObjective(obj.id)}
                        className={cn("relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition",
                          active?"border-[#fe2c55] bg-[#fff5f7]":"border-[#f0f0f0] hover:border-[#fe2c55]/40 hover:bg-[#fafafa]")}>
                        {active&&<div className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-[#fe2c55]"><Check className="h-2.5 w-2.5 text-white" strokeWidth={3}/></div>}
                        <div className={cn("grid h-9 w-9 place-items-center rounded-full",active?"bg-[#fee2e2]":"bg-[#f3f4f6]")}>
                          <Icon className={cn(active?"text-[#fe2c55]":"text-[#9ca3af]")} style={{width:18,height:18}}/>
                        </div>
                        <p className={cn("text-[12px] font-bold leading-tight",active?"text-[#fe2c55]":"text-[#374151]")}>{obj.label}</p>
                        <p className="text-[10px] leading-tight text-[#9ca3af]">{obj.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2 - Audience */}
              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                <SectionHeader n={2} title="Audience Targeting" sub="Define who should see your promotion." />
                <div className="mb-3 grid grid-cols-3 gap-3">
                  <div><FieldLabel>Country <span className="normal-case text-[#9ca3af]">(up to 3)</span></FieldLabel><CountriesMultiPicker value={countries} onChange={setCountries}/></div>
                  <div><FieldLabel>Age Range <span className="normal-case text-[#9ca3af]">(up to 3)</span></FieldLabel><AgeRangesMultiPicker value={ageRanges} onChange={setAgeRanges}/></div>
                  <div>
                    <FieldLabel>Gender</FieldLabel>
                    <div className="flex overflow-hidden rounded-xl border border-[#e5e7eb]">
                      {(["all","male","female"] as Gender[]).map(g=>(
                        <button key={g} type="button" onClick={()=>setGender(g)}
                          className={cn("flex-1 py-2 text-[11px] font-semibold capitalize transition",
                            gender===g?"bg-[#fe2c55] text-white":"bg-white text-[#6b7280] hover:bg-[#f8f9fb]")}>
                          {g==="all"?"All":g==="male"?"Male":"Female"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <FieldLabel>Interests</FieldLabel>
                  <InterestsPicker value={interests} onChange={setInterests}/>
                  {interests.length>0&&(
                    <p className="mt-1.5 text-[10px] text-[#9ca3af]">{interests.length} selected · max 10</p>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2 - Budget + Reach */}
            <div className="grid shrink-0 grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                <SectionHeader n={3} title="Budget & Duration" sub="Set your budget and schedule." />
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Daily Budget</FieldLabel>
                    <div className={cn("flex overflow-hidden rounded-xl border transition",
                      budgetError?"border-red-400":"border-[#e5e7eb] focus-within:border-[#fe2c55] focus-within:ring-2 focus-within:ring-[#fe2c55]/15")}>
                      <span className="border-r border-[#e5e7eb] bg-[#f8f9fb] px-2.5 py-2 text-[12px] font-bold text-[#374151]">USD</span>
                      <input type="number" min="1" step="0.01" value={dailyBudget}
                        onChange={e=>onBudgetChange(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[13px] font-bold text-[#111827] outline-none"
                        placeholder="1.00"/>
                    </div>
                    {budgetError
                      ?<p className="mt-1 flex items-center gap-1 text-[10px] text-red-500"><AlertCircle className="h-3 w-3"/>{budgetError}</p>
                      :<p className="mt-1 text-[10px] text-[#9ca3af]">Min. $1/day · no max</p>}
                  </div>
                  <div>
                    <FieldLabel>Total Budget</FieldLabel>
                    <div className="flex overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f8f9fb]">
                      <span className="border-r border-[#e5e7eb] bg-[#f0f0f0] px-2.5 py-2 text-[12px] font-bold text-[#374151]">USD</span>
                      <span className="flex-1 px-2.5 py-2 text-[13px] font-bold text-[#111827]">{totalBudget}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-[#9ca3af]">Auto-calculated</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Start Date</FieldLabel>
                    <input type="date" value={startDate} min={today} onChange={e=>onStartChange(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] px-2.5 py-2 text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/15"/>
                  </div>
                  <div>
                    <FieldLabel>End Date</FieldLabel>
                    <input type="date" value={endDate} min={startDate||today} onChange={e=>setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-[#e5e7eb] px-2.5 py-2 text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/15"/>
                  </div>
                </div>
                {durationDays>0&&(
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#f8f9fb] px-2.5 py-1.5">
                    <Info className="h-3.5 w-3.5 text-[#9ca3af]"/>
                    <p className="text-[11px] text-[#6b7280]">Duration: <strong>{durationDays} day{durationDays!==1?"s":""}</strong></p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                <SectionHeader n={4} title="Estimated Reach" sub="Predicted performance for your campaign." />
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([
                    {icon:Eye,        label:"Impressions",    min:reach.impressionsMin,max:reach.impressionsMax,color:"text-[#fe2c55]",bg:"bg-[#fff0f4]"},
                    {icon:PlayCircle, label:"Video Views",    min:reach.viewsMin,      max:reach.viewsMax,      color:"text-[#0d9488]",bg:"bg-[#ccfbf1]"},
                    {icon:TrendingUp, label:"Profile Visits", min:reach.visitsMin,     max:reach.visitsMax,     color:"text-[#2563eb]",bg:"bg-[#dbeafe]"},
                  ] as const).map(({icon:Icon,label,min,max,color,bg})=>(
                    <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl border border-[#f0f0f0] p-3 text-center">
                      <div className={cn("grid h-8 w-8 place-items-center rounded-xl",bg)}><Icon className={cn("h-4 w-4",color)}/></div>
                      <p className="text-[13px] font-extrabold text-[#111827]">{fmtK(min)} - {fmtK(max)}</p>
                      <p className="text-[10px] text-[#9ca3af]">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2 rounded-xl bg-[#f8f9fb] px-3 py-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9ca3af]"/>
                  <p className="text-[11px] text-[#6b7280]">Estimates based on your targeting, budget, and historical data.</p>
                </div>
              </div>
            </div>

            {/* Section 5 - Payment */}
            <div className="shrink-0 rounded-2xl border border-[#f0f0f0] bg-white p-4">
              <SectionHeader n={5} title="Payment Method" sub="Choose how you want to pay for this promotion." />
              <div className="grid grid-cols-4 gap-2">
                {PAY_METHODS.map(pm=>{
                  const Icon=pm.icon;
                  const active=payMethod===pm.id;
                  return (
                    <button key={pm.id} type="button" onClick={()=>setPayMethod(pm.id)}
                      className={cn("flex items-center gap-2.5 rounded-xl border p-3 text-left transition",
                        active?"border-[#fe2c55] bg-[#fff5f7]":"border-[#f0f0f0] hover:border-[#fe2c55]/40")}>
                      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition",
                        active?"border-[#fe2c55] bg-[#fee2e2]":"border-[#e5e7eb] bg-[#f8f9fb]")}>
                        {active?<div className="h-3 w-3 rounded-full bg-[#fe2c55]"/>:<Icon className="h-4 w-4 text-[#9ca3af]"/>}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("truncate text-[12px] font-bold leading-tight",active?"text-[#fe2c55]":"text-[#374151]")}>{pm.label}</p>
                        <p className="truncate text-[10px] text-[#9ca3af]">{pm.sub}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ══ SUMMARY ══ */}
          <div className="flex w-[280px] shrink-0 flex-col gap-3 overflow-y-auto" style={{scrollbarWidth:"none"}}>
            <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
              <p className="text-[14px] font-bold text-[#111827]">Campaign Summary</p>
              <p className="mb-3 mt-0.5 text-[11px] text-[#9ca3af]">Review your promotion details.</p>
              <div className="space-y-2.5 border-t border-[#f0f0f0] pt-3">
                {([
                  {label:"Video",     value:video?.title??video?.caption??"-"},
                  {label:"Objective", value:objLabel},
                  {label:"Audience",  value:[countryLabel,ageLabel,gender==="all"?"All genders":gender,interests.length?`${interests.length} interests`:""].filter(v=>v&&v!=="-").join(" · ")||"-"},
                  {label:"Budget",    value:`$${budgetNum.toFixed(2)} / day`},
                  {label:"Total",     value:`$${totalBudget}`},
                  {label:"Duration",  value:startDate&&endDate?`${fmtDateRange(startDate,endDate)} · ${durationDays}d`:"-"},
                ] as const).map(({label,value})=>(
                  <div key={label} className="flex items-start justify-between gap-2">
                    <p className="shrink-0 text-[11px] font-semibold text-[#6b7280]">{label}</p>
                    <p className="text-right text-[11px] font-medium leading-snug text-[#111827]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl bg-[#f8f9fb] p-3">
                <p className="mb-2 text-[11px] font-bold text-[#374151]">Estimated Results</p>
                {([
                  {icon:Eye,        label:"Impressions",    min:reach.impressionsMin,max:reach.impressionsMax},
                  {icon:PlayCircle, label:"Video Views",    min:reach.viewsMin,      max:reach.viewsMax},
                  {icon:TrendingUp, label:"Profile Visits", min:reach.visitsMin,     max:reach.visitsMax},
                ] as const).map(({icon:Icon,label,min,max})=>(
                  <div key={label} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-[#9ca3af]"/><p className="text-[11px] text-[#6b7280]">{label}</p></div>
                    <p className="text-[11px] font-bold text-[#374151]">{fmtK(min)} - {fmtK(max)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-[#f0f0f0] p-3 text-center">
                <p className="text-[11px] font-semibold text-[#6b7280]">Estimated Spend</p>
                <p className="mt-1 text-[22px] font-extrabold text-[#fe2c55]">${totalBudget}</p>
                <p className="text-[10px] text-[#9ca3af]">Total for {durationDays} day{durationDays!==1?"s":""}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f0fdf4]">
                  <Shield className="h-3.5 w-3.5 text-[#22c55e]"/>
                </div>
                <p className="text-[11px] leading-relaxed text-[#6b7280]">
                  Your promotion will be reviewed to ensure it follows our{" "}
                  <a href="#" className="font-semibold text-[#fe2c55] hover:underline">Community Guidelines</a>
                  {" "}and{" "}
                  <a href="#" className="font-semibold text-[#fe2c55] hover:underline">Advertising Policies</a>.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleDraft} disabled={createMut.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-60">
                <Bookmark className="h-3.5 w-3.5"/>Save Draft
              </button>
              <button type="button" onClick={handleCreate} disabled={!canCreate||createMut.isPending}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-white shadow-sm transition",
                  canCreate?"bg-[#fe2c55] hover:bg-[#e0243d]":"cursor-not-allowed bg-[#c0c4cc]")}>
                {createMut.isPending&&<Loader2 className="h-4 w-4 animate-spin"/>}
                Create Promotion
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
