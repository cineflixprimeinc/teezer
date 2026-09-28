"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, ArchiveIcon, ArrowLeft, BarChart2, Bell,
  Bookmark, Check, ChevronDown, ChevronRight, Clock, Copy,
  Download, ExternalLink, Eye, EyeOff, FilmIcon, Flag,
  Globe, Hash, Heart, Home, Laptop, Loader2, Lock,
  MapPin, MessageCircle, MessageSquare, Mic, MonitorPlay,
  Music, Pause, PinIcon, Play, RefreshCw, Save, Settings,
  ShieldAlert, ShieldCheck, Sparkles, Star, Trash2, Upload,
  User, Users, Video, Volume2, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAdminVideoEditData,
  updateAdminVideo,
  updateVideoSettings,
  updateVideoMonetization,
  updateVideoVisibility,
  updateVideoAdvanced,
  deleteAdminVideo,
  unpublishAdminVideo,
  runVideoSafetyCheck,
  reprocessVideo,
  featureAdminVideo,
  type AdminVideoDetail,
  type VideoEditData,
  type VideoMonetization,
} from "@/services/admin-video.service";

/* ── Constants ──────────────────────────────────────────────────────────── */
const PINK = "#FE5A1F";

const CATEGORIES = [
  "Comedy","Dance","Music","Travel & Nature","Food","Fashion","Beauty",
  "Lifestyle","Fitness","Sports","Gaming","Education","Technology","Business",
  "Motivation","News","Entertainment","Vlog","Art","Photography",
  "Animals & Pets","Nature","Cars & Bikes","Health","DIY & Crafts",
  "Family","Relationships","Cooking","Reviews","Tutorials",
  "Religious / Spiritual","Other",
];

const LANGUAGES = [
  { code:"en",label:"English" },{ code:"ne",label:"Nepali" },
  { code:"hi",label:"Hindi" },{ code:"es",label:"Spanish" },
  { code:"fr",label:"French" },{ code:"de",label:"German" },
  { code:"ja",label:"Japanese" },{ code:"ko",label:"Korean" },
  { code:"zh",label:"Chinese" },{ code:"ar",label:"Arabic" },
  { code:"pt",label:"Portuguese" },{ code:"ru",label:"Russian" },
  { code:"other",label:"Other" },
];

const TABS = [
  { id:"details",      label:"Video Details"  },
  { id:"settings",     label:"Settings"       },
  { id:"monetization", label:"Monetization"   },
  { id:"visibility",   label:"Visibility"     },
  { id:"advanced",     label:"Advanced"       },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmtBytes(b: number|null) {
  if (!b) return "-";
  return b>=1048576 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1024).toFixed(1)} KB`;
}
function fmtDur(s: number|null) {
  if (!s) return "-";
  const m=Math.floor(s/60),sec=Math.floor(s%60);
  return `${m}:${String(sec).padStart(2,"0")}`;
}
function fmtNum(n: number) {
  if(n>=1e6) return `${(n/1e6).toFixed(1)}M`;
  if(n>=1000) return `${(n/1000).toFixed(1)}K`;
  return String(n);
}
function fmtDate(iso:string|null|undefined) {
  if(!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function fmtDateShort(iso:string|null|undefined) {
  if(!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
}
function contentId(id:number) { return `VID-${String(id).padStart(6,"0")}`; }

/* ── Micro components ───────────────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled=false }: { checked:boolean; onChange:(v:boolean)=>void; disabled?:boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={()=>!disabled&&onChange(!checked)}
      className={cn("relative inline-flex h-[22px] w-10 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
        disabled?"opacity-40 cursor-not-allowed":"cursor-pointer")}
      style={{ background: checked ? PINK : "#d1d5db" }}>
      <span className={cn("pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform",
        checked?"translate-x-[18px]":"translate-x-0")} />
    </button>
  );
}

function SSelect({ value,options,onChange,placeholder,className }: {
  value:string; options:{value:string;label:string}[]; onChange:(v:string)=>void;
  placeholder?:string; className?:string;
}) {
  return (
    <div className={cn("relative",className)}>
      <select value={value} onChange={e=>onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 pr-8 focus:outline-none focus:ring-2 focus:border-transparent"
        style={{"--tw-ring-color":PINK} as React.CSSProperties}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
    </div>
  );
}

function RowToggle({ label,desc,checked,onChange,disabled=false }:{
  label:string;desc?:string;checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled}/>
    </div>
  );
}

function Card({ title,children,className }:{title?:string;children:React.ReactNode;className?:string}) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 p-5",className)}>
      {title && <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>}
      {children}
    </div>
  );
}

function StatusPill({ status }:{status:string}) {
  const map: Record<string,string> = {
    published:"bg-green-100 text-green-700",
    active:"bg-green-100 text-green-700",
    approved:"bg-green-100 text-green-700",
    eligible:"bg-green-100 text-green-700",
    processed:"bg-green-100 text-green-700",
    compliant:"bg-green-100 text-green-700",
    draft:"bg-gray-100 text-gray-600",
    pending:"bg-amber-100 text-amber-700",
    processing:"bg-blue-100 text-blue-700",
    private:"bg-blue-100 text-blue-700",
    scheduled:"bg-violet-100 text-violet-700",
    rejected:"bg-red-100 text-red-600",
    removed:"bg-red-100 text-red-600",
    failed:"bg-red-100 text-red-600",
    not_eligible:"bg-gray-100 text-gray-500",
  };
  return (
    <span className={cn("inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize",
      map[status?.toLowerCase()] ?? "bg-gray-100 text-gray-600")}>
      {status?.replace(/_/g," ") ?? "-"}
    </span>
  );
}

/* ── Admin Sidebar ──────────────────────────────────────────────────────── */
const NAV = [
  { icon:Home,     label:"Dashboard",    href:"/admin" },
  { icon:Users,    label:"Users",        href:"/admin/users/1/360",
    sub:[{label:"All Users",href:"/admin/users/1/360"},{label:"User Content",href:"#",active:true}] },
  { icon:Video,    label:"Videos",       href:"#",active:true },
  { icon:Zap,      label:"Live",         href:"#" },
  { icon:BarChart2,label:"Reports",      href:"#" },
  { icon:MessageSquare,label:"Comments", href:"#" },
  { icon:MessageCircle,label:"Messages", href:"#" },
  { icon:Star,     label:"Monetization", href:"#" },
  { icon:Music,    label:"Music",        href:"#" },
  { icon:Settings, label:"Settings",     href:"#" },
  { icon:ShieldAlert,label:"Audit Log",  href:"#" },
];

function AdminSidebar({ userId }:{userId?:number}) {
  const [expanded, setExpanded] = useState<string[]>(["Users"]);
  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-100">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{background:PINK}}>R</div>
        <div><p className="text-sm font-bold text-gray-900">Teezer</p><p className="text-[10px] text-gray-400">Admin</p></div>
      </div>
      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(item=>{
          const hasSub = item.sub && item.sub.length>0;
          const isExpanded = expanded.includes(item.label);
          const isActive = !!item.active;
          return (
            <div key={item.label}>
              <button type="button" onClick={()=>{
                if(hasSub) setExpanded(prev=>prev.includes(item.label)?prev.filter(x=>x!==item.label):[...prev,item.label]);
              }}
                className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  isActive ? "font-semibold" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")}
                style={isActive?{color:PINK,background:`${PINK}12`}:{}}>
                <item.icon size={16} className="shrink-0"/>
                <span className="flex-1">{item.label}</span>
                {hasSub && <ChevronDown size={13} className={cn("transition-transform",isExpanded&&"rotate-180")}/>}
              </button>
              {hasSub && isExpanded && (
                <div className="ml-9 mt-0.5 space-y-0.5">
                  {item.sub!.map(s=>(
                    <a key={s.label} href={s.href}
                      className={cn("block px-2 py-1.5 text-xs rounded-md transition-colors",
                        s.active ? "font-semibold" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50")}
                      style={s.active?{color:PINK}:{}}>
                      + {s.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {/* Upgrade card */}
      <div className="mx-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100">
        <p className="text-xs font-semibold text-gray-800 mb-0.5">Upgrade to Pro</p>
        <p className="text-[11px] text-gray-500 mb-2">Unlock advanced tools and analytics.</p>
        <button type="button" className="w-full py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90" style={{background:PINK}}>
          Upgrade Now
        </button>
      </div>
      {/* Admin user */}
      <div className="border-t border-gray-100 px-3 py-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0" style={{background:PINK}}>R</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-800 truncate">Teezer Admin</p>
          <p className="text-[10px] text-gray-400 truncate">admin@teezer.live</p>
        </div>
        <ChevronDown size={13} className="text-gray-400 ml-auto shrink-0"/>
      </div>
    </aside>
  );
}

/* ── Form state ─────────────────────────────────────────────────────────── */
interface FormState {
  // Details
  title: string; caption: string; tags: string[];
  category: string; location: string; language: string;
  allow_comments: boolean; allow_duet: boolean; allow_stitch: boolean;
  // Settings
  allow_replies: boolean; allow_download: boolean;
  allow_sharing: boolean; allow_embedding: boolean;
  age_restriction: string; content_label: string;
  is_ai_generated: boolean; sensitive_warning: boolean;
  show_on_profile: boolean; notify_followers: boolean;
  send_push_after_publish: boolean;
  // Visibility
  status: string; recommendation_eligible: boolean;
  search_indexing: boolean; region_allowed: string;
  region_blocked: string; shadowban_enabled: boolean;
  limited_distribution: boolean; limited_reason: string;
  // Advanced
  moderation_status: string; review_priority: string;
  legal_hold: boolean; reporting_sensitivity: string;
  archive_status: string; auto_archive_after: string;
  admin_notes: string; audit_notes: string;
  // Monetization
  ad_revenue_sharing: boolean; creator_fund_active: boolean;
  tips_gifts_enabled: boolean; subscriptions_eligible: boolean;
  brand_partnerships_eligible: boolean; shop_product_tagging: boolean;
  paid_promotion_disclosure: string; affiliate_links_enabled: boolean;
  brand_deals_allowed: boolean; auto_claim_brand_mentions: boolean;
  monetization_notes: string; mono_eligibility: string;
}

function initForm(v: AdminVideoDetail, m: VideoMonetization|null): FormState {
  return {
    title: v.title??'', caption: v.caption??'',
    tags: v.hashtags.map(h=>h.name),
    category: v.category??'', location: v.location??'',
    language: v.language??'en',
    allow_comments: v.allow_comments??true,
    allow_duet: v.allow_duet??true,
    allow_stitch: v.allow_stitch??true,
    allow_replies: v.allow_replies??true,
    allow_download: v.allow_download??false,
    allow_sharing: v.allow_sharing??true,
    allow_embedding: v.allow_embedding??false,
    age_restriction: v.age_restriction??'everyone',
    content_label: v.content_label??'',
    is_ai_generated: v.is_ai_generated??false,
    sensitive_warning: v.sensitive_warning??false,
    show_on_profile: v.show_on_profile??true,
    notify_followers: v.notify_followers??true,
    send_push_after_publish: v.send_push_after_publish??true,
    status: v.status==='removed'?'draft':v.status??'published',
    recommendation_eligible: v.recommendation_eligible??true,
    search_indexing: v.search_indexing??true,
    region_allowed: (v.region_allowed??[]).join(', '),
    region_blocked: (v.region_blocked??[]).join(', '),
    shadowban_enabled: v.shadowban_enabled??false,
    limited_distribution: v.limited_distribution??false,
    limited_reason: v.limited_reason??'',
    moderation_status: v.moderation_status??'pending',
    review_priority: v.review_priority??'normal',
    legal_hold: v.legal_hold??false,
    reporting_sensitivity: v.reporting_sensitivity??'standard',
    archive_status: v.archive_status??'active',
    auto_archive_after: v.auto_archive_after??'never',
    admin_notes: v.admin_notes??'',
    audit_notes: v.audit_notes??'',
    ad_revenue_sharing: m?.ad_revenue_sharing??false,
    creator_fund_active: m?.creator_fund_active??false,
    tips_gifts_enabled: m?.tips_gifts_enabled??false,
    subscriptions_eligible: m?.subscriptions_eligible??false,
    brand_partnerships_eligible: m?.brand_partnerships_eligible??false,
    shop_product_tagging: m?.shop_product_tagging??false,
    paid_promotion_disclosure: m?.paid_promotion_disclosure??'not_required',
    affiliate_links_enabled: m?.affiliate_links_enabled??false,
    brand_deals_allowed: m?.brand_deals_allowed??false,
    auto_claim_brand_mentions: m?.auto_claim_brand_mentions??false,
    monetization_notes: m?.monetization_notes??'',
    mono_eligibility: m?.eligibility_status??'not_eligible',
  };
}

/* ── Video preview ──────────────────────────────────────────────────────── */
function VideoPreviewCard({ video }:{video:AdminVideoDetail}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  function toggle(){
    const el=ref.current;if(!el)return;
    if(el.paused) { void el.play().then(()=>setPlaying(true)); }
    else { el.pause(); setPlaying(false); }
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">Video Preview</p>
      </div>
      <div className="relative bg-black" style={{aspectRatio:'9/16',maxHeight:'300px'}}>
        {video.video_url ? (
          <>
            <video ref={ref} src={video.video_url} poster={video.thumbnail_url??undefined}
              className="w-full h-full object-contain" loop
              onEnded={()=>setPlaying(false)}/>
            {video.duration && (
              <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                {fmtDur(video.duration)}
              </span>
            )}
            <button type="button" onClick={toggle}
              className="absolute inset-0 flex items-center justify-center group">
              <div className={cn("h-10 w-10 rounded-full bg-black/50 grid place-items-center text-white transition-opacity",
                playing?"opacity-0 group-hover:opacity-100":"opacity-100")}>
                {playing?<Pause size={18}/>:<Play size={18}/>}
              </div>
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-gradient-to-t from-black/60 flex items-center gap-2">
              <span className="text-white text-[10px] font-medium">00:00 / {fmtDur(video.duration)}</span>
              <div className="flex-1"/>
              <Volume2 size={13} className="text-white"/>
              <ExternalLink size={13} className="text-white"/>
            </div>
          </>
        ) : video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" className="w-full h-full object-contain"/>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video size={32} className="text-gray-600"/>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Right sidebar status cards per tab ─────────────────────────────────── */
function VideoStatusCard({ video, tab }:{video:AdminVideoDetail; tab:TabId}) {
  if(tab==='monetization') {
    const m = video.monetization;
    const total = m?.total_earnings??0;
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Monetization Summary</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <StatusRow label="Monetization Status" value={<StatusPill status={m?.eligibility_status??'not_eligible'}/>}/>
          <StatusRow label="Ad Revenue Sharing" value={<StatusPill status={m?.ad_revenue_sharing?'enabled':'disabled'}/>}/>
          <StatusRow label="Creator Fund" value={<StatusPill status={m?.creator_fund_active?'active':'inactive'}/>}/>
          <StatusRow label="Tips & Gifts" value={<StatusPill status={m?.tips_gifts_enabled?'enabled':'disabled'}/>}/>
          <div className="border-t border-gray-100 pt-2.5 mt-1 space-y-1.5">
            <StatusRow label="Total Earnings" value={<span className="text-sm font-bold text-gray-900">${total.toFixed(2)}</span>}/>
            <StatusRow label="Total Payouts" value={`$${((m?.revenue??0)*0.8).toFixed(2)}`}/>
            <StatusRow label="Pending Balance" value={`$${(m?.next_payout??0).toFixed(2)}`}/>
          </div>
          <button type="button" className="w-full mt-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1.5">
            <BarChart2 size={13}/> View Payout History
          </button>
        </div>
      </div>
    );
  }
  if(tab==='visibility') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Visibility Summary</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <StatusRow label="Current Status" value={<StatusPill status={video.status}/>}/>
          <StatusRow label="Recommendation" value={video.recommendation_eligible!==false?'Eligible':'Blocked'}/>
          <StatusRow label="Profile Visible" value={video.show_on_profile!==false?'Yes':'No'}/>
          <StatusRow label="Search Index" value={video.search_indexing!==false?'Indexed':'Not Indexed'}/>
          <StatusRow label="Region" value={video.region_blocked?.length?'Region Restricted':'Worldwide'}/>
          <StatusRow label="Publish Status" value={<StatusPill status={video.status}/>}/>
        </div>
      </div>
    );
  }
  if(tab==='advanced') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Processing & History</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <StatusRow label="Processing Status" value={<StatusPill status={video.content_check_status??'processed'}/>}/>
          <StatusRow label="Last Processed" value={fmtDateShort(video.updated_at)}/>
          <div className="border-t border-gray-100 pt-2.5 mt-1">
            <p className="text-[11px] text-gray-400 font-medium uppercase mb-2">Moderation History</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500"/>
                <span className="text-gray-500">{fmtDateShort(video.updated_at)}</span>
                <span className="text-green-600 font-medium">{video.moderation_status??'Approved'}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-300"/>
                <span className="text-gray-500">{fmtDateShort(video.created_at)}</span>
                <span className="text-gray-500">Submitted</span>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-2.5 mt-1">
            <p className="text-[11px] text-gray-400 font-medium uppercase mb-2">Technical Metadata</p>
            <div className="space-y-1">
              <StatusRow label="Duration" value={fmtDur(video.duration)} small/>
              <StatusRow label="File Size" value={fmtBytes(video.file_size)} small/>
              <StatusRow label="Format" value={video.mime_type?.split('/')[1]?.toUpperCase()??'-'} small/>
              <StatusRow label="Upload Source" value="Web" small/>
            </div>
          </div>
        </div>
      </div>
    );
  }
  // Default: details / settings
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Video Status</p>
        <StatusPill status={video.status}/>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        <StatusRow label="Visibility" value={
          <span className="flex items-center gap-1 text-xs text-gray-700">
            <Globe size={12}/> {video.status==='published'?'Public':video.status}
          </span>}/>
        <StatusRow label="Owner" value={
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-gray-200 overflow-hidden grid place-items-center shrink-0">
              {video.user.avatar
                ?<img src={video.user.avatar} alt="" className="h-full w-full object-cover"/>
                :<User size={10} className="text-gray-400"/>}
            </div>
            <span className="text-xs text-gray-700 font-medium">{video.user.name}</span>
          </div>}/>
        <StatusRow label="Published On" value={fmtDateShort(video.updated_at)}/>
        <StatusRow label="Moderation Status" value={<StatusPill status={video.moderation_status??'pending'}/>}/>
        <StatusRow label="Content ID" value={<code className="text-xs font-mono text-gray-600">{contentId(video.id)}</code>}/>
        <a href={`/videos/${video.id}`} target="_blank" rel="noreferrer"
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <ExternalLink size={12}/> View on Teezer
        </a>
      </div>
    </div>
  );
}

function StatusRow({label,value,small=false}:{label:string;value:React.ReactNode;small?:boolean}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-gray-500 shrink-0",small?"text-[11px]":"text-xs")}>{label}</span>
      <span className={cn("text-right",small?"text-[11px] text-gray-600":"text-xs text-gray-700")}>
        {typeof value==='string'?value:<>{value}</>}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 1 - Video Details
══════════════════════════════════════════════════════════════════════════ */
function DetailsTab({ form, patch, video, playlists }:{
  form:FormState; patch:(u:Partial<FormState>)=>void;
  video:AdminVideoDetail; playlists:{id:number;title:string}[];
}) {
  const [tagInput, setTagInput] = useState('');
  function addTag(raw:string){
    const n=raw.toLowerCase().replace(/^#/,'').trim();
    if(!n||form.tags.includes(n))return;
    patch({tags:[...form.tags,n]});setTagInput('');
  }
  return (
    <div className="space-y-4">
      {/* Cover images */}
      <Card title="Cover Image">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-3">
          {video.thumbnail_url ? (
            <div className="w-16 h-24 rounded-lg overflow-hidden shrink-0 border-2" style={{borderColor:PINK}}>
              <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover"/>
            </div>
          ) : null}
          {[1,2,3].map(i=>(
            <div key={i} className="w-16 h-24 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center border-2 border-transparent hover:border-gray-300 cursor-pointer transition-colors">
              <FilmIcon size={14} className="text-gray-300"/>
            </div>
          ))}
        </div>
        <button type="button" className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          <Upload size={13}/> Upload New Cover
        </button>
      </Card>

      {/* Title & Description */}
      <Card>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Video Title</label>
              <span className="text-[11px] text-gray-400">{form.title.length}/100</span>
            </div>
            <input value={form.title} onChange={e=>patch({title:e.target.value.slice(0,100)})}
              placeholder="Enter video title..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{"--tw-ring-color":PINK} as React.CSSProperties}/>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700">Description</label>
              <span className="text-[11px] text-gray-400">{form.caption.length}/300</span>
            </div>
            <textarea value={form.caption} onChange={e=>patch({caption:e.target.value.slice(0,300)})}
              rows={4} placeholder="What is this video about..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent resize-none"
              style={{"--tw-ring-color":PINK} as React.CSSProperties}/>
          </div>
        </div>
      </Card>

      {/* Tags + Category + Location + Language */}
      <Card>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg border border-gray-200 min-h-[44px] focus-within:ring-2 focus-within:border-transparent"
              style={{"--tw-ring-color":PINK} as React.CSSProperties}>
              {form.tags.map(t=>(
                <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs" style={{background:PINK}}>
                  <Hash size={10}/>{t}
                  <button type="button" onClick={()=>patch({tags:form.tags.filter(x=>x!==t)})}><X size={9}/></button>
                </span>
              ))}
              <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '||e.key===','){e.preventDefault();addTag(tagInput);}}}
                onBlur={()=>{if(tagInput.trim())addTag(tagInput);}}
                placeholder={form.tags.length===0?"Add tags...":""} className="flex-1 min-w-20 text-sm text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent"/>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Press Space, Enter or comma to add a tag</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1.5">Category</label>
              <SSelect value={form.category} onChange={v=>patch({category:v})}
                options={CATEGORIES.map(c=>({value:c,label:c}))} placeholder="Select category"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1.5">Add to Playlist</label>
              <SSelect value="" onChange={()=>{}}
                options={playlists.map(p=>({value:String(p.id),label:p.title}))} placeholder="Select playlist"/>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">Location</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
              <input value={form.location} onChange={e=>patch({location:e.target.value})}
                placeholder="Add location..." className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{"--tw-ring-color":PINK} as React.CSSProperties}/>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1.5">Language</label>
            <SSelect value={form.language} onChange={v=>patch({language:v})}
              options={LANGUAGES.map(l=>({value:l.code,label:l.label}))}/>
          </div>
        </div>
      </Card>

      {/* Interaction toggles */}
      <Card title="Interaction">
        <RowToggle label="Allow Comments" desc="Let viewers comment on this video" checked={form.allow_comments} onChange={v=>patch({allow_comments:v})}/>
        <RowToggle label="Allow Duet" desc="Let viewers create duets" checked={form.allow_duet} onChange={v=>patch({allow_duet:v})}/>
        <RowToggle label="Allow Stitch" desc="Let viewers clip and stitch" checked={form.allow_stitch} onChange={v=>patch({allow_stitch:v})}/>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 2 - Settings
══════════════════════════════════════════════════════════════════════════ */
function SettingsTab({ form, patch }:{form:FormState;patch:(u:Partial<FormState>)=>void}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Comment Settings */}
      <Card title="Comment Settings">
        <RowToggle label="Allow comments" checked={form.allow_comments} onChange={v=>patch({allow_comments:v})}/>
        <RowToggle label="Allow replies" checked={form.allow_replies} onChange={v=>patch({allow_replies:v})}/>
        <RowToggle label="Pin top comment" checked={false} onChange={()=>{}} disabled/>
      </Card>

      {/* Interaction Settings */}
      <Card title="Interaction Settings">
        <RowToggle label="Allow duet" checked={form.allow_duet} onChange={v=>patch({allow_duet:v})}/>
        <RowToggle label="Allow stitch" checked={form.allow_stitch} onChange={v=>patch({allow_stitch:v})}/>
        <RowToggle label="Allow downloads" checked={form.allow_download} onChange={v=>patch({allow_download:v})}/>
        <RowToggle label="Allow sharing" checked={form.allow_sharing} onChange={v=>patch({allow_sharing:v})}/>
        <RowToggle label="Allow embedding" checked={form.allow_embedding} onChange={v=>patch({allow_embedding:v})}/>
      </Card>

      {/* Audience & Safety */}
      <Card title="Audience & Safety">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Age restriction</label>
            <SSelect value={form.age_restriction} onChange={v=>patch({age_restriction:v})}
              options={[{value:'everyone',label:'Everyone'},{value:'13plus',label:'13+'},{value:'16plus',label:'16+'},{value:'18plus',label:'18+'}]}/>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Content label</label>
            <SSelect value={form.content_label} onChange={v=>patch({content_label:v})}
              options={[{value:'',label:'None'},{value:'sensitive',label:'Sensitive'},{value:'mature',label:'Mature'},{value:'educational',label:'Educational'},{value:'news',label:'News'}]}/>
          </div>
          <RowToggle label="AI-generated content" checked={form.is_ai_generated} onChange={v=>patch({is_ai_generated:v})}/>
          <RowToggle label="Sensitive content warning" checked={form.sensitive_warning} onChange={v=>patch({sensitive_warning:v})}/>
        </div>
      </Card>

      {/* Discovery & Metadata */}
      <Card title="Discovery & Metadata" className="col-span-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Language</label>
            <SSelect value={form.language} onChange={v=>patch({language:v})}
              options={LANGUAGES.map(l=>({value:l.code,label:l.label}))}/>
          </div>
          <div className="flex items-center gap-3 pt-5">
            <label className="text-xs text-gray-600">Auto captions</label>
            <Toggle checked={true} onChange={()=>{}}/>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Subtitles</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
              <span className="text-xs text-gray-400">Not Available</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Add to playlist</label>
            <SSelect value="" onChange={()=>{}} options={[]} placeholder="Select playlist"/>
          </div>
          <div className="col-span-2">
            <RowToggle label="Show on profile" desc="Allow this video to appear on user profile" checked={form.show_on_profile} onChange={v=>patch({show_on_profile:v})}/>
          </div>
        </div>
      </Card>

      {/* Notification Settings */}
      <Card title="Notification Settings">
        <div className="space-y-1">
          <div className="py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Notify followers</p>
                <p className="text-xs text-gray-400 mt-0.5">Notify followers when this video is published</p>
              </div>
              <Toggle checked={form.notify_followers} onChange={v=>patch({notify_followers:v})}/>
            </div>
          </div>
          <div className="py-2 border-t border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Send push after publish</p>
                <p className="text-xs text-gray-400 mt-0.5">Send push notification to followers</p>
              </div>
              <Toggle checked={form.send_push_after_publish} onChange={v=>patch({send_push_after_publish:v})}/>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 3 - Monetization
══════════════════════════════════════════════════════════════════════════ */
function MonetizationTab({ form, patch, video }:{form:FormState;patch:(u:Partial<FormState>)=>void;video:AdminVideoDetail}) {
  const m = video.monetization;
  const isEligible = form.mono_eligibility==='eligible';
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Eligibility */}
      <Card title="Monetization Eligibility">
        <div className="space-y-2">
          <StatusRow label="Eligibility Status" value={<StatusPill status={form.mono_eligibility}/>}/>
          <StatusRow label="Monetization Review" value={<StatusPill status={m?.review_status??'pending'}/>}/>
          <StatusRow label="Reviewed On" value={fmtDateShort(m?.reviewed_on)}/>
          <StatusRow label="Next Review" value={fmtDateShort(m?.next_review)}/>
        </div>
        {isEligible && (
          <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-100">
            <ShieldCheck size={14} className="text-green-600 shrink-0"/>
            <p className="text-xs text-green-700">Your video is approved for monetization.</p>
          </div>
        )}
        <div className="mt-3">
          <label className="text-xs font-medium text-gray-700 block mb-1.5">Update Eligibility</label>
          <SSelect value={form.mono_eligibility} onChange={v=>patch({mono_eligibility:v})}
            options={[{value:'not_eligible',label:'Not Eligible'},{value:'eligible',label:'Eligible'},{value:'pending',label:'Pending Review'},{value:'rejected',label:'Rejected'}]}/>
        </div>
      </Card>

      {/* Revenue & Earnings */}
      <Card title="Revenue & Earnings">
        <div className="space-y-1">
          <RowToggle label="Enable Ad Revenue Sharing" checked={form.ad_revenue_sharing} onChange={v=>patch({ad_revenue_sharing:v})} disabled={!isEligible}/>
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <span className="text-sm text-gray-700">Creator Fund / Revenue Program</span>
            <StatusPill status={form.creator_fund_active?'active':'inactive'}/>
          </div>
          <RowToggle label="Tips & Gifts" checked={form.tips_gifts_enabled} onChange={v=>patch({tips_gifts_enabled:v})} disabled={!isEligible}/>
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <span className="text-sm text-gray-700">Subscriptions</span>
            <StatusPill status={form.subscriptions_eligible?'eligible':'not_eligible'}/>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <span className="text-sm text-gray-700">Brand Partnerships</span>
            <StatusPill status={form.brand_partnerships_eligible?'eligible':'not_eligible'}/>
          </div>
        </div>
      </Card>

      {/* Estimated Revenue */}
      <Card title="Estimated Revenue">
        <div className="mb-3">
          <p className="text-xs text-gray-400">Total (All Time)</p>
          <p className="text-2xl font-bold text-gray-900">${(m?.total_earnings??0).toFixed(2)}</p>
          <span className="text-[11px] text-green-600 font-medium">+12.5% vs previous 30 days</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[{label:'RPM',value:`$${(m?.rpm??0).toFixed(2)}`},{label:'CPM',value:`$${(m?.cpm??0).toFixed(2)}`},{label:'Revenue',value:`$${(m?.revenue??0).toFixed(2)}`}].map(x=>(
            <div key={x.label} className="rounded-lg bg-gray-50 border border-gray-100 p-2 text-center">
              <p className="text-[11px] text-gray-400">{x.label}</p>
              <p className="text-sm font-bold text-gray-900">{x.value}</p>
            </div>
          ))}
        </div>
        <StatusRow label="Est. Next Payout" value={`$${(m?.next_payout??0).toFixed(2)}`}/>
        <StatusRow label="Payout Date" value={fmtDateShort(m?.payout_date)}/>
      </Card>

      {/* Monetization Features */}
      <Card title="Monetization Features">
        <RowToggle label="Shop / Product Tagging" checked={form.shop_product_tagging} onChange={v=>patch({shop_product_tagging:v})} disabled={!isEligible}/>
        <div className="py-2 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-800">Paid Promotion Disclosure</span>
          <SSelect value={form.paid_promotion_disclosure} onChange={v=>patch({paid_promotion_disclosure:v})}
            options={[{value:'not_required',label:'Not Required'},{value:'required',label:'Required'}]} className="w-32"/>
        </div>
        <RowToggle label="Affiliate Links" checked={form.affiliate_links_enabled} onChange={v=>patch({affiliate_links_enabled:v})} disabled={!isEligible}/>
        <RowToggle label="Allow Brand Deals" checked={form.brand_deals_allowed} onChange={v=>patch({brand_deals_allowed:v})} disabled={!isEligible}/>
        <RowToggle label="Auto-claim Brand Mentions" checked={form.auto_claim_brand_mentions} onChange={v=>patch({auto_claim_brand_mentions:v})} disabled={!isEligible}/>
      </Card>

      {/* Payout & Payment */}
      <Card title="Payout & Payment">
        <div className="space-y-2">
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Payout Method</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
              <div className="h-5 w-5 rounded bg-blue-600 grid place-items-center"><span className="text-white text-[8px] font-bold">P</span></div>
              <span className="text-xs text-gray-700 flex-1">{m?.payout_method??'PayPal'}</span>
              <StatusPill status="verified"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Min Payout</p>
              <div className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700">$25.00</div>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 mb-1">Currency</p>
              <div className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700">{m?.payout_currency??'USD'}</div>
            </div>
          </div>
          <StatusRow label="Payout Status" value={<StatusPill status={m?.payout_status??'up_to_date'}/>}/>
        </div>
      </Card>

      {/* Eligibility by Region + Policy + Notes */}
      <Card title="Eligibility by Region">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Allowed Regions</label>
            <SSelect value="worldwide" onChange={()=>{}} options={[{value:'worldwide',label:'Worldwide'},{value:'us',label:'US Only'},{value:'in',label:'India Only'}]}/>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Blocked Regions</label>
            <SSelect value="" onChange={()=>{}} options={[{value:'',label:'None'}]}/>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50">
            <Globe size={12} className="text-gray-400 shrink-0"/>
            <p className="text-[11px] text-gray-500">Monetization is available in all regions.</p>
          </div>
        </div>
      </Card>

      {/* Policy + Notes */}
      <Card title="Policy Compliance" className="col-span-2">
        <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-green-50 border border-green-100">
          <ShieldCheck size={14} className="text-green-600 shrink-0"/>
          <div>
            <p className="text-xs font-medium text-green-700">No monetization policy violations</p>
            <p className="text-[11px] text-green-600">This video follows our Monetization Policies.</p>
          </div>
          <button type="button" className="ml-auto text-xs text-green-700 hover:underline">View Policies</button>
        </div>
      </Card>

      <Card title="Monetization Notes">
        <div className="space-y-1.5">
          <textarea value={form.monetization_notes} onChange={e=>patch({monetization_notes:e.target.value.slice(0,500)})}
            rows={4} placeholder="Add internal monetization notes..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none resize-none focus:ring-2 focus:border-transparent"
            style={{"--tw-ring-color":PINK} as React.CSSProperties}/>
          <p className="text-[11px] text-gray-400 text-right">{form.monetization_notes.length}/500</p>
        </div>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 4 - Visibility
══════════════════════════════════════════════════════════════════════════ */
function VisibilityTab({ form, patch, video }:{form:FormState;patch:(u:Partial<FormState>)=>void;video:AdminVideoDetail}) {
  const VIS_OPTIONS = [
    {value:'published',label:'Public',desc:'Everyone can see this video',icon:<Globe size={16}/>},
    {value:'private',label:'Private',desc:'Only the creator can see',icon:<Lock size={16}/>},
    {value:'draft',label:'Draft',desc:'Saved but not publicly visible',icon:<FilmIcon size={16}/>},
    {value:'scheduled',label:'Scheduled',desc:'Will publish at a set time',icon:<Clock size={16}/>},
  ];
  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Current Visibility */}
      <Card title="Current Visibility">
        <div className="space-y-2">
          {VIS_OPTIONS.map(opt=>(
            <button key={opt.value} type="button" onClick={()=>patch({status:opt.value})}
              className={cn("w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                form.status===opt.value?"border-2":"border-gray-200 hover:border-gray-300 hover:bg-gray-50")}
              style={form.status===opt.value?{borderColor:PINK,background:`${PINK}08`}:{}}>
              <div className={cn("h-8 w-8 rounded-full grid place-items-center shrink-0")}
                style={form.status===opt.value?{background:`${PINK}18`,color:PINK}:{background:'#f3f4f6',color:'#9ca3af'}}>
                {opt.icon}
              </div>
              <div>
                <p className="text-sm font-medium" style={form.status===opt.value?{color:PINK}:{}}>{opt.label}</p>
                <p className="text-xs text-gray-400">{opt.desc}</p>
              </div>
              {form.status===opt.value&&<Check size={15} className="ml-auto" style={{color:PINK}}/>}
            </button>
          ))}
        </div>
        {video.status==='draft' && (
          <button type="button" className="mt-3 w-full py-2 rounded-lg text-white text-sm font-medium hover:opacity-90" style={{background:PINK}}>
            Publish Now
          </button>
        )}
        {video.status==='published' && (
          <button type="button" className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Unpublish Video
          </button>
        )}
      </Card>

      {/* Recommendation Controls */}
      <Card title="Recommendation Controls">
        <RowToggle label="Eligible for For You feed" checked={form.recommendation_eligible} onChange={v=>patch({recommendation_eligible:v})}/>
        <RowToggle label="Eligible for Explore/Search" checked={form.search_indexing} onChange={v=>patch({search_indexing:v})}/>
        <RowToggle label="Show on profile" checked={form.show_on_profile} onChange={v=>patch({show_on_profile:v})}/>
        <RowToggle label="Allow search indexing" checked={form.search_indexing} onChange={v=>patch({search_indexing:v})}/>
      </Card>

      {/* Region */}
      <Card title="Region Visibility">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Allowed Regions</label>
            <input value={form.region_allowed} onChange={e=>patch({region_allowed:e.target.value})}
              placeholder="Worldwide (leave blank)" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none"/>
            <p className="text-[11px] text-gray-400 mt-1">Comma-separated country codes e.g. US, IN, NP</p>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Blocked Regions</label>
            <input value={form.region_blocked} onChange={e=>patch({region_blocked:e.target.value})}
              placeholder="None" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none"/>
          </div>
        </div>
      </Card>

      {/* Schedule & Publish */}
      <Card title="Schedule & Publish" className="col-span-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Published Date</label>
            <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">{fmtDate(video.updated_at)}</div>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Schedule Post</label>
            <input type="datetime-local" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none"/>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Expire/Unpublish Date</label>
            <input type="datetime-local" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none"/>
            <p className="text-[11px] text-gray-400 mt-1">Optional - leave blank to never expire</p>
          </div>
        </div>
      </Card>

      {/* Restriction */}
      <Card title="Restriction Status">
        <RowToggle label="Limited Distribution" desc="Restrict video from wide recommendation" checked={form.limited_distribution} onChange={v=>patch({limited_distribution:v})}/>
        <RowToggle label="Shadowban / Limited Recommendation" checked={form.shadowban_enabled} onChange={v=>patch({shadowban_enabled:v})}/>
        {(form.limited_distribution||form.shadowban_enabled) && (
          <div className="mt-3">
            <label className="text-xs text-gray-600 block mb-1.5">Admin Reason</label>
            <textarea value={form.limited_reason} onChange={e=>patch({limited_reason:e.target.value})}
              rows={2} placeholder="Reason for restriction..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none resize-none"/>
          </div>
        )}
      </Card>

      {/* Privacy & Sharing */}
      <Card title="Privacy & Sharing" className="col-span-2">
        <div className="grid grid-cols-2 gap-x-8">
          <RowToggle label="Allow Share" checked={form.allow_sharing} onChange={v=>patch({allow_sharing:v})}/>
          <RowToggle label="Allow Embed" checked={form.allow_embedding} onChange={v=>patch({allow_embedding:v})}/>
          <RowToggle label="Allow Download" checked={form.allow_download} onChange={v=>patch({allow_download:v})}/>
          <RowToggle label="Allow Duet/Stitch" checked={form.allow_duet&&form.allow_stitch} onChange={v=>patch({allow_duet:v,allow_stitch:v})}/>
        </div>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 5 - Advanced
══════════════════════════════════════════════════════════════════════════ */
function AdvancedTab({ form, patch, video, onDelete, onUnpublish, onReprocess, onSafetyCheck }:{
  form:FormState; patch:(u:Partial<FormState>)=>void;
  video:AdminVideoDetail;
  onDelete:()=>void; onUnpublish:()=>void;
  onReprocess:()=>void; onSafetyCheck:()=>void;
}) {
  const slug = (video.title??'untitled').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return (
    <div className="space-y-4">
      {/* Top fields */}
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1.5">Internal Content ID</label>
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
            <span className="text-sm font-mono text-gray-700 flex-1">{contentId(video.id)}</span>
            <button type="button" onClick={()=>{navigator.clipboard.writeText(contentId(video.id));toast.success('Copied!');}}><Copy size={13} className="text-gray-400 hover:text-gray-600"/></button>
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-700 block mb-1.5">Content Slug</label>
          <div className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
            <span className="text-sm font-mono text-gray-600 flex-1 truncate">{slug}</span>
            <button type="button" onClick={()=>{navigator.clipboard.writeText(slug);toast.success('Copied!');}}><Copy size={13} className="text-gray-400 hover:text-gray-600"/></button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1.5">Moderation Status</label>
          <SSelect value={form.moderation_status} onChange={v=>patch({moderation_status:v})}
            options={[{value:'pending',label:'Pending Review'},{value:'approved',label:'Approved'},{value:'rejected',label:'Rejected'},{value:'under_review',label:'Under Review'}]}/>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1.5">Review Priority</label>
          <SSelect value={form.review_priority} onChange={v=>patch({review_priority:v})}
            options={[{value:'low',label:'Low'},{value:'normal',label:'Normal'},{value:'high',label:'High'},{value:'urgent',label:'Urgent'}]}/>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Distribution */}
        <Card title="Distribution & Visibility Controls">
          <RowToggle label="Shadowban / Limited Distribution" checked={form.shadowban_enabled} onChange={v=>patch({shadowban_enabled:v})}/>
          <RowToggle label="Eligible for Recommendations" checked={form.recommendation_eligible} onChange={v=>patch({recommendation_eligible:v})}/>
          <RowToggle label="Search Indexing" checked={form.search_indexing} onChange={v=>patch({search_indexing:v})}/>
          <div className="py-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-700">Duplicate Content Detection</span>
            <StatusPill status={video.duplicate_match_status??'no_match'}/>
          </div>
          <div className="py-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-700">Copyright Match Status</span>
            <StatusPill status={video.copyright_match_status??'no_match'}/>
          </div>
          {video.content_fingerprint && (
            <div className="py-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Content Fingerprint</p>
              <div className="flex items-center gap-1">
                <code className="text-[11px] font-mono text-gray-600 flex-1 truncate">{video.content_fingerprint.slice(0,18)}…</code>
                <button type="button" onClick={()=>{navigator.clipboard.writeText(video.content_fingerprint??'');toast.success('Copied!');}}><Copy size={12} className="text-gray-400 hover:text-gray-600"/></button>
              </div>
            </div>
          )}
        </Card>

        {/* Compliance */}
        <Card title="Compliance & Legal Controls">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-600 block mb-1.5">Age Restriction / Age Gate</label>
              <SSelect value={form.age_restriction} onChange={v=>patch({age_restriction:v})}
                options={[{value:'none',label:'None'},{value:'13plus',label:'13+'},{value:'16plus',label:'16+'},{value:'18plus',label:'18+'}]}/>
            </div>
            <RowToggle label="Legal Hold" checked={form.legal_hold} onChange={v=>patch({legal_hold:v})}/>
            <div>
              <label className="text-xs text-gray-600 block mb-1.5">Region Block List</label>
              <SSelect value="" onChange={()=>{}} options={[{value:'',label:'None'}]}/>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1.5">Reporting Sensitivity</label>
              <SSelect value={form.reporting_sensitivity} onChange={v=>patch({reporting_sensitivity:v})}
                options={[{value:'low',label:'Low'},{value:'standard',label:'Standard'},{value:'high',label:'High'}]}/>
            </div>
          </div>
        </Card>

        {/* Archive */}
        <Card title="Archive & Lifecycle">
          <div className="space-y-3">
            <StatusRow label="Archive Status" value={<StatusPill status={form.archive_status}/>}/>
            <StatusRow label="Archived On" value="-"/>
            <StatusRow label="Restore Point" value="Not Available"/>
            <div>
              <label className="text-xs text-gray-600 block mb-1.5">Auto-Archive After</label>
              <SSelect value={form.auto_archive_after} onChange={v=>patch({auto_archive_after:v})}
                options={[{value:'never',label:'Never'},{value:'30days',label:'30 Days'},{value:'90days',label:'90 Days'},{value:'180days',label:'180 Days'},{value:'1year',label:'1 Year'}]}/>
            </div>
          </div>
        </Card>

        {/* Replace Video */}
        <Card title="Replace Video File">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 mb-3">
            <div className="h-10 w-10 rounded-lg bg-gray-200 grid place-items-center shrink-0">
              <FilmIcon size={16} className="text-gray-400"/>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{video.title??'video'}.mp4</p>
              <p className="text-[11px] text-gray-400">{fmtBytes(video.file_size)} • {video.width&&video.height?`${video.width}×${video.height}`:'-'} • MP4</p>
            </div>
          </div>
          <button type="button" className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            <Upload size={13}/> Replace File
          </button>
          <p className="text-[11px] text-gray-400 mt-1.5 text-center">Max 5GB • MP4, MOV, WebM</p>
        </Card>

        {/* Reprocess */}
        <Card title="Reprocess & Transcoding">
          <StatusRow label="Current Status" value={<StatusPill status={video.content_check_status??'processed'}/>}/>
          <StatusRow label="Processed On" value={fmtDateShort(video.updated_at)}/>
          <button type="button" onClick={onReprocess}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium text-white hover:opacity-90"
            style={{borderColor:PINK,background:PINK}}>
            <RefreshCw size={13}/> Reprocess Video
          </button>
          <p className="text-[11px] text-gray-400 mt-1.5 text-center">This will queue the video for re-encoding.</p>
        </Card>

        {/* Quality */}
        <Card title="Quality / Bitrate Metadata">
          <div className="space-y-1.5">
            <StatusRow label="Resolution" value={video.width&&video.height?`${video.width} x ${video.height}`:'-'}/>
            <StatusRow label="Frame Rate" value="30 fps"/>
            <StatusRow label="Video Bitrate" value="5.2 Mbps"/>
            <StatusRow label="Audio Bitrate" value="128 kbps"/>
            <StatusRow label="Codec" value="H.264 / AAC"/>
          </div>
        </Card>

        {/* Captions */}
        <Card title="Captions / Subtitles File" className="col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
              {video.captions_file_url ? 'English (auto-generated)' : 'No captions file uploaded'}
            </div>
            {video.captions_file_url && (
              <button type="button" className="h-8 w-8 grid place-items-center rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600"><X size={14}/></button>
            )}
          </div>
          <button type="button" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            <Upload size={13}/> Upload Captions File
          </button>
          <p className="text-[11px] text-gray-400 mt-1.5">SRT, VTT • Max 10MB</p>
        </Card>

        {/* Audit Notes */}
        <Card title="Audit Notes">
          <textarea value={form.audit_notes} onChange={e=>patch({audit_notes:e.target.value.slice(0,500)})}
            rows={4} placeholder="Add audit notes..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none resize-none focus:ring-2 focus:border-transparent"
            style={{"--tw-ring-color":PINK} as React.CSSProperties}/>
          <p className="text-[11px] text-gray-400 mt-1 text-right">{form.audit_notes.length}/500</p>
        </Card>

        {/* Internal Notes */}
        <Card title="Internal Admin Notes">
          <textarea value={form.admin_notes} onChange={e=>patch({admin_notes:e.target.value.slice(0,500)})}
            rows={4} placeholder="Internal notes (not visible to users)..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none resize-none focus:ring-2 focus:border-transparent"
            style={{"--tw-ring-color":PINK} as React.CSSProperties}/>
          <p className="text-[11px] text-gray-400 mt-1 text-right">{form.admin_notes.length}/500</p>
        </Card>

        {/* Admin Quick Actions */}
        <Card title="Admin Actions (Quick)">
          <div className="space-y-2">
            <button type="button" onClick={()=>updateAdminVideo(video.id,{allow_comments:false}).then(()=>toast.success('Comments disabled.'))}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <MessageCircle size={14} className="text-gray-400"/> Temporarily Disable Comments
            </button>
            <button type="button" onClick={onUnpublish}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
              <EyeOff size={14} className="text-gray-400"/> Unpublish Video
            </button>
            <button type="button" onClick={onDelete}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50">
              <Trash2 size={14}/> Delete Video
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export function AdminVideoEditPage({ videoId }: { videoId: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [form, setForm] = useState<FormState|null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-video-edit", videoId],
    queryFn: () => getAdminVideoEditData(videoId).catch(async () => {
      // Fallback to basic show() if edit-data endpoint not yet deployed
      const { getAdminVideo } = await import("@/services/admin-video.service");
      const v = await getAdminVideo(videoId);
      return { video: v, earnings: null, playlists: [] };
    }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if(data?.video && !form) setForm(initForm(data.video, data.video.monetization??null));
  }, [data]);

  const video = data?.video;
  const playlists = data?.playlists ?? [];

  function patch(updates: Partial<FormState>) { setForm(prev=>prev?{...prev,...updates}:prev); }

  /* ── Mutations ── */
  function makeSaveMutation(tabFn: (id:number, payload:any) => Promise<any>) {
    return useMutation({
      mutationFn: (payload:any) => tabFn(videoId, payload),
      onSuccess: () => {
        toast.success("Video updated successfully.");
        void qc.invalidateQueries({ queryKey: ["admin-video-edit", videoId] });
      },
      onError: () => toast.error("Failed to save changes."),
    });
  }

  const detailsMut = useMutation({
    mutationFn: (payload:any) => updateAdminVideo(videoId, payload),
    onSuccess:()=>{ toast.success("Video updated successfully."); void qc.invalidateQueries({queryKey:["admin-video-edit",videoId]}); },
    onError:()=>toast.error("Failed to save changes."),
  });
  const settingsMut = useMutation({
    mutationFn: (payload:any) => updateVideoSettings(videoId, payload),
    onSuccess:()=>{ toast.success("Settings saved."); void qc.invalidateQueries({queryKey:["admin-video-edit",videoId]}); },
    onError:()=>toast.error("Failed to save settings."),
  });
  const monetizationMut = useMutation({
    mutationFn: (payload:any) => updateVideoMonetization(videoId, payload),
    onSuccess:()=>{ toast.success("Monetization updated."); void qc.invalidateQueries({queryKey:["admin-video-edit",videoId]}); },
    onError:()=>toast.error("Failed to update monetization."),
  });
  const visibilityMut = useMutation({
    mutationFn: (payload:any) => updateVideoVisibility(videoId, payload),
    onSuccess:()=>{ toast.success("Visibility updated."); void qc.invalidateQueries({queryKey:["admin-video-edit",videoId]}); },
    onError:()=>toast.error("Failed to update visibility."),
  });
  const advancedMut = useMutation({
    mutationFn: (payload:any) => updateVideoAdvanced(videoId, payload),
    onSuccess:()=>{ toast.success("Advanced settings saved."); void qc.invalidateQueries({queryKey:["admin-video-edit",videoId]}); },
    onError:()=>toast.error("Failed to save advanced settings."),
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteAdminVideo(videoId, "Removed by admin"),
    onSuccess:()=>{ toast.success("Video removed."); router.back(); },
    onError:()=>toast.error("Failed to remove video."),
  });
  const unpublishMut = useMutation({
    mutationFn: () => unpublishAdminVideo(videoId),
    onSuccess:()=>{ toast.success("Video unpublished."); void qc.invalidateQueries({queryKey:["admin-video-edit",videoId]}); },
    onError:()=>toast.error("Failed to unpublish video."),
  });
  const safetyMut = useMutation({
    mutationFn: () => runVideoSafetyCheck(videoId),
    onSuccess:()=>toast.info("Safety check queued."),
    onError:()=>toast.error("Failed to queue safety check."),
  });
  const reprocessMut = useMutation({
    mutationFn: () => reprocessVideo(videoId),
    onSuccess:()=>toast.info("Video queued for reprocessing."),
    onError:()=>toast.error("Failed to queue reprocessing."),
  });

  function handleSave(asDraft=false) {
    if(!form) return;
    if(activeTab==='details') {
      detailsMut.mutate({
        title: form.title.trim()||null, caption: form.caption.trim()||null,
        category: form.category||null, location: form.location.trim()||null,
        language: form.language||null, hashtags: form.tags,
        status: asDraft?'draft':undefined,
        allow_comments: form.allow_comments, allow_duet: form.allow_duet, allow_stitch: form.allow_stitch,
      });
    } else if(activeTab==='settings') {
      settingsMut.mutate({
        allow_comments: form.allow_comments, allow_replies: form.allow_replies,
        allow_duet: form.allow_duet, allow_stitch: form.allow_stitch,
        allow_download: form.allow_download, allow_sharing: form.allow_sharing,
        allow_embedding: form.allow_embedding, age_restriction: form.age_restriction,
        content_label: form.content_label||null, is_ai_generated: form.is_ai_generated,
        sensitive_warning: form.sensitive_warning, language: form.language,
        show_on_profile: form.show_on_profile, notify_followers: form.notify_followers,
        send_push_after_publish: form.send_push_after_publish,
      });
    } else if(activeTab==='monetization') {
      monetizationMut.mutate({
        ad_revenue_sharing: form.ad_revenue_sharing,
        creator_fund_active: form.creator_fund_active,
        tips_gifts_enabled: form.tips_gifts_enabled,
        subscriptions_eligible: form.subscriptions_eligible,
        brand_partnerships_eligible: form.brand_partnerships_eligible,
        shop_product_tagging: form.shop_product_tagging,
        paid_promotion_disclosure: form.paid_promotion_disclosure,
        affiliate_links_enabled: form.affiliate_links_enabled,
        brand_deals_allowed: form.brand_deals_allowed,
        auto_claim_brand_mentions: form.auto_claim_brand_mentions,
        monetization_notes: form.monetization_notes,
        eligibility_status: form.mono_eligibility,
      });
    } else if(activeTab==='visibility') {
      visibilityMut.mutate({
        status: form.status,
        recommendation_eligible: form.recommendation_eligible,
        search_indexing: form.search_indexing,
        show_on_profile: form.show_on_profile,
        region_allowed: form.region_allowed ? form.region_allowed.split(',').map(s=>s.trim()).filter(Boolean) : null,
        region_blocked: form.region_blocked ? form.region_blocked.split(',').map(s=>s.trim()).filter(Boolean) : null,
        shadowban_enabled: form.shadowban_enabled,
        limited_distribution: form.limited_distribution,
        limited_reason: form.limited_reason||null,
        allow_sharing: form.allow_sharing,
        allow_download: form.allow_download,
      });
    } else if(activeTab==='advanced') {
      advancedMut.mutate({
        moderation_status: form.moderation_status,
        review_priority: form.review_priority,
        legal_hold: form.legal_hold,
        reporting_sensitivity: form.reporting_sensitivity,
        archive_status: form.archive_status,
        auto_archive_after: form.auto_archive_after,
        admin_notes: form.admin_notes||null,
        audit_notes: form.audit_notes||null,
      });
    }
  }

  const isSaving = detailsMut.isPending||settingsMut.isPending||monetizationMut.isPending||visibilityMut.isPending||advancedMut.isPending;

  /* ── Render loading/error ── */
  if(isLoading || !form) {
    return (
      <div className="-mx-6 -my-6 flex items-center justify-center bg-gray-50" style={{minHeight:'calc(100vh - 56px)'}}>
        <Loader2 size={32} className="animate-spin" style={{color:PINK}}/>
      </div>
    );
  }
  if(isError || !video) {
    return (
      <div className="-mx-6 -my-6 flex flex-col items-center justify-center bg-gray-50 gap-3" style={{minHeight:'calc(100vh - 56px)'}}>
        <AlertTriangle size={32} className="text-gray-400"/>
        <p className="text-sm text-gray-500">Failed to load video data.</p>
        <button onClick={()=>router.back()} className="text-xs font-medium hover:underline" style={{color:PINK}}>Go back</button>
      </div>
    );
  }

  return (
    <div className="-mx-6 -my-6 flex bg-gray-50" style={{minHeight:'calc(100vh - 56px)'}}>
      {/* Admin Sidebar */}
      <AdminSidebar userId={video.user.id}/>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Page header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Edit Video</h1>
            <nav className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
              <span>User Content</span><ChevronRight size={12}/><span>Videos</span><ChevronRight size={12}/><span style={{color:PINK}}>Edit Video</span>
            </nav>
          </div>
          <button type="button" onClick={()=>router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            <ArrowLeft size={14}/> Back to Content
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 px-6 shrink-0">
          <div className="flex items-center gap-0">
            {TABS.map(tab=>(
              <button key={tab.id} type="button" onClick={()=>setActiveTab(tab.id)}
                className={cn("px-4 py-3.5 text-sm font-medium transition-colors relative",
                  activeTab===tab.id ? "text-gray-900" : "text-gray-500 hover:text-gray-700")}>
                {tab.label}
                {activeTab===tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{background:PINK}}/>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab==='details'      && <DetailsTab form={form} patch={patch} video={video} playlists={playlists}/>}
            {activeTab==='settings'     && <SettingsTab form={form} patch={patch}/>}
            {activeTab==='monetization' && <MonetizationTab form={form} patch={patch} video={video}/>}
            {activeTab==='visibility'   && <VisibilityTab form={form} patch={patch} video={video}/>}
            {activeTab==='advanced'     && <AdvancedTab form={form} patch={patch} video={video}
              onDelete={()=>setShowDelete(true)}
              onUnpublish={()=>unpublishMut.mutate()}
              onReprocess={()=>reprocessMut.mutate()}
              onSafetyCheck={()=>safetyMut.mutate()}/>}
          </div>

          {/* Right sidebar */}
          <div className="w-72 shrink-0 border-l border-gray-200 overflow-y-auto flex flex-col gap-3 p-4">
            <VideoPreviewCard video={video}/>
            <VideoStatusCard video={video} tab={activeTab}/>

            {/* Content Safety */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                {video.content_check_passed===true
                  ?<ShieldCheck size={14} className="text-green-500"/>
                  :<AlertTriangle size={14} className="text-amber-400"/>}
                <p className="text-xs font-semibold text-gray-800">Content Safety</p>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">
                {video.content_check_passed===true?"No violations detected":video.content_check_reason??"Not yet checked"}
              </p>
              <button type="button" onClick={()=>safetyMut.mutate()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                {safetyMut.isPending?<Loader2 size={11} className="animate-spin"/>:<RefreshCw size={11}/>}
                Run Safety Check
              </button>
            </div>
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="bg-white border-t border-gray-200 px-6 py-3.5 flex items-center gap-3 shrink-0">
          <button type="button" onClick={()=>handleSave(false)} disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
            style={{background:PINK}}>
            {isSaving?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>}
            Save Changes
          </button>
          <button type="button" onClick={()=>handleSave(true)} disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60">
            Save as Draft
          </button>
          <button type="button" onClick={()=>router.back()}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
      </div>

      {/* Delete Confirm Modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-red-100 grid place-items-center shrink-0">
                <Trash2 size={20} className="text-red-600"/>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Delete Video?</p>
                <p className="text-xs text-gray-500 mt-0.5">This will remove the video. It can be restored from admin.</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={()=>setShowDelete(false)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={()=>deleteMut.mutate()} disabled={deleteMut.isPending}
                className="flex-1 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                style={{background:'#ef4444'}}>
                {deleteMut.isPending?"Removing…":"Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
