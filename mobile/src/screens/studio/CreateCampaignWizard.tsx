import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Linking, Modal, PanResponder,
  Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { Image } from "expo-image";
import { Avatar } from "@/components/Avatar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Apple, ArrowRight, BarChart3, Bell, Briefcase, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock,
  Clapperboard, Compass, CreditCard, Download, FileText, Globe, Hash, Heart, Images, Info, LayoutDashboard, LayoutGrid, Lightbulb, Link2,
  Lock, MapPin, MessageCircle, MessageSquare, MoreVertical, PauseCircle, Pencil, Play, Plus,
  Search, Share2, ShoppingBag, ShoppingCart, Sparkles, Tag, TrendingUp, User, Users, UserPlus, Wallet, X, Ban, CheckCircle2, Coins,
} from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Logo } from "@/components/Logo";
import {
  promotionApi, type CreatePromotion, type CtaType, type PromotionObjective,
} from "@/api/promotion.api";
import { studioApi } from "@/api/studio.api";
import { authApi } from "@/api/auth.api";
import { giftApi } from "@/api/gift.api";
import { useAuthStore } from "@/store/auth.store";
import { useAdAccountStore } from "@/store/ad-account.store";
import { apiErrorMessage } from "@/api/client";
import { locationApi, type LocationResult } from "@/api/location.api";
import { LocationMapSheet, type GeoTarget } from "./LocationMapSheet";
import { CATEGORIES } from "@/screens/settings/profileFields";
import { COUNTRIES, countryFlag } from "@/constants/countries";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact, formatDuration } from "@/utils/format";
import type { Video } from "@/types";

/* ───────────────────────────── config ───────────────────────────── */

type GoalId = "views" | "followers" | "engagement" | "website" | "messages" | "installs" | "sales";

const GOALS: {
  id: GoalId; label: string; desc: string; icon: any;
  color: string; tint: string; objective: PromotionObjective;
}[] = [
  { id: "views",      label: "More Video Views",  desc: "Get more views and watch time",        icon: Play,          color: "#fe2c55", tint: "#ffe4ea", objective: "more_views" },
  { id: "followers",  label: "More Followers",    desc: "Grow your profile followers",          icon: UserPlus,      color: "#7c3aed", tint: "#ede9fe", objective: "more_followers" },
  { id: "engagement", label: "More Engagement",   desc: "Get more likes, comments & shares",    icon: Heart,         color: "#f59e0b", tint: "#fff1d6", objective: "more_engagement" },
  { id: "website",    label: "Website Traffic",   desc: "Drive traffic to your website",        icon: Globe,         color: "#16a34a", tint: "#dcfce7", objective: "more_profile_visits" },
  { id: "messages",   label: "Messages",          desc: "Get more messages and conversations",  icon: MessageCircle, color: "#2563eb", tint: "#dbeafe", objective: "more_engagement" },
  { id: "installs",   label: "App Installs",      desc: "Promote your app and get installs",    icon: Download,      color: "#7c3aed", tint: "#ede9fe", objective: "more_profile_visits" },
  { id: "sales",      label: "Sales / Conversions", desc: "Increase sales and conversions",     icon: ShoppingBag,   color: "#f59e0b", tint: "#fff1d6", objective: "more_profile_visits" },
];

const PLACEMENTS: { id: string; label: string; desc: string; variant: string; badge?: string }[] = [
  { id: "in_feed",     label: "In-Feed Videos",   desc: "Your ad appears between videos in the feed.", variant: "feed",    badge: "Most Popular" },
  { id: "profile_top", label: "Profile Top",      desc: "Banner on user profiles.",                    variant: "profile" },
  { id: "hashtag",     label: "Hashtag Page",     desc: "Show on hashtag pages.",                      variant: "hashtag" },
  { id: "search",      label: "Search Results",   desc: "Show in search results.",                     variant: "search" },
  { id: "inbox",       label: "Inbox (Messages)", desc: "Show in inbox messages.",                     variant: "inbox" },
  { id: "explore",     label: "Explore Page",     desc: "Show on explore page.",                       variant: "explore" },
];

const AGES = ["13-17", "18-24", "25-34", "35-44", "45+"];
const GENDERS: { id: "all" | "male" | "female"; label: string }[] = [
  { id: "all", label: "All" }, { id: "male", label: "Male" }, { id: "female", label: "Female" },
];
// Quick-pick chips shown inline on the Audience step; the full account-settings
// interest list (CATEGORIES, ~140) lives in the searchable "Add Interest" sheet.
const BASE_INTERESTS = ["Travel", "Food", "Fashion", "Gaming", "Music", "Sports", "Technology"];
// Audience language targeting (searchable multi-select).
const LANGUAGES = [
  "English", "Hindi", "Nepali", "Spanish", "French", "Arabic", "Portuguese", "Bengali",
  "Russian", "Japanese", "German", "Chinese (Mandarin)", "Korean", "Indonesian", "Urdu",
  "Turkish", "Italian", "Vietnamese", "Thai", "Tamil", "Telugu", "Marathi", "Punjabi",
  "Filipino", "Malay", "Dutch", "Polish", "Ukrainian", "Persian", "Swahili",
];
// Detailed demographics + behaviours (custom audience).
const RELATIONSHIP = ["Single", "In a relationship", "Engaged", "Married"];
const EDUCATION = ["In high school", "In college", "College grad", "Postgrad"];
const PARENTAL = ["All", "Parents", "Not parents"];
const BEHAVIORS = [
  "Engaged shoppers", "Frequent travelers", "International travelers", "Tech early adopters",
  "Mobile gamers", "Online buyers", "Fitness enthusiasts", "Foodies", "Luxury shoppers",
  "Small business owners", "Deal seekers", "Streaming subscribers", "New parents", "Pet owners",
  "Homeowners", "Students", "Job seekers", "Event-goers", "Music lovers", "Content creators",
];
// CTA button picker - icon tiles shown in the Creative step (label + backend enum).
// "No Button" (none) hides the CTA on the sponsored card.
const CTA_GRID: { label: string; value: CtaType; icon: any }[] = [
  { label: "Get Offer",     value: "get_offer",     icon: Tag },
  { label: "Learn More",    value: "learn_more",    icon: Info },
  { label: "Shop Now",      value: "shop_now",      icon: ShoppingBag },
  { label: "Visit Website", value: "visit_website", icon: Globe },
  { label: "Book Now",      value: "book_now",      icon: Calendar },
  { label: "Contact Us",    value: "contact_us",    icon: User },
  { label: "Send Message",  value: "send_message",  icon: MessageCircle },
  { label: "Download",      value: "download",      icon: Download },
  { label: "Sign Up",       value: "sign_up",       icon: UserPlus },
  { label: "Order Now",     value: "order_now",     icon: ShoppingCart },
  { label: "Subscribe",     value: "subscribe",     icon: Bell },
  { label: "No Button",     value: "none",          icon: Ban },
];
const ctaLabelOf = (v: CtaType) => CTA_GRID.find((c) => c.value === v)?.label ?? "Learn More";
// USD is the default boost currency (a per-account currency setting comes later).
const CURRENCIES = ["USD", "NPR", "INR", "EUR", "GBP"];

const PAY_TABS: { id: string; label: string; method: CreatePromotion["payment_method"] }[] = [
  { id: "card",   label: "Credit / Debit Card", method: "credit_card" },
  { id: "apple",  label: "Apple Pay",           method: "credit_card" },
  { id: "google", label: "Google Pay",          method: "credit_card" },
  { id: "wallet", label: "Wallet",              method: "reelsoo_balance" },
];

const SAVED_CARDS = [
  { id: "visa", brand: "Visa", last4: "4242", exp: "03/28" },
  { id: "mc",   brand: "Mastercard", last4: "8888", exp: "07/27" },
  { id: "amex", brand: "American Express", last4: "3005", exp: "11/26" },
];

// Payment methods shown on the goal flows' Review & Payment step. Reelsoo Coins
// (earned/received) can pay for ads at 100 coins = $1.
const COINS_PER_USD = 100;
const GOAL_PAY_METHODS: { id: string; label: string; icon: any; method: CreatePromotion["payment_method"] }[] = [
  { id: "coins",  label: "Teezer Coins",  icon: Coins,      method: "reelsoo_balance" },
  { id: "card",   label: "Card",           icon: CreditCard, method: "credit_card" },
  { id: "apple",  label: "Apple Pay",      icon: Apple,      method: "credit_card" },
  { id: "wallet", label: "Wallet",         icon: Wallet,     method: "reelsoo_balance" },
];

const STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the main result you want from this campaign." },
  { title: "Where do you want your ad to appear?", sub: "Select one or more placements." },
  { title: "Who is your audience?", sub: "Define who should see your ad." },
  { title: "Budget & Schedule", sub: "Set your budget and schedule." },
  { title: "Create Your Ad", sub: "Add your creative and ad details." },
  { title: "Review Campaign", sub: "Check your campaign details before publishing." },
  { title: "Payment", sub: "Choose how you'd like to pay and launch your campaign." },
];
const NEXT_LABELS = ["Next", "Next: Audience", "Next: Budget", "Next: Creative", "Next: Review", "Next: Payment", "Pay & Publish Campaign"];
// Boost from $1/day minimum; the amount input accepts any number above it.
const SLIDER_MIN = 1;
const SLIDER_MAX = 100_000;

/* ─── "More Followers" goal - its own step flow (matches the design chart), built
   from the same UI primitives. Only the steps/settings differ; the layout does not. */
const FOLLOWER_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the main result you want from this campaign." },
  { title: "What do you want to promote?", sub: "Choose how you want to grow your followers." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better results." },
  { title: "Where should your ad appear?", sub: "Choose placements to help people discover and follow you." },
  { title: "Set your budget and duration", sub: "Choose how much you want to spend and for how long." },
  { title: "How your promotion will look", sub: "This is how your profile will appear to users." },
  { title: "Review your campaign", sub: "Check your settings before launching." },
];
const FOLLOWER_NEXT_LABELS = ["Next", "Next: Audience", "Next: Placement", "Next: Budget", "Next: Preview", "Next: Review", "Launch Campaign"];
// Follower-specific placement surfaces (stored faithfully; ads delivery is gated off).
const FOLLOW_PLACEMENTS: { id: string; label: string; desc: string; icon: any }[] = [
  { id: "for_you_feed",           label: "For You Feed",              desc: "Show your profile in For You feed",  icon: TrendingUp },
  { id: "suggested_accounts",     label: "Suggested Accounts",        desc: "Show in suggested accounts",         icon: UserPlus },
  { id: "follow_recommendations", label: "Following Recommendations", desc: "Show to people who may follow you",  icon: Users },
  { id: "discover_people",        label: "Discover People",           desc: "Show in discover people section",    icon: Compass },
];
const FOLLOW_BTN_TEXTS = ["Follow", "Follow Creator", "Follow for More", "Follow Now"];
const FOLLOW_DURATIONS = [3, 7, 14, 30];

/* ─── "More Video Views" goal - its own chart-matching step flow, same UI primitives. */
const VIEWS_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the main result you want from this campaign." },
  { title: "Select videos to promote", sub: "Choose up to 3 videos you want to get more views and watch time." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better results." },
  { title: "Set your budget and duration", sub: "Choose how much you want to spend and for how long." },
  { title: "Where should your ad appear?", sub: "Choose placements to get more views." },
  { title: "Video Settings", sub: "Optimize how your video ad performs." },
  { title: "Review your campaign", sub: "Review your settings before launching." },
];
const VIEWS_NEXT_LABELS = ["Next", "Next: Audience", "Next: Budget", "Next: Placements", "Next: Video Settings", "Next: Review", "Launch Campaign"];
// Video-view placement surfaces (stored faithfully; ads delivery is gated off).
const VIEW_PLACEMENTS: { id: string; label: string; desc: string; icon: any }[] = [
  { id: "for_you_feed",     label: "For You Feed",     desc: "Show in For You feed",      icon: TrendingUp },
  { id: "following_feed",   label: "Following Feed",   desc: "Show in Following feed",    icon: Users },
  { id: "explore_feed",     label: "Explore Feed",     desc: "Show in Explore feed",      icon: Compass },
  { id: "search_results",   label: "Search Results",   desc: "Show in search results",    icon: Search },
  { id: "suggested_videos", label: "Suggested Videos", desc: "Show in suggested videos",  icon: Play },
  { id: "profile_feed",     label: "Profile Feed",     desc: "Show in user profile feed", icon: User },
];
const OPTIMIZATION_GOALS = ["Video Views", "Watch Time", "Reach", "Engagement"];

/* ─── "Website Traffic" goal - its own chart-matching step flow, same UI primitives. */
const WEBSITE_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the main result you want from this campaign." },
  { title: "Where do you want to send people?", sub: "Choose your destination." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better results." },
  { title: "Set your budget and duration", sub: "Choose how much you want to spend and for how long." },
  { title: "Where should your ad appear?", sub: "Choose placements to drive more traffic." },
  { title: "Website & Call-to-Action", sub: "Add a call-to-action to encourage people to visit your website." },
  { title: "Review your campaign", sub: "Check your settings before launching." },
];
const WEBSITE_NEXT_LABELS = ["Next", "Next: Audience", "Next: Budget", "Next: Placements", "Next: Website & CTA", "Next: Review", "Launch Campaign"];
// Website Traffic reuses the same placement surfaces as the Views flow (VIEW_PLACEMENTS).
const WEBSITE_CTA_OPTIONS = CTA_GRID.filter((c) => c.value !== "none").map((c) => c.label);

/* ─── "Messages" goal - its own chart-matching step flow (reuses VIEW_PLACEMENTS). */
const MESSAGES_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the goal that fits your business objective." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better results." },
  { title: "How much do you want to spend?", sub: "Set your budget and duration." },
  { title: "Where should your ad appear?", sub: "Choose placements to get more messages." },
  { title: "Message Setup", sub: "Customize how people can start conversations with you." },
  { title: "Preview", sub: "See how your ad will look." },
  { title: "Review your campaign", sub: "Check your settings before launching." },
];
const MESSAGES_NEXT_LABELS = ["Next", "Next: Budget", "Next: Placements", "Next: Message Setup", "Next: Preview", "Next: Review", "Launch Campaign"];
const MESSAGE_ACTIONS = ["Send Message", "Chat Now", "Contact Us", "Get Quote", "Ask a Question"];
const DEFAULT_GREETING = "Hi! Thanks for your interest. How can we help you today?";
const DEFAULT_QUICK_REPLIES = ["Tell me more", "How much does it cost?", "I'm interested"];

/* ─── "App Installs" goal - its own chart-matching step flow (reuses VIEW_PLACEMENTS). */
const INSTALL_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the goal that fits your business objective." },
  { title: "Select your app", sub: "Choose the app you want to promote." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better results." },
  { title: "Set your budget and duration", sub: "Choose how much you want to spend and for how long." },
  { title: "Where should your ad appear?", sub: "Choose placements to get more app installs." },
  { title: "Ad Setup", sub: "Create an engaging ad to drive more app installs." },
  { title: "Review your campaign", sub: "Check your settings before launching." },
];
const INSTALL_NEXT_LABELS = ["Next", "Next: Audience", "Next: Budget", "Next: Placements", "Next: Ad Setup", "Next: Review", "Launch Campaign"];
const APP_SOURCES: { id: string; label: string; desc: string; icon: any }[] = [
  { id: "my_app",          label: "My App",          desc: "Promote your existing app",       icon: Download },
  { id: "app_store_url",   label: "App Store URL",   desc: "Promote from an App Store link",  icon: Apple },
  { id: "google_play_url", label: "Google Play URL", desc: "Promote from a Google Play link", icon: Play },
];
const PLATFORM_OPTS: { id: string; label: string; icon: any }[] = [
  { id: "ios", label: "iOS", icon: Apple },
  { id: "android", label: "Android", icon: Play },
];
const INSTALL_CTA_OPTIONS = ["Install Now", "Download", "Get App", "Open App", "Play Now"];
const INSTALL_TRACKING_OPTIONS = ["Install", "App Event", "Purchase", "Registration", "None"];
const DEFAULT_APP_PRIMARY_TEXT = "Create, share and watch amazing short videos. Download now!";

/* ─── "More Engagement" goal - its own chart-matching step flow. */
const ENGAGEMENT_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the goal that fits your business objective." },
  { title: "Select videos to promote", sub: "Choose up to 3 videos you want to get more engagement on." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better engagement." },
  { title: "Where should your ad appear?", sub: "Choose placements to get more engagement." },
  { title: "Set your budget and duration", sub: "Choose how much you want to spend and for how long." },
  { title: "Engagement Goal Settings", sub: "Optimize your ad for the engagement you care about most." },
  { title: "Review your campaign", sub: "Check your settings before launching." },
];
const ENGAGEMENT_NEXT_LABELS = ["Next", "Next: Audience", "Next: Placements", "Next: Budget", "Next: Settings", "Next: Review", "Launch Campaign"];
// Engagement placements per the chart (no "Following Feed").
const ENGAGEMENT_PLACEMENTS: { id: string; label: string; desc: string; icon: any }[] = [
  { id: "for_you_feed",     label: "For You Feed",     desc: "Show in For You feed",     icon: TrendingUp },
  { id: "explore_feed",     label: "Explore Feed",     desc: "Show in Explore feed",     icon: Compass },
  { id: "search_results",   label: "Search Results",   desc: "Show in search results",   icon: Search },
  { id: "suggested_videos", label: "Suggested Videos", desc: "Show in suggested videos", icon: Play },
  { id: "profile_feed",     label: "Profile Feed",     desc: "Show in profile feed",     icon: User },
];
const OPTIMIZE_FOR_OPTIONS: { id: string; label: string; desc: string; icon: any }[] = [
  { id: "all_engagements", label: "All Engagements", desc: "Likes, comments, shares", icon: Heart },
  { id: "comments",        label: "Comments",        desc: "Get more comments",       icon: MessageCircle },
  { id: "shares",          label: "Shares",          desc: "Get more shares",         icon: Share2 },
  { id: "likes",           label: "Likes",           desc: "Get more likes",          icon: Heart },
];
const ENGAGEMENT_STYLES: { id: string; label: string; desc: string; icon: any }[] = [
  { id: "balanced",              label: "Balanced",              desc: "Show to people likely to engage", icon: Heart },
  { id: "high_engagement_users", label: "High Engagement Users", desc: "Target top engagers",             icon: TrendingUp },
];

/* ─── "Sales / Conversions" goal - its own chart-matching step flow (reuses VIEW_PLACEMENTS). */
const SALES_STEP_TITLES = [
  { title: "What's your campaign goal?", sub: "Choose the goal that fits your business objective." },
  { title: "What conversion do you want?", sub: "Choose the action you want people to take." },
  { title: "Who do you want to reach?", sub: "Choose your audience for better results." },
  { title: "Set your budget and duration", sub: "Choose how much you want to spend and for how long." },
  { title: "Where should your ad appear?", sub: "Choose placements to get more conversions." },
  { title: "Tracking & Optimization", sub: "Track conversions and optimize for the best results." },
  { title: "Review your campaign", sub: "Check your settings before launching." },
];
const SALES_NEXT_LABELS = ["Next", "Next: Audience", "Next: Budget", "Next: Placements", "Next: Tracking", "Next: Review", "Launch Campaign"];
const CONV_EVENTS = ["Purchase", "Add to Cart", "Initiate Checkout", "Sign Up", "Lead", "Subscribe", "Complete Registration", "View Content"];
const CONV_EVENT_DESC: Record<string, string> = {
  "Purchase": "Completed payment or purchase",
  "Add to Cart": "Added a product to cart",
  "Initiate Checkout": "Started the checkout flow",
  "Sign Up": "Completed a sign up",
  "Lead": "Submitted a lead form",
  "Subscribe": "Started a subscription",
  "Complete Registration": "Finished registration",
  "View Content": "Viewed a key page",
};
const CONV_OPT_GOALS = ["Conversions", "Conversion Value", "Landing Page Views"];
const CONV_BID_STRATEGIES = ["Lowest Cost", "Cost Cap", "Bid Cap", "Target ROAS"];
const CONV_ATTRIBUTION = ["7-day click / 1-day view", "1-day click", "7-day click", "1-day click / 1-day view"];
const CONV_PAYMENT_EVENTS = ["Purchase", "Add Payment Info", "Subscribe", "Start Trial"];

/* ───────────────────────────── helpers ───────────────────────────── */

const group = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const cur = (n: number, c: string) => `${c} ${group(n)}`;

// Display-only USD estimate shown next to a non-USD budget. The server does the
// authoritative conversion (config/currency.php) when the campaign is created, so
// campaigns always settle - and later display - in USD.
const USD_PER_UNIT: Record<string, number> = {
  USD: 1, NPR: 1 / 133.4, INR: 1 / 83.3, EUR: 1 / 0.92, GBP: 1 / 0.79,
};
const toUsdApprox = (amount: number, c: string) => amount * (USD_PER_UNIT[c] ?? 1);
const usdHint = (amount: number, c: string) =>
  c === "USD" ? "" : `≈ $${toUsdApprox(amount, c).toFixed(2)} USD`;

function iso(d: Date) { return d.toISOString().split("T")[0]; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDate(d: Date) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
/** Map a country name or ISO code to the canonical COUNTRIES name (for the picker + payload). */
function resolveCountryName(input?: string | null): string {
  if (!input) return "";
  const hit = COUNTRIES.find((c) => c.name.toLowerCase() === input.toLowerCase() || c.code.toLowerCase() === input.toLowerCase());
  return hit ? hit.name : input;
}
function fmtShort(d: Date) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

/* Decorative confetti pieces for the success screen (top px, left %, colour, rotation). */
const CONFETTI: { top: number; left: string; size: number; long?: boolean; bg: string; rot: string }[] = [
  { top: 4,   left: "44%", size: 9,  bg: "#f59e0b", rot: "18deg", long: true },
  { top: 16,  left: "63%", size: 8,  bg: "#7c3aed", rot: "-22deg" },
  { top: 30,  left: "24%", size: 10, bg: "#fe2c55", rot: "35deg", long: true },
  { top: 24,  left: "52%", size: 7,  bg: "#ff6ea9", rot: "0deg" },
  { top: 48,  left: "76%", size: 8,  bg: "#14b8a6", rot: "10deg", long: true },
  { top: 60,  left: "12%", size: 9,  bg: "#fbbf24", rot: "-30deg", long: true },
  { top: 82,  left: "82%", size: 8,  bg: "#22c55e", rot: "45deg" },
  { top: 104, left: "16%", size: 8,  bg: "#7c3aed", rot: "20deg" },
  { top: 116, left: "72%", size: 9,  bg: "#fe2c55", rot: "-18deg", long: true },
  { top: 132, left: "40%", size: 8,  bg: "#f59e0b", rot: "28deg" },
];

/** Debounce any value by `delay` ms - keeps the live estimate + area search off every keystroke/drag. */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ───────────────────────────── component ───────────────────────────── */

export function CreateCampaignWizard({
  visible, onClose, onCreated, initialVideo = null,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  /**
   * The post the advertiser already picked before opening the wizard - from
   * "Promote a post" on the Ads Manager. Pre-selects it everywhere a video is
   * chosen (the creative step, and the goal flows' "select videos to promote"
   * step) so the wizard never asks again for something already answered. It is
   * a starting value, not a lock: the selection can still be changed inside.
   */
  initialVideo?: Video | null;
}) {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  // Step 1 - goal
  const [goalId, setGoalId] = useState<GoalId>("views");
  // Step 2 - placements (nothing pre-selected - the advertiser must choose)
  const [placements, setPlacements] = useState<string[]>([]);
  // Step 3 - audience
  const [country, setCountry] = useState<string>("");
  const [area, setArea] = useState<{ label: string; city: string | null; region: string | null } | null>(null);
  const [geo, setGeo] = useState<GeoTarget | null>(null);
  const [age, setAge] = useState<string>("18-24");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [interests, setInterests] = useState<string[]>(["Travel"]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [relationship, setRelationship] = useState<string[]>([]);
  const [education, setEducation] = useState<string[]>([]);
  const [parental, setParental] = useState("All");
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [behaviorsSheet, setBehaviorsSheet] = useState(false);
  // Step 4 - budget & schedule
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState(1);
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [continuous, setContinuous] = useState(false);
  const [endDate, setEndDate] = useState<Date>(() => addDays(new Date(), 6));
  // Step 5 - creative
  const [video, setVideo] = useState<Video | null>(initialVideo);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [ctaType, setCtaType] = useState<CtaType>("learn_more");
  const [destUrl, setDestUrl] = useState("");
  // Step 7 - payment
  const [payTab, setPayTab] = useState("card");
  const [cardId, setCardId] = useState("visa");
  const [showCardForm, setShowCardForm] = useState(false);
  const [verifying, setVerifying] = useState(false); // brief payment verification before an ad is submitted

  // "More Followers" flow state
  const [promoteTarget, setPromoteTarget] = useState<"profile" | "videos">("profile");
  const [promotedVideos, setPromotedVideos] = useState<Video[]>(initialVideo ? [initialVideo] : []);
  const [audienceMode, setAudienceMode] = useState<"automatic" | "custom">("automatic");
  const [followPlacements, setFollowPlacements] = useState<string[]>([]);
  const [followButtonText, setFollowButtonText] = useState("Follow");
  // followDays is derived from the schedule (start/end date + continuous) below.
  // Daily vs Lifetime budget for the goal-specific flows.
  const [goalBudgetType, setGoalBudgetType] = useState<"daily" | "lifetime">("daily");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const me = useAuthStore((st) => st.user);

  // "More Video Views" flow state (shares promotedVideos / audienceMode / followDays).
  const [viewPlacements, setViewPlacements] = useState<string[]>([]);
  const [optimizationGoal, setOptimizationGoal] = useState("Video Views");
  const [playBehavior, setPlayBehavior] = useState<"auto_play" | "tap_to_play">("auto_play");
  const [sound, setSound] = useState<"on" | "off">("on");
  const [trackingParams, setTrackingParams] = useState("");
  const [optimizationSheet, setOptimizationSheet] = useState(false);

  // "Website Traffic" flow state (shares audienceMode / viewPlacements / followDays / ctaType / headline / description).
  const [destinationType, setDestinationType] = useState<"website" | "instant_page">("website");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [utmEnabled, setUtmEnabled] = useState(false);
  const [websiteCtaSheet, setWebsiteCtaSheet] = useState(false);

  // "Messages" flow state (shares audienceMode / viewPlacements / followDays).
  const [messageGreeting, setMessageGreeting] = useState(DEFAULT_GREETING);
  const [quickReplies, setQuickReplies] = useState<string[]>([...DEFAULT_QUICK_REPLIES]);
  const [actionButton, setActionButton] = useState("Send Message");
  const [actionButtonSheet, setActionButtonSheet] = useState(false);

  // "App Installs" flow state (shares audienceMode / viewPlacements / followDays / video).
  const [appSource, setAppSource] = useState("my_app");
  const [appName, setAppName] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [googlePlayUrl, setGooglePlayUrl] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["ios", "android"]);
  const [deepLink, setDeepLink] = useState("");
  const [primaryText, setPrimaryText] = useState(DEFAULT_APP_PRIMARY_TEXT);
  const [appCta, setAppCta] = useState("Install Now");
  const [appTracking, setAppTracking] = useState("Install");
  const [appCtaSheet, setAppCtaSheet] = useState(false);
  const [appTrackingSheet, setAppTrackingSheet] = useState(false);

  // "More Engagement" flow state (shares promotedVideos / audienceMode / viewPlacements / followDays).
  const [optimizeFor, setOptimizeFor] = useState("all_engagements");
  const [engagementStyle, setEngagementStyle] = useState("balanced");

  // "Sales / Conversions" flow state (shares audienceMode / viewPlacements / followDays).
  const [convLocation, setConvLocation] = useState<"website" | "app">("website");
  const [convEvent, setConvEvent] = useState("Purchase");
  const [convValueType, setConvValueType] = useState<"same" | "different" | "none">("same");
  const [convOptimizationGoal, setConvOptimizationGoal] = useState("Conversions");
  const [convBidStrategy, setConvBidStrategy] = useState("Lowest Cost");
  const [convAttribution, setConvAttribution] = useState("7-day click / 1-day view");
  const [convPaymentEvent, setConvPaymentEvent] = useState("Purchase");
  const [convEventSheet, setConvEventSheet] = useState(false);
  const [convOptSheet, setConvOptSheet] = useState(false);
  const [convBidSheet, setConvBidSheet] = useState(false);
  const [convAttrSheet, setConvAttrSheet] = useState(false);
  const [convPayEventSheet, setConvPayEventSheet] = useState(false);

  // sheets
  const [countrySheet, setCountrySheet] = useState(false);
  const [videoSheet, setVideoSheet] = useState(false);
  const [currencySheet, setCurrencySheet] = useState(false);
  const [interestSheet, setInterestSheet] = useState(false);
  const [languagesSheet, setLanguagesSheet] = useState(false);
  const [areaSheet, setAreaSheet] = useState(false);
  const [mapSheet, setMapSheet] = useState(false);
  const [startSheet, setStartSheet] = useState(false);
  const [endSheet, setEndSheet] = useState(false);

  // Reset everything when the wizard is dismissed, so it opens fresh next time.
  useEffect(() => {
    if (!visible) {
      setStep(0); setDone(false); setGoalId("views"); setPlacements([]);
      setAge("18-24"); setGender("all"); setInterests(["Travel"]); setLanguages([]); setArea(null); setGeo(null);
      setRelationship([]); setEducation([]); setParental("All"); setBehaviors([]);
      setBudgetType("daily"); setCurrency("USD"); setAmount(1);
      setStartDate(new Date()); setContinuous(false); setEndDate(addDays(new Date(), 6));
      setVideo(null); setHeadline(""); setDescription(""); setCtaType("learn_more");
      setDestUrl(""); setPayTab("card"); setCardId("visa"); setShowCardForm(false); setVerifying(false);
      setPromoteTarget("profile"); setPromotedVideos([]); setAudienceMode("automatic");
      setFollowPlacements([]); setFollowButtonText("Follow"); setAgreedTerms(false); setGoalBudgetType("daily");
      setViewPlacements([]); setOptimizationGoal("Video Views"); setPlayBehavior("auto_play"); setSound("on"); setTrackingParams("");
      setDestinationType("website"); setWebsiteUrl(""); setUtmEnabled(false);
      setMessageGreeting(DEFAULT_GREETING); setQuickReplies([...DEFAULT_QUICK_REPLIES]); setActionButton("Send Message");
      setAppSource("my_app"); setAppName(""); setAppStoreUrl(""); setGooglePlayUrl(""); setPlatforms(["ios", "android"]);
      setDeepLink(""); setPrimaryText(DEFAULT_APP_PRIMARY_TEXT); setAppCta("Install Now"); setAppTracking("Install");
      setOptimizeFor("all_engagements"); setEngagementStyle("balanced");
      setConvLocation("website"); setConvEvent("Purchase"); setConvValueType("same"); setConvOptimizationGoal("Conversions");
      setConvBidStrategy("Lowest Cost"); setConvAttribution("7-day click / 1-day view"); setConvPaymentEvent("Purchase");
    }
  }, [visible]);

  /* Carry in the post the advertiser already chose on "Promote a post".
   *
   * Applied on each OPEN rather than only at mount: the wizard stays mounted
   * between uses, so seeding it once would make the second promotion reuse the
   * first one's post. Depending on `visible` also means it never fires while
   * the wizard is open, so changing the selection inside is not clobbered. */
  useEffect(() => {
    if (!visible) return;
    setVideo(initialVideo);
    setPromotedVideos(initialVideo ? [initialVideo] : []);
  }, [visible, initialVideo]);

  // Auto-fill Location from the viewer's country (IP-based - the same detection the
  // website uses to pre-fill the signup country). Runs until a country is chosen; the
  // choice then persists across re-opens.
  const detectQ = useQuery({
    queryKey: ["detect-country"],
    queryFn: authApi.detectCountry,
    enabled: visible && !country,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (detectQ.data && !country) {
      const name = resolveCountryName(detectQ.data.countryName || detectQ.data.countryCode);
      if (name) setCountry(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectQ.data]);

  const goal = GOALS.find((g) => g.id === goalId)!;

  // The "More Video Views" and "More Followers" goals each drive their own
  // (chart-matching) step flow; every other goal keeps the generic video-ad flow.
  const isViews = goalId === "views";
  const isFollowers = goalId === "followers";
  const isWebsite = goalId === "website";
  const isMessages = goalId === "messages";
  const isInstalls = goalId === "installs";
  const isEngagement = goalId === "engagement";
  const isSales = goalId === "sales";
  const stepTitles = isViews ? VIEWS_STEP_TITLES : isFollowers ? FOLLOWER_STEP_TITLES : isWebsite ? WEBSITE_STEP_TITLES : isMessages ? MESSAGES_STEP_TITLES : isInstalls ? INSTALL_STEP_TITLES : isEngagement ? ENGAGEMENT_STEP_TITLES : isSales ? SALES_STEP_TITLES : STEP_TITLES;
  const nextLabels = isViews ? VIEWS_NEXT_LABELS : isFollowers ? FOLLOWER_NEXT_LABELS : isWebsite ? WEBSITE_NEXT_LABELS : isMessages ? MESSAGES_NEXT_LABELS : isInstalls ? INSTALL_NEXT_LABELS : isEngagement ? ENGAGEMENT_NEXT_LABELS : isSales ? SALES_NEXT_LABELS : NEXT_LABELS;

  // Published videos - used by the follower flow's "profile or videos" step and as the
  // ad's cover creative (a profile promotion still needs a video to show).
  const contentQ = useQuery({
    queryKey: ["studio-content", "promotable"],
    queryFn: () => studioApi.content({ status: "published", per_page: 50 }),
    enabled: visible,
    staleTime: 60_000,
  });
  const myVideos: Video[] = contentQ.data?.data ?? [];

  // Billing window (days). Continuous daily campaigns bill in a rolling 30-day window.
  const days = continuous ? 30 : Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  // Goal flows schedule via start/end dates (or continuous); their duration derives from it.
  const followDays = days;
  const perDay = budgetType === "daily" ? amount : Math.round(amount / days);
  const totalBudget = budgetType === "daily" ? amount * days : amount;

  // Goal-flow budget: `amount` is the per-day figure when Daily, or the whole-
  // campaign figure when Lifetime. Everything downstream works in per-day terms.
  const goalPerDay = goalBudgetType === "daily" ? amount : Math.max(1, Math.round(amount / Math.max(1, followDays)));
  const goalTotal = goalBudgetType === "daily" ? amount * followDays : amount;

  // Reelsoo coin wallet - earned/received coins can pay for ads (100 coins = $1).
  const walletQ = useQuery({ queryKey: ["studioCoinWallet"], queryFn: giftApi.wallet, enabled: visible, staleTime: 60_000 });
  const coinBalance = walletQ.data?.coin_balance ?? 0;
  const goalTotalUsd = toUsdApprox(goalTotal, currency);
  const coinsNeeded = Math.max(1, Math.round(goalTotalUsd * COINS_PER_USD));
  const enoughCoins = coinBalance >= coinsNeeded;

  // Ad preview shown on the Review & Launch step - adapts to each goal's creative.
  const previewVideo = promotedVideos[0] ?? myVideos[0] ?? video ?? null;
  const previewThumb = previewVideo?.thumbnail_url ?? me?.avatar ?? null;
  const previewName = me?.username ? `@${me.username}` : "Your Brand";
  const previewHeadline = (isMessages ? messageGreeting : isInstalls ? primaryText : headline)
    || previewVideo?.title || previewVideo?.caption || "Discover more on Teezer";
  const previewCta = isFollowers ? followButtonText : isMessages ? actionButton : isInstalls ? appCta
    : isWebsite ? ctaLabelOf(ctaType) : isSales ? convEvent : "Watch Now";

  // Per-goal result estimates are derived from the live audience estimate (see
  // the `projectResult` block below), so the numbers track real matching-account
  // reach/clicks/views - not just the budget. Defined after `estimate` loads.

  // Live estimate from real matching accounts. Debounced so dragging the budget
  // slider (or editing targeting) doesn't fire a request on every frame.
  const estimateInput = useMemo(() => ({
    country: country || undefined,
    city: area?.city || undefined,
    region: area?.region || undefined,
    age_range: age,
    gender,
    interests,
    daily_budget: Math.max(1, perDay),
    currency,
  }), [country, area, age, gender, interests, perDay, currency]);
  const debouncedEstInput = useDebounced(estimateInput, 450);
  const estimateQ = useQuery({
    queryKey: ["promo-estimate", debouncedEstInput],
    queryFn: () => promotionApi.estimate(debouncedEstInput),
    enabled: visible && step >= 2 && debouncedEstInput.daily_budget >= 1,
    staleTime: 30_000,
  });
  const estimate = estimateQ.data;

  // Real per-day ranges once the estimate loads; a heuristic keeps the tiles
  // populated on the first frame / if the request fails.
  const est = useMemo(() => ({
    reachMin: estimate?.per_day.reach.min ?? Math.round(perDay * 18),
    reachMax: estimate?.per_day.reach.max ?? Math.round(perDay * 32),
    viewsMin: estimate?.per_day.views.min ?? Math.round(perDay * 2.1),
    viewsMax: estimate?.per_day.views.max ?? Math.round(perDay * 4.5),
  }), [estimate, perDay]);

  // ── Per-goal projected results, driven by the live estimate ──
  // Per-day building blocks: the real matching-account estimate when it has
  // resolved, else a budget-based heuristic so the tiles are never empty.
  const pdClicks = { min: estimate?.per_day.clicks.min ?? Math.round(perDay * 0.9), max: estimate?.per_day.clicks.max ?? Math.round(perDay * 2.2) };
  const pdViews  = { min: estimate?.per_day.views.min  ?? Math.round(perDay * 2.1), max: estimate?.per_day.views.max  ?? Math.round(perDay * 4.5) };
  const pdReach  = { min: estimate?.per_day.reach.min  ?? Math.round(perDay * 18),  max: estimate?.per_day.reach.max  ?? Math.round(perDay * 32) };
  // Convert a per-day block at a plausible action-rate, floor it so a tiny budget
  // never reads "0", then multiply by the run length for the projected TOTAL.
  const projectResult = (base: { min: number; max: number }, loRate: number, hiRate: number, floorLo: number, floorHi: number) => {
    const perDayMin = Math.max(floorLo, Math.round(base.min * loRate));
    const perDayMax = Math.max(floorHi, Math.round(base.max * hiRate));
    return { perDayMin, perDayMax, min: perDayMin * followDays, max: perDayMax * followDays };
  };
  const followEst   = projectResult(pdClicks, 0.45, 0.70, 1, 3);   // profile visits → follows
  const viewsEst    = projectResult(pdViews,  1.0,  1.0,  40, 90);
  const visitsEst   = projectResult(pdClicks, 0.80, 1.0,  3, 8);
  const convEst     = projectResult(pdClicks, 0.10, 0.22, 1, 2);   // messages started
  const installEst  = projectResult(pdClicks, 0.35, 0.60, 2, 5);
  const engEst      = projectResult(pdReach,  0.30, 0.55, 10, 25);
  const salesEst    = projectResult(pdClicks, 0.05, 0.12, 1, 2);

  const estFollowMin = followEst.min,    estFollowMax = followEst.max;
  const estViewsMin = viewsEst.min,      estViewsMax = viewsEst.max;
  const estVisitsMin = visitsEst.min,    estVisitsMax = visitsEst.max;
  const estConvMin = convEst.min,        estConvMax = convEst.max;
  const estInstallMin = installEst.min,  estInstallMax = installEst.max;
  const estEngMin = engEst.min,          estEngMax = engEst.max;
  const estSalesConvMin = salesEst.min,  estSalesConvMax = salesEst.max;

  // Scope line so the big number is unambiguous: it is the TOTAL over the whole
  // run (the reach/views tiles are labelled "Per Day" separately). This is the
  // answer to "is the estimate per-day or for the whole campaign?".
  const estScopeNote = continuous
    ? "Projected total per 30-day billing cycle · estimates, not guaranteed."
    : `Projected total over ${followDays} ${followDays === 1 ? "day" : "days"} (${fmtDate(startDate)} – ${fmtDate(endDate)}) · estimates, not guaranteed.`;

  // Advertiser handle shown in the ad preview - taken from the destination URL's domain.
  const brandName = destUrl.match(/^(?:https?:\/\/)?(?:www\.)?([^./\s]+)/i)?.[1] || video?.title || "Your Page";

  // Addressable audience: real matching-account count, or a narrowing heuristic fallback.
  const audience = useMemo(() => {
    if (estimate) return { min: estimate.audience.min, max: estimate.audience.max };
    let max = 3_100_000;
    if (country) max *= 0.42;
    max *= 0.78; // an age band is always chosen
    if (gender !== "all") max *= 0.52;
    if (interests.length) max *= Math.max(0.32, 1 - interests.length * 0.09);
    return { min: Math.round(max * 0.74), max: Math.round(max) };
  }, [estimate, country, gender, interests]);

  const countryC = COUNTRIES.find((c) => c.name === country);
  const countryLabel = countryC ? `${countryFlag(countryC.code)}  ${countryC.name}` : "Anywhere";
  const audienceLoc = area?.label ? `${area.label}${country ? `, ${country}` : ""}` : (country || "Anywhere");

  // Automatic audience targets the viewer's own detected country (not everywhere).
  const detectedName = country || (detectQ.data ? resolveCountryName(detectQ.data.countryName || detectQ.data.countryCode) : "");
  const detectedCode = COUNTRIES.find((c) => c.name === detectedName)?.code;
  const autoLocationLabel = detectedName ? `${detectedCode ? countryFlag(detectedCode) + "  " : ""}${detectedName}` : "Your country";

  const createM = useMutation({
    mutationFn: (status: "draft" | "pending_review") => {
      // "Sales / Conversions" goal - optimise for a conversion event + tracking.
      if (isSales) {
        const anchor = myVideos[0] ?? null;
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        return promotionApi.create({
          video_id: anchor.id,
          objective: goal.objective, // more_profile_visits
          promote_target: "profile",
          conversion_settings: {
            location: convLocation,
            event: convEvent,
            value_type: convValueType,
            optimization_goal: convOptimizationGoal,
            bid_strategy: convBidStrategy,
            attribution_window: convAttribution,
            payment_event: convPaymentEvent,
          },
          display_name: me?.username ? `@${me.username}` : undefined,
          placements: viewPlacements,
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      // "More Engagement" goal - promote up to 3 videos + engagement optimisation.
      if (isEngagement) {
        const anchor = promotedVideos[0] ?? null;
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        return promotionApi.create({
          video_id: anchor.id,
          objective: "more_engagement",
          promote_target: "videos",
          promoted_video_ids: promotedVideos.map((v) => v.id),
          engagement_settings: {
            optimize_for: optimizeFor as "all_engagements" | "comments" | "shares" | "likes",
            engagement_style: engagementStyle as "balanced" | "high_engagement_users",
          },
          placements: viewPlacements,
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      // "More Video Views" goal - promote up to 3 videos + delivery/video settings.
      if (isViews) {
        const anchor = promotedVideos[0] ?? null;
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        return promotionApi.create({
          video_id: anchor.id,
          objective: "more_views",
          promote_target: "videos",
          promoted_video_ids: promotedVideos.map((v) => v.id),
          placements: viewPlacements,
          video_settings: {
            optimization_goal: optimizationGoal,
            play_behavior: playBehavior,
            sound,
            tracking_parameters: trackingParams.trim() || null,
          },
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      // "Website Traffic" goal - send people to a website (or Instant Page) + CTA.
      if (isWebsite) {
        const anchor = myVideos[0] ?? null;
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        let url = websiteUrl.trim();
        if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
        if (utmEnabled && url) {
          const sep = url.includes("?") ? "&" : "?";
          url = `${url}${sep}utm_source=teezer&utm_medium=cpc&utm_campaign=website_traffic`;
        }
        return promotionApi.create({
          video_id: anchor.id,
          objective: goal.objective, // more_profile_visits
          promote_target: "profile",
          destination_type: destinationType,
          destination_url: destinationType === "website" ? (url || undefined) : undefined,
          headline: headline.trim() || undefined,
          body: description.trim() || undefined,
          cta_type: ctaType,
          display_name: me?.username ? `@${me.username}` : undefined,
          placements: viewPlacements,
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      // "App Installs" goal - promote an app (store URLs / platforms / ad copy).
      if (isInstalls) {
        const anchor = video ?? myVideos[0] ?? null;
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        return promotionApi.create({
          video_id: anchor.id,
          objective: goal.objective, // more_profile_visits
          promote_target: "videos",
          body: primaryText.trim() || undefined,
          app_settings: {
            source: appSource as "my_app" | "app_store_url" | "google_play_url",
            app_name: appSource === "my_app" ? (appName.trim() || undefined) : undefined,
            app_store_url: appSource === "app_store_url" ? (appStoreUrl.trim() || undefined) : undefined,
            google_play_url: appSource === "google_play_url" ? (googlePlayUrl.trim() || undefined) : undefined,
            platforms,
            deep_link: deepLink.trim() || undefined,
            primary_text: primaryText.trim() || undefined,
            cta: appCta,
            tracking: appTracking,
          },
          display_name: me?.username ? `@${me.username}` : undefined,
          placements: viewPlacements,
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      // "Messages" goal - drive conversations; store greeting / quick replies / action.
      if (isMessages) {
        const anchor = myVideos[0] ?? null;
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        return promotionApi.create({
          video_id: anchor.id,
          objective: goal.objective, // more_engagement
          promote_target: "profile",
          message_settings: {
            greeting: messageGreeting.trim() || null,
            quick_replies: quickReplies.map((q) => q.trim()).filter(Boolean).slice(0, 3),
            action_button: actionButton,
          },
          display_name: me?.username ? `@${me.username}` : undefined,
          placements: viewPlacements,
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      // "More Followers" goal - its own payload (promote profile/videos + follow-card).
      if (isFollowers) {
        const anchor = promoteTarget === "profile" ? (myVideos[0] ?? null) : (promotedVideos[0] ?? null);
        if (!anchor) throw new Error("no-video");
        const custom = audienceMode === "custom";
        return promotionApi.create({
          video_id: anchor.id,
          objective: "more_followers",
          promote_target: promoteTarget,
          promoted_video_ids: promoteTarget === "videos" ? promotedVideos.map((v) => v.id) : undefined,
          follow_button_text: followButtonText,
          display_name: me?.username ? `@${me.username}` : undefined,
          placements: followPlacements,
          country: custom ? (country || undefined) : (detectedName || undefined),
          city: custom ? (area?.city || undefined) : undefined,
          region: custom ? (area?.region || undefined) : undefined,
          target_lat: custom ? geo?.lat : undefined,
          target_lng: custom ? geo?.lng : undefined,
          target_radius_km: custom ? geo?.radius_km : undefined,
          age_range: custom ? age : undefined,
          gender: custom ? gender : undefined,
          interests: custom ? interests : undefined,
          target_languages: custom && languages.length ? languages : undefined,
          demographics: custom ? {
            relationship: relationship.length ? relationship : undefined,
            education: education.length ? education : undefined,
            parental: parental !== "All" ? parental : undefined,
            behaviors: behaviors.length ? behaviors : undefined,
          } : undefined,
          daily_budget: Math.max(1, goalPerDay),
          total_budget: Math.max(1, goalTotal),
          currency,
          payment_method: GOAL_PAY_METHODS.find((m) => m.id === payTab)?.method ?? "credit_card",
          duration_days: followDays,
          start_date: iso(startDate),
          end_date: continuous ? undefined : iso(endDate),
          status,
        });
      }
      if (!video) throw new Error("no-video");
      const body: CreatePromotion = {
        video_id: video.id,
        objective: goal.objective,
        // Creative copy for the in-feed sponsored card.
        headline: headline.trim() || undefined,
        body: description.trim() || undefined,
        cta_type: ctaType,
        destination_url: destUrl.trim() || undefined,
        display_name: brandName || undefined,
        placements: placements.length ? placements : ["in_feed"],
        country: country || undefined,
        city: area?.city || undefined,
        region: area?.region || undefined,
        target_lat: geo?.lat,
        target_lng: geo?.lng,
        target_radius_km: geo?.radius_km,
        age_range: age,
        gender,
        interests,
        daily_budget: Math.max(1, perDay),
        total_budget: Math.max(1, totalBudget),
        // The currency the advertiser budgeted in - the server converts to USD.
        currency,
        duration_days: days,
        start_date: iso(startDate),
        end_date: continuous ? undefined : iso(endDate),
        payment_method: PAY_TABS.find((p) => p.id === payTab)?.method,
        status,
      };
      return promotionApi.create(body);
    },
    onSuccess: (_res, status) => {
      if (status === "draft") { Alert.alert("Draft saved", "Your campaign draft was saved."); onCreated(); return; }
      // The campaign is now IN REVIEW → auto-provision the ad account (mints the
      // unique account number on the very first campaign, like Facebook/TikTok Ads)
      // and record this launch as committed ad spend on the account.
      const isGoalFlow = isFollowers || isViews || isWebsite || isMessages || isInstalls || isEngagement || isSales;
      const amountUsd = Math.max(1, Math.round(isGoalFlow ? goalTotalUsd : toUsdApprox(totalBudget, currency)));
      try { useAdAccountStore.getState().recordCampaignLaunch({ goalLabel: goal.label, amountUsd }); } catch { /* never block the success screen */ }
      setDone(true);
    },
    onError: (e) => {
      if ((e as Error).message === "no-video") Alert.alert("Add a video", "Pick a video for your ad in the Creative step first.");
      else Alert.alert("Couldn't submit", apiErrorMessage(e, "Please try again."));
    },
  });

  // Ads never submit until "payment" is verified: a short check runs first, then
  // the promotion is created (as pending_review, so it doesn't run until approved).
  function launchGoal() { setVerifying(true); }
  useEffect(() => {
    if (!verifying) return;
    const t = setTimeout(() => { setVerifying(false); createM.mutate("pending_review"); }, 1300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifying]);

  function goNext() {
    if (isSales) {
      if (step === 4 && viewPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (isEngagement) {
      if (step === 1 && promotedVideos.length === 0) { Alert.alert("Pick a video", "Select at least one video to promote (up to 3)."); return; }
      if (step === 3 && viewPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (isInstalls) {
      if (step === 1) {
        if (appSource === "app_store_url" && !appStoreUrl.trim()) { Alert.alert("Add your App Store URL", "Paste the link to your app on the App Store."); return; }
        if (appSource === "google_play_url" && !googlePlayUrl.trim()) { Alert.alert("Add your Google Play URL", "Paste the link to your app on Google Play."); return; }
        if (appSource === "my_app" && platforms.length === 0) { Alert.alert("Pick a platform", "Choose iOS, Android, or both."); return; }
      }
      if (step === 4 && viewPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (isMessages) {
      if (step === 3 && viewPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (isWebsite) {
      if (step === 1 && destinationType === "website" && !websiteUrl.trim()) { Alert.alert("Add your website", "Enter the website URL you want to send people to."); return; }
      if (step === 4 && viewPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (isViews) {
      if (step === 1 && promotedVideos.length === 0) { Alert.alert("Pick a video", "Select at least one video to promote (up to 3)."); return; }
      if (step === 4 && viewPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (isFollowers) {
      if (step === 1 && promoteTarget === "videos" && promotedVideos.length === 0) { Alert.alert("Pick a video", "Select at least one video to promote (up to 3)."); return; }
      if (step === 1 && promoteTarget === "profile" && myVideos.length === 0) { Alert.alert("No videos yet", "Publish a video first - we use it as your ad's cover while promoting your profile."); return; }
      if (step === 3 && followPlacements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
      if (step < 6) { setStep((s) => s + 1); return; }
      if (amount < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
      if (!agreedTerms) { Alert.alert("Agree to continue", "Please accept the Terms & Conditions to launch your campaign."); return; }
      if (payTab === "coins" && !enoughCoins) { Alert.alert("Not enough coins", `You need ${coinsNeeded} Teezer coins to run this ad. Earn more, or choose another payment method.`); return; }
      launchGoal();
      return;
    }
    if (step === 1 && placements.length === 0) { Alert.alert("Pick a placement", "Choose at least one place for your ad to appear."); return; }
    if (step === 4 && !video) { Alert.alert("Add a video", "Choose a video for your ad to continue."); return; }
    if (step < 6) { setStep((s) => s + 1); return; }
    // Final step -> publish
    if (perDay < 1) { Alert.alert("Set a budget", "Your daily budget must be at least $1."); return; }
    createM.mutate("pending_review");
  }
  function goBack() { if (step === 0) onClose(); else setStep((s) => s - 1); }

  function saveDraft() {
    if (isViews || isEngagement) {
      if (promotedVideos.length === 0) { Alert.alert("Almost there", "Select at least one video to promote, then you can save a draft."); return; }
      createM.mutate("draft");
      return;
    }
    if (isWebsite || isMessages || isInstalls || isSales) {
      if (!myVideos[0]) { Alert.alert("Almost there", "Publish a video first - we use it as your ad's cover, then you can save a draft."); return; }
      createM.mutate("draft");
      return;
    }
    if (isFollowers) {
      const anchor = promoteTarget === "profile" ? (myVideos[0] ?? null) : (promotedVideos[0] ?? null);
      if (!anchor) { Alert.alert("Almost there", "You need a published video first - pick your videos or publish one, then save a draft."); return; }
      createM.mutate("draft");
      return;
    }
    if (!video) { Alert.alert("Almost there", "Pick a video in the Creative step, then you can save a draft."); return; }
    createM.mutate("draft");
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  /* ── Success screen ── */
  if (done) {
    const summaryEnd = (isViews || isFollowers || isWebsite || isMessages || isInstalls || isEngagement || isSales) ? addDays(startDate, followDays - 1) : (continuous ? addDays(startDate, days - 1) : endDate);
    const successData = isSales ? {
      thumb: myVideos[0]?.thumbnail_url ?? null,
      title: `${convEvent} · ${goal.label}`,
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: viewPlacements.slice(0, 2).map((p) => VIEW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : isEngagement ? {
      thumb: promotedVideos[0]?.thumbnail_url ?? null,
      title: promotedVideos[0]?.title || promotedVideos[0]?.caption || "Your videos",
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: viewPlacements.slice(0, 2).map((p) => ENGAGEMENT_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : isInstalls ? {
      thumb: (video ?? myVideos[0])?.thumbnail_url ?? null,
      title: appSource === "my_app" ? (appName || "Your app") : (primaryText || "Your app"),
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: viewPlacements.slice(0, 2).map((p) => VIEW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : isMessages ? {
      thumb: myVideos[0]?.thumbnail_url ?? me?.avatar ?? null,
      title: me?.username ? `@${me.username}` : "Your Brand",
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: viewPlacements.slice(0, 2).map((p) => VIEW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : isWebsite ? {
      thumb: myVideos[0]?.thumbnail_url ?? null,
      title: headline || (websiteUrl ? websiteUrl.replace(/^https?:\/\//, "") : "Your website"),
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: viewPlacements.slice(0, 2).map((p) => VIEW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : isViews ? {
      thumb: promotedVideos[0]?.thumbnail_url ?? null,
      title: promotedVideos[0]?.title || promotedVideos[0]?.caption || "Your videos",
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: viewPlacements.slice(0, 2).map((p) => VIEW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : isFollowers ? {
      thumb: (promoteTarget === "profile" ? myVideos[0]?.thumbnail_url : promotedVideos[0]?.thumbnail_url) ?? me?.avatar ?? null,
      title: promoteTarget === "profile" ? `@${me?.username || "your profile"}` : (promotedVideos[0]?.title || promotedVideos[0]?.caption || "Your videos"),
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(amount, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"}, Age ${age.replace("-", "–")}`,
      placementText: followPlacements.slice(0, 2).map((p) => FOLLOW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Continuous" : `${followDays} Days`,
    } : {
      thumb: video?.thumbnail_url ?? null,
      title: headline || video?.title || video?.caption || "Your campaign",
      dateRange: `${fmtShort(startDate)} – ${fmtShort(summaryEnd)}, ${summaryEnd.getFullYear()}`,
      budgetText: `${cur(perDay, currency)} / day`,
      goalIcon: goal.icon, goalRound: goal.id === "views", goalColor: goal.color, goalLabel: goal.label,
      audienceText: `${audienceLoc},${age.replace("-", "–")}, ${GENDERS.find((g) => g.id === gender)?.label}${interests.length ? `\n${interests.slice(0, 2).join(", ")}${interests.length > 2 ? `, +${interests.length - 2}` : ""}` : ""}`,
      placementText: placements.slice(0, 2).map((p) => PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join("\n") || "-",
      durationText: continuous ? "Run Continuously" : `${days} Days`,
    };
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCreated}>
        <SuccessView insets={insets} data={successData} onDashboard={onCreated} onAnother={() => { setDone(false); setStep(0); }} />
      </Modal>
    );
  }

  const t = stepTitles[step];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={goBack}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable hitSlop={10} onPress={goBack} style={s.topIcon}>
            {step === 0 ? <X size={22} color={colors.text} /> : <ChevronLeft size={24} color={colors.text} />}
          </Pressable>
          <View style={s.brandRow}>
            <Logo height={22} />
            <Text style={s.brandStudio}>Studio</Text>
          </View>
          {step === 0 ? (
            <Pressable hitSlop={8} onPress={saveDraft} style={s.draftsBtn}>
              <Sparkles size={13} color={colors.brand} strokeWidth={2.4} />
              <Text style={s.draftsText}>Drafts</Text>
            </Pressable>
          ) : (
            <Pressable hitSlop={10} onPress={onClose} style={s.topIcon}>
              <X size={22} color={colors.text} />
            </Pressable>
          )}
        </View>

        {/* Progress - segmented bar, filled up to the current step */}
        <View style={s.progressWrap}>
          <Text style={s.stepLabel}>{!isFollowers && step === 6 ? "Create Campaign" : `Step ${step + 1} of 7`}</Text>
          <View style={s.progressRow}>
            {stepTitles.map((_, i) => (
              <View key={i} style={[s.seg, i <= step && s.segOn]} />
            ))}
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={s.h1}>{t.title}</Text>
            <Text style={s.sub}>{t.sub}</Text>

            {/* ── Step 1: Goal ── */}
            {step === 0 && (
              <View style={{ gap: 12 }}>
                {GOALS.map((g) => {
                  const on = g.id === goalId;
                  const Icon = g.icon;
                  return (
                    <Pressable key={g.id} style={[s.goalCard, on && s.goalCardOn]} onPress={() => setGoalId(g.id)}>
                      <View style={[s.goalIcon, { backgroundColor: g.tint }]}>
                        {g.id === "views" ? (
                          <View style={s.playCircle}>
                            <Play size={15} color={colors.white} fill={colors.white} strokeWidth={0} />
                          </View>
                        ) : (
                          <Icon size={23} color={g.color} strokeWidth={2.2} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.goalTitle}>{g.label}</Text>
                        <Text style={s.goalDesc}>{g.desc}</Text>
                      </View>
                      <Radio on={on} />
                    </Pressable>
                  );
                })}
                <View style={s.goalTip}>
                  <Sparkles size={22} color={colors.brand} fill={colors.brand} strokeWidth={1.4} />
                  <Text style={s.goalTipText}>We'll optimize your ad to help you reach your goal effectively.</Text>
                </View>
              </View>
            )}

            {/* ── Step 2: Placement (video-ad flow) ── */}
            {step === 1 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
              <View style={{ gap: 12 }}>
                {PLACEMENTS.map((p) => {
                  const on = placements.includes(p.id);
                  return (
                    <Pressable key={p.id} style={[s.placeCard, on && s.placeCardOn]} onPress={() => toggle(placements, setPlacements, p.id)}>
                      <CheckBox on={on} />
                      <View style={s.placeTile}><PlaceIcon id={p.id} /></View>
                      <View style={s.placeText}>
                        <View style={s.placeTitleRow}>
                          <Text style={s.placeTitle}>{p.label}</Text>
                          {!!p.badge && <View style={s.hotBadge}><Text style={s.hotBadgeText}>{p.badge}</Text></View>}
                        </View>
                        <Text style={s.placeDesc}>{p.desc}</Text>
                      </View>
                      <View style={s.phoneWrap}><PhoneMock variant={p.variant} /></View>
                    </Pressable>
                  );
                })}
                <View style={s.infoBox}>
                  <View style={s.infoIcon}><Info size={20} color={colors.textSecondary} strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.infoTitle}>More placements = more reach</Text>
                    <Text style={s.infoDesc}>You can select multiple placements to maximize your campaign performance.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Step 3: Audience (video-ad flow) ── */}
            {step === 2 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
              <View style={{ gap: 22 }}>
                <Field label="Location">
                  <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                    <MapPin size={18} color={colors.text} strokeWidth={2} />
                    <Text style={s.locationText} numberOfLines={1}>{country || "Anywhere"}</Text>
                    <ChevronRight size={20} color={colors.textFaint} />
                  </Pressable>
                </Field>

                <Field label="Target Area (Optional)" hint="Narrow delivery to a city or area within the country.">
                  <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                    <MapPin size={18} color={colors.text} strokeWidth={2} />
                    <Text style={s.locationText} numberOfLines={1}>{area?.label || "Anywhere in country"}</Text>
                    {area
                      ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                      : <ChevronRight size={20} color={colors.textFaint} />}
                  </Pressable>
                </Field>

                <Field label="Target Location (Optional)" hint="Drop a pin on the map to reach people within a radius.">
                  <Pressable style={s.locationRow} onPress={() => setMapSheet(true)}>
                    <MapPin size={18} color={colors.text} strokeWidth={2} />
                    <Text style={s.locationText} numberOfLines={1}>
                      {geo ? `${geo.lat.toFixed(3)}, ${geo.lng.toFixed(3)}  ·  ${geo.radius_km} km` : "Choose Target Location"}
                    </Text>
                    {geo
                      ? <Pressable hitSlop={10} onPress={() => setGeo(null)}><X size={18} color={colors.textFaint} /></Pressable>
                      : <ChevronRight size={20} color={colors.textFaint} />}
                  </Pressable>
                </Field>

                <Field label="Age">
                  <View style={s.choiceRow}>
                    {AGES.map((a) => (
                      <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                        <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>

                <Field label="Gender">
                  <View style={s.choiceRow}>
                    {GENDERS.map((g) => (
                      <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                        <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>

                <Field label="Interests (Optional)" hint="Select interests that match your audience.">
                  <View style={s.pillRow}>
                    {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                      const on = interests.includes(tag);
                      return (
                        <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                          <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                        </Pressable>
                      );
                    })}
                    <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                      <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                      <Text style={s.addChipText}>Add Interest</Text>
                    </Pressable>
                  </View>
                </Field>

                <View style={s.audienceCard}>
                  <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.audienceLabel}>Audience Summary</Text>
                    <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                    <Text style={s.audiencePeople}>People</Text>
                  </View>
                  <MiniBars />
                </View>

                <View style={s.estRow2}>
                  <Info size={16} color={colors.textFaint} strokeWidth={2} />
                  <Text style={s.estText}>This is an estimate and may change.</Text>
                </View>
              </View>
            )}

            {/* ── Step 4: Budget & Schedule (video-ad flow) ── */}
            {step === 3 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
              <View style={{ gap: 22 }}>
                <Field label="Budget">
                  <View style={s.choiceRow}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, budgetType === b && s.choicePillOn]} onPress={() => setBudgetType(b)}>
                        <Text style={[s.choiceText, budgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily Budget" : "Lifetime Budget"}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput
                      style={s.amountInput}
                      value={group(amount)}
                      onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))}
                      keyboardType="number-pad"
                      placeholderTextColor={colors.textFaint}
                    />
                  </View>

                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && (
                    <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>
                  )}
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text> <Text style={s.estTitleMuted}>(Per Day)</Text></Text>
                  <View style={s.estRow}>
                    <EstTile label="Reach" value={`${formatCompact(est.reachMin)} – ${formatCompact(est.reachMax)}`} unit="People" />
                    <View style={s.estDivider} />
                    <EstTile label="Video Views" value={`${formatCompact(est.viewsMin)} – ${formatCompact(est.viewsMax)}`} unit="Views" />
                  </View>
                </View>

                <Field label="Schedule">
                  <View style={s.scheduleBox}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}>
                        <Text style={s.scheduleValText}>{fmtDate(startDate)}</Text>
                        <Calendar size={16} color={colors.textMuted} />
                      </View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}>
                          <Text style={s.scheduleValText}>{fmtDate(endDate)}</Text>
                          <Calendar size={16} color={colors.textMuted} />
                        </View>
                      </Pressable>
                    )}
                  </View>

                  <View style={[s.choiceRow, { marginTop: 12 }]}>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                  </View>

                  <View style={s.scheduleSummary}>
                    <View style={s.scheduleSummaryRow}>
                      <Text style={s.scheduleSummaryKey}>Duration</Text>
                      <Text style={s.scheduleSummaryVal}>{continuous ? "Continuous (billed every 30 days)" : `${days} ${days === 1 ? "day" : "days"}`}</Text>
                    </View>
                    <View style={s.scheduleSummaryRow}>
                      <Text style={s.scheduleSummaryKey}>{budgetType === "daily" ? "Per day" : "Daily (from lifetime)"}</Text>
                      <Text style={s.scheduleSummaryVal}>{cur(perDay, currency)}</Text>
                    </View>
                    <View style={[s.scheduleSummaryRow, s.scheduleSummaryTotal]}>
                      <Text style={s.scheduleSummaryTotalKey}>{continuous ? "Est. 30-day total" : "Total"}</Text>
                      <Text style={s.scheduleSummaryTotalVal}>{cur(totalBudget, currency)}</Text>
                    </View>
                    {currency !== "USD" && (
                      <View style={s.scheduleSummaryRow}>
                        <Text style={s.scheduleSummaryKey}>Charged in USD</Text>
                        <Text style={s.scheduleSummaryVal}>{usdHint(perDay, currency)} / day</Text>
                      </View>
                    )}
                  </View>
                </Field>

                <View style={s.tipBox}>
                  <Lightbulb size={18} color={colors.brand} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tipLabel}>TIP</Text>
                    <Text style={s.tipDesc}>Recommended budget for your audience size is {currency} {group(Math.max(SLIDER_MIN, Math.round(perDay * 0.8)))} – {group(Math.round(perDay * 1.5))} per day.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Step 5: Creative (video-ad flow) ── */}
            {step === 4 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
              <View style={{ gap: 22 }}>
                {/* Ad Creative */}
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Ad Creative</Text>
                  <Text style={s.subLabel}>Video</Text>
                  {video ? (
                    <View style={s.creativeCard}>
                      <View style={s.creativeThumbWrap}>
                        {video.thumbnail_url ? (
                          <Image source={{ uri: video.thumbnail_url }} style={s.creativeThumb} contentFit="cover" />
                        ) : <View style={[s.creativeThumb, s.thumbFallback]}><Play size={18} color={colors.textFaint} /></View>}
                        <View style={s.creativePlay}><Play size={12} color={colors.white} fill={colors.white} strokeWidth={0} /></View>
                        {!!video.duration && <View style={s.creativeDur}><Text style={s.creativeDurText}>{formatDuration(video.duration)}</Text></View>}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.creativeTop}>
                          <Text style={s.creativeName} numberOfLines={1}>{video.title || video.caption || `video_${video.id}.mp4`}</Text>
                          <Pressable hitSlop={8} onPress={() => setVideo(null)}><X size={18} color={colors.textMuted} /></Pressable>
                        </View>
                        <Text style={s.creativeMeta}>{video.duration ? formatDuration(video.duration) : "0:00"} | 9:16</Text>
                        <View style={s.creativeActions}>
                          <Pressable style={s.creativeBtn} onPress={() => setVideoSheet(true)}><Text style={s.creativeBtnText}>Replace</Text></Pressable>
                          <Pressable style={s.creativeBtn} onPress={() => setVideoSheet(true)}><Text style={s.creativeBtnText}>Edit</Text></Pressable>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Pressable style={s.creativePick} onPress={() => setVideoSheet(true)}>
                      <View style={s.creativePickIcon}><Play size={18} color={colors.brand} strokeWidth={2.4} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.optLabel}>Choose a video</Text>
                        <Text style={s.optDesc}>Pick one of your published videos to promote.</Text>
                      </View>
                      <ChevronRight size={18} color={colors.textFaint} />
                    </Pressable>
                  )}
                </View>

                {/* Thumbnail (optional) */}
                {!!video && (
                  <View style={{ gap: 10 }}>
                    <Text style={s.fieldLabel}>Thumbnail <Text style={s.optLabelGray}>(Optional)</Text></Text>
                    <View style={s.thumbRow}>
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={s.thumbTile}>
                          {video.thumbnail_url ? (
                            <Image source={{ uri: video.thumbnail_url }} style={s.thumbImg} contentFit="cover" />
                          ) : <View style={[s.thumbImg, s.thumbFallback]} />}
                        </View>
                      ))}
                      <Pressable style={s.thumbAdd} onPress={() => Alert.alert("Custom thumbnail", "Uploading a custom cover is coming soon.")}>
                        <Plus size={22} color={colors.textFaint} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Ad Details */}
                <View style={{ gap: 14 }}>
                  <Text style={s.fieldLabel}>Ad Details</Text>
                  <DetailRow label="Headline">
                    <View style={s.detailField}>
                      <TextInput style={s.detailInput} value={headline} onChangeText={(v) => setHeadline(v.slice(0, 40))} placeholder="Discover the beauty of Nepal" placeholderTextColor={colors.textFaint} />
                      <Text style={s.detailCounter}>{headline.length}/40</Text>
                    </View>
                  </DetailRow>
                  <DetailRow label="Description">
                    <View style={s.detailField}>
                      <TextInput style={s.detailInput} value={description} onChangeText={(v) => setDescription(v.slice(0, 80))} placeholder="Unforgettable journeys await you." placeholderTextColor={colors.textFaint} />
                      <Text style={s.detailCounter}>{description.length}/80</Text>
                    </View>
                  </DetailRow>
                </View>

                {/* CTA Button - icon-tile grid picker */}
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>CTA Button <Text style={s.optLabelGray}>(Optional)</Text></Text>
                  <Text style={s.ctaGridSub}>Choose a call-to-action button for your ad.</Text>
                  <View style={s.ctaGrid}>
                    {CTA_GRID.map((c) => {
                      const on = ctaType === c.value;
                      const Icon = c.icon;
                      return (
                        <Pressable key={c.value} style={[s.ctaTile, on && s.ctaTileOn]} onPress={() => setCtaType(c.value)}>
                          {on && <View style={s.ctaTileDot} />}
                          <Icon size={19} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                          <Text style={[s.ctaTileText, on && s.ctaTileTextOn]} numberOfLines={1}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {ctaType !== "none" && (
                    <>
                      <Text style={[s.subLabel, { marginTop: 4 }]}>Destination <Text style={s.optLabelGray}>(Required for this CTA)</Text></Text>
                      <View style={s.ctaDestField}>
                        <Link2 size={16} color={colors.textMuted} />
                        <TextInput style={s.ctaDestInput} value={destUrl} onChangeText={setDestUrl} placeholder="https://yourwebsite.com/offer" autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textFaint} />
                        {!!destUrl && <Pressable hitSlop={8} onPress={() => setDestUrl("")}><X size={16} color={colors.textFaint} /></Pressable>}
                      </View>
                    </>
                  )}
                </View>

                {/* Preview */}
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Preview</Text>
                  <View style={s.previewCard}>
                    {video?.thumbnail_url ? (
                      <Image source={{ uri: video.thumbnail_url }} style={s.previewThumb} contentFit="cover" />
                    ) : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{brandName.slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{brandName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      {!!headline && <Text style={s.previewHeadline} numberOfLines={1}>{headline}</Text>}
                      {ctaType !== "none" && (
                        <View style={s.previewCtaBtn}>
                          <Text style={s.previewCtaText}>{ctaLabelOf(ctaType)}</Text>
                          <ArrowRight size={14} color={colors.white} strokeWidth={2.6} />
                        </View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
              </View>
            )}

            {/* ── Step 6: Review (video-ad flow) ── */}
            {step === 5 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} round={goal.id === "views"} label="Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={LayoutGrid} tint="#ede9fe" color="#7c3aed" label="Placement" value={placements.map((p) => PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join(", ") || "None"} onEdit={() => setStep(1)} />
                <ReviewRow icon={Users} tint="#dbeafe" color="#2563eb" label="Audience" value={`${audienceLoc},${age.replace("-", "–")}, ${GENDERS.find((g) => g.id === gender)?.label}${interests.length ? `\n${interests.slice(0, 2).join(", ")}${interests.length > 2 ? `, +${interests.length - 2}` : ""}` : ""}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={Briefcase} tint="#ede9fe" color="#7c3aed" label="Budget & Schedule" value={`${cur(perDay, currency)} / day\n${continuous ? "Run Continuously" : fmtDate(endDate)}`} onEdit={() => setStep(3)} />
                <ReviewRow icon={Images} tint="#ffe4ea" color={colors.brand} label="Creative" value={headline || video?.title || video?.caption || "Not set"} onEdit={() => setStep(4)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text> <Text style={s.estTitleMuted}>(Per Day)</Text></Text>
                  <View style={s.estRow}>
                    <EstTile label="Reach" value={`${formatCompact(est.reachMin)} – ${formatCompact(est.reachMax)}`} unit="People" />
                    <View style={s.estDivider} />
                    <EstTile label="Video Views" value={`${formatCompact(est.viewsMin)} – ${formatCompact(est.viewsMax)}`} unit="Views" />
                  </View>
                </View>

                <View style={s.reviewNote}>
                  <Info size={18} color="#7c3aed" strokeWidth={2} />
                  <Text style={s.reviewNoteText}>These are estimated results and may vary.</Text>
                </View>
              </View>
            )}

            {/* ── Step 7: Payment (video-ad flow) ── */}
            {step === 6 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
              <View style={{ gap: 22 }}>
                {/* Payment method tiles */}
                <View style={{ gap: 12 }}>
                  <Text style={s.fieldLabel}>Payment Method</Text>
                  <View style={s.payGrid}>
                    {PAY_TABS.map((p) => {
                      const on = payTab === p.id;
                      return (
                        <Pressable key={p.id} style={[s.payTile, on && s.payTileOn]} onPress={() => setPayTab(p.id)}>
                          <View style={s.payTop}><PayTop id={p.id} active={on} /></View>
                          <Text style={[s.payTileLabel, on && { color: colors.brand }]} numberOfLines={2}>{p.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Saved cards */}
                <View style={{ gap: 12 }}>
                  <Text style={s.fieldLabel}>Saved Payment Methods</Text>
                  {SAVED_CARDS.map((c) => {
                    const on = cardId === c.id;
                    return (
                      <Pressable key={c.id} style={[s.savedCard, on && s.savedCardOn]} onPress={() => setCardId(c.id)}>
                        <CardBrand brand={c.brand} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.savedCardName} numberOfLines={1}>{c.brand} <Text style={s.savedDots}>••••</Text> {c.last4}</Text>
                          <Text style={s.savedCardExp}>Expires {c.exp}</Text>
                        </View>
                        {on ? <View style={s.savedCheck}><Check size={13} color={colors.white} strokeWidth={3} /></View> : <View style={s.savedRadio} />}
                      </Pressable>
                    );
                  })}
                  <Pressable style={s.addCardBtn} onPress={() => setShowCardForm((v) => !v)}>
                    <Plus size={16} color={colors.text} strokeWidth={2.4} />
                    <Text style={s.addCardText}>Add New Card</Text>
                  </Pressable>
                  {showCardForm && (
                    <View style={{ gap: 10, marginTop: 2 }}>
                      <LabeledInput label="Card Number" value="" onChange={() => {}} placeholder="1234 5678 9012 3456" counter="" keyboardType="number-pad" />
                      <View style={s.twoCol}>
                        <View style={{ flex: 1 }}><LabeledInput label="Expiry Date" value="" onChange={() => {}} placeholder="MM/YY" counter="" /></View>
                        <View style={{ flex: 1 }}><LabeledInput label="CVV" value="" onChange={() => {}} placeholder="123" counter="" keyboardType="number-pad" /></View>
                      </View>
                      <LabeledInput label="Cardholder Name" value="" onChange={() => {}} placeholder="Your name" counter="" />
                    </View>
                  )}
                </View>

                {/* Order summary */}
                <View style={s.orderCard}>
                  <Text style={s.orderTitle}>Order Summary</Text>
                  <SummaryRow icon={Play} label="Campaign Goal" value={goal.label} />
                  <SummaryRow icon={LayoutGrid} label="Placement" value={PLACEMENTS.find((x) => x.id === placements[0])?.label ?? "-"} />
                  <SummaryRow icon={Users} label="Audience" value={`${audienceLoc} • Age${age.replace("-", "–")}`} />
                  <SummaryRow icon={Calendar} label="Duration" value={`${days} Days`} />
                  <SummaryRow icon={Wallet} label="Daily Budget" value={cur(perDay, currency)} />
                  <View style={s.orderDivide} />
                  <View style={s.orderLine}><Text style={s.orderK}>Estimated Total</Text><Text style={s.orderV}>{cur(totalBudget, currency)}</Text></View>
                  <View style={s.orderLine}>
                    <View style={s.orderTaxK}><Text style={s.orderK}>Tax</Text><Info size={13} color={colors.textFaint} /></View>
                    <Text style={s.orderV}>{cur(0, currency)}</Text>
                  </View>
                  <View style={s.orderDivideBold} />
                  <View style={s.orderLine}><Text style={s.orderTotalK}>TOTAL</Text><Text style={s.orderTotalV}>{cur(totalBudget, currency)}</Text></View>
                </View>

                {/* Billing information */}
                <Pressable style={s.billingRow} onPress={() => Alert.alert("Billing Information", "Billing address, invoice details and promo codes are coming soon.")}>
                  <FileText size={20} color={colors.textSecondary} strokeWidth={1.9} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.billingTitle}>Billing Information</Text>
                    <Text style={s.billingSub}>Billing Address, Invoice Details, Promo Code</Text>
                  </View>
                  <ChevronRight size={20} color={colors.textFaint} />
                </Pressable>

                {/* Security note */}
                <View style={s.securityBox}>
                  <View style={s.securityIcon}><Lock size={16} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.securityTitle}>Your payment is encrypted and securely processed.</Text>
                    <Text style={s.securitySub}>PCI DSS Compliant</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ══════════════ "More Followers" goal - chart-matching flow ══════════════ */}

            {/* Followers Step 2: What do you want to promote? */}
            {step === 1 && isFollowers && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, promoteTarget === "profile" && s.followOptOn]} onPress={() => setPromoteTarget("profile")}>
                  <View style={s.followOptIcon}><User size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Entire Profile</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>Promote your profile to get more followers.</Text>
                  </View>
                  <Radio on={promoteTarget === "profile"} />
                </Pressable>

                <View style={s.orRow}><View style={s.orLine} /><Text style={s.orText}>OR</Text><View style={s.orLine} /></View>

                <Pressable style={[s.followOpt, promoteTarget === "videos" && s.followOptOn]} onPress={() => setPromoteTarget("videos")}>
                  <View style={s.followOptIcon}><Images size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Select up to 3 videos</Text>
                    <Text style={s.followOptDesc}>Promote specific videos to attract more followers.</Text>
                  </View>
                  <Radio on={promoteTarget === "videos"} />
                </Pressable>

                {promoteTarget === "videos" && (
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {contentQ.isLoading ? (
                      <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} />
                    ) : myVideos.length === 0 ? (
                      <Text style={s.followEmptyNote}>You have no published videos to promote yet.</Text>
                    ) : myVideos.map((v) => {
                      const on = promotedVideos.some((x) => x.id === v.id);
                      return (
                        <Pressable key={v.id} style={[s.vidRow, on && s.vidRowOn]} onPress={() =>
                          setPromotedVideos((prev) => on ? prev.filter((x) => x.id !== v.id) : (prev.length >= 3 ? prev : [...prev, v]))
                        }>
                          {v.thumbnail_url ? <Image source={{ uri: v.thumbnail_url }} style={s.vidThumb} contentFit="cover" /> : <View style={[s.vidThumb, s.thumbFallback]}><Play size={16} color={colors.textFaint} /></View>}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.vidTitle} numberOfLines={1}>{v.title || v.caption || `Video #${v.id}`}</Text>
                            <Text style={s.vidMeta}>{formatCompact(v.views_count ?? 0)} views · {v.duration ? formatDuration(v.duration) : "0:00"}</Text>
                          </View>
                          <CheckBox on={on} />
                        </Pressable>
                      );
                    })}
                    {myVideos.length > 0 && <Text style={s.followEmptyNote}>{promotedVideos.length}/3 selected</Text>}
                  </View>
                )}
              </View>
            )}

            {/* Followers Step 3: Who do you want to reach? */}
            {step === 2 && isFollowers && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your profile to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Followers Step 4: Where should your ad appear? */}
            {step === 3 && isFollowers && (
              <View style={{ gap: 12 }}>
                {FOLLOW_PLACEMENTS.map((p) => {
                  const on = followPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(followPlacements, setFollowPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
                <View style={s.infoBox}>
                  <View style={s.infoIcon}><Info size={20} color={colors.textSecondary} strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.infoTitle}>These placements help you get discovered</Text>
                    <Text style={s.infoDesc}>Choosing more placements helps your profile reach people who are likely to follow you.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Followers Step 5: Budget & Duration */}
            {step === 4 && isFollowers && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Followers</Text></Text>
                  <Text style={s.estFollowValue}>+{formatCompact(estFollowMin)} - +{formatCompact(estFollowMax)}</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Followers Step 6: How your promotion will look (follow card) */}
            {step === 5 && isFollowers && (
              <View style={{ gap: 20 }}>
                <View style={s.followCard}>
                  <Avatar uri={me?.avatar} style={s.followCardAvatar} />
                  <View style={s.followCardNameRow}>
                    <Text style={s.followCardName}>@{me?.username || "yourprofile"}</Text>
                    {me?.is_verified && <CheckCircle2 size={15} color="#3b82f6" fill="#3b82f6" />}
                  </View>
                  <Text style={s.followCardStat}>{formatCompact(me?.profile?.total_followers ?? 0)} Followers</Text>
                  <Text style={s.followCardCat}>Creator • Entertainment</Text>
                  <View style={s.followCardBtn}><Text style={s.followCardBtnText}>{followButtonText}</Text></View>
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Follow Button Text</Text>
                  <View style={s.followTextGrid}>
                    {FOLLOW_BTN_TEXTS.map((txt) => {
                      const on = followButtonText === txt;
                      return (
                        <Pressable key={txt} style={[s.followTextTile, on && s.followTextTileOn]} onPress={() => setFollowButtonText(txt)}>
                          <Text style={[s.followTextTileText, on && s.followTextTileTextOn]}>{txt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {/* Followers Step 7: Review & Launch */}
            {step === 6 && isFollowers && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={User} tint="#dbeafe" color="#2563eb" label="Promotion" value={promoteTarget === "profile" ? "Entire Profile" : `${promotedVideos.length} video${promotedVideos.length === 1 ? "" : "s"}`} onEdit={() => setStep(1)} />
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placement" value={followPlacements.map((p) => FOLLOW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join(", ") || "None"} onEdit={() => setStep(3)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(4)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(4)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Followers</Text></Text>
                  <Text style={s.estFollowValue}>+{formatCompact(estFollowMin)} - +{formatCompact(estFollowMax)}</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}

            {/* ══════════════ "More Video Views" goal - chart-matching flow ══════════════ */}

            {/* Views Step 2: Select videos to promote */}
            {step === 1 && isViews && (
              <View style={{ gap: 12 }}>
                <View style={s.selCountRow}>
                  <Text style={s.selCountLabel}>Selected</Text>
                  <Text style={s.selCountVal}>{promotedVideos.length}/3</Text>
                </View>
                {contentQ.isLoading ? (
                  <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} />
                ) : myVideos.length === 0 ? (
                  <Text style={s.followEmptyNote}>You have no published videos to promote yet.</Text>
                ) : myVideos.map((v) => {
                  const on = promotedVideos.some((x) => x.id === v.id);
                  return (
                    <Pressable key={v.id} style={[s.vidRow, on && s.vidRowOn]} onPress={() =>
                      setPromotedVideos((prev) => on ? prev.filter((x) => x.id !== v.id) : (prev.length >= 3 ? prev : [...prev, v]))
                    }>
                      {v.thumbnail_url ? <Image source={{ uri: v.thumbnail_url }} style={s.vidThumb} contentFit="cover" /> : <View style={[s.vidThumb, s.thumbFallback]}><Play size={16} color={colors.textFaint} /></View>}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.vidTitle} numberOfLines={1}>{v.title || v.caption || `Video #${v.id}`}</Text>
                        <Text style={s.vidMeta}>{formatCompact(v.views_count ?? 0)} views · {v.duration ? formatDuration(v.duration) : "0:00"}</Text>
                      </View>
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Views Step 3: Who do you want to reach? (same as followers audience) */}
            {step === 2 && isViews && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your video to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Views Step 4: Budget & Duration (Estimated Views) */}
            {step === 3 && isViews && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estViewsMin)} – {formatCompact(estViewsMax)}</Text>
                  <Text style={s.estViewsUnit}>Views</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Views Step 5: Where should your ad appear? */}
            {step === 4 && isViews && (
              <View style={{ gap: 12 }}>
                {VIEW_PLACEMENTS.map((p) => {
                  const on = viewPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(viewPlacements, setViewPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Views Step 6: Video Settings */}
            {step === 5 && isViews && (
              <View style={{ gap: 22 }}>
                <Field label="Optimization Goal">
                  <Pressable style={s.vsDropdown} onPress={() => setOptimizationSheet(true)}>
                    <Text style={s.vsDropdownText}>{optimizationGoal}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </Field>

                <Field label="Play Behavior">
                  <View style={{ gap: 10 }}>
                    <Pressable style={[s.followOpt, playBehavior === "auto_play" && s.followOptOn]} onPress={() => setPlayBehavior("auto_play")}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.followOptTitle}>Auto-play</Text>
                        <Text style={s.followOptDesc}>Video plays automatically</Text>
                      </View>
                      <Radio on={playBehavior === "auto_play"} />
                    </Pressable>
                    <Pressable style={[s.followOpt, playBehavior === "tap_to_play" && s.followOptOn]} onPress={() => setPlayBehavior("tap_to_play")}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.followOptTitle}>Tap to play</Text>
                        <Text style={s.followOptDesc}>Video plays when tapped</Text>
                      </View>
                      <Radio on={playBehavior === "tap_to_play"} />
                    </Pressable>
                  </View>
                </Field>

                <Field label="Sound">
                  <View style={s.choiceRow}>
                    {(["on", "off"] as const).map((sv) => (
                      <Pressable key={sv} style={[s.choicePill, s.choicePillTall, sound === sv && s.choicePillOn]} onPress={() => setSound(sv)}>
                        <Text style={[s.choiceText, sound === sv && s.choiceTextOn]}>{sv === "on" ? "Sound On" : "Sound Off"}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Field>

                <Field label="Advanced (Optional)" hint="Add UTM / tracking parameters to your destination link.">
                  <View style={s.ctaDestField}>
                    <Link2 size={16} color={colors.textMuted} />
                    <TextInput style={s.ctaDestInput} value={trackingParams} onChangeText={setTrackingParams} placeholder="utm_source=teezer&utm_medium=ad" autoCapitalize="none" placeholderTextColor={colors.textFaint} />
                    {!!trackingParams && <Pressable hitSlop={8} onPress={() => setTrackingParams("")}><X size={16} color={colors.textFaint} /></Pressable>}
                  </View>
                </Field>
              </View>
            )}

            {/* Views Step 7: Review & Launch */}
            {step === 6 && isViews && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} round={goal.id === "views"} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={Images} tint="#dbeafe" color="#2563eb" label="Promotion" value={`${promotedVideos.length} Video${promotedVideos.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(1)} />
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placements" value={viewPlacements.map((p) => VIEW_PLACEMENTS.find((x) => x.id === p)?.label).filter(Boolean).join(", ") || "None"} onEdit={() => setStep(4)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(3)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(3)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Views</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estViewsMin)} – {formatCompact(estViewsMax)}</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}

            {/* ══════════════ "Website Traffic" goal - chart-matching flow ══════════════ */}

            {/* Website Step 2: Where do you want to send people? */}
            {step === 1 && isWebsite && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, destinationType === "website" && s.followOptOn]} onPress={() => setDestinationType("website")}>
                  <View style={s.followOptIcon}><Globe size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Website</Text>
                    <Text style={s.followOptDesc}>Drive people to your website.</Text>
                  </View>
                  <Radio on={destinationType === "website"} />
                </Pressable>
                <Pressable style={[s.followOpt, destinationType === "instant_page" && s.followOptOn]} onPress={() => setDestinationType("instant_page")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Instant Page</Text>
                    <Text style={s.followOptDesc}>Use a Teezer Instant Page to promote your content.</Text>
                  </View>
                  <Radio on={destinationType === "instant_page"} />
                </Pressable>

                {destinationType === "website" ? (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <Text style={s.fieldLabel}>Website URL</Text>
                    <View style={s.ctaDestField}>
                      <Link2 size={16} color={colors.textMuted} />
                      <TextInput style={s.ctaDestInput} value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="https://yourwebsite.com" autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textFaint} />
                      {!!websiteUrl && <Pressable hitSlop={8} onPress={() => setWebsiteUrl("")}><X size={16} color={colors.textFaint} /></Pressable>}
                    </View>
                    {!!websiteUrl.trim() && (
                      <Pressable onPress={() => { let u = websiteUrl.trim(); if (!/^https?:\/\//i.test(u)) u = `https://${u}`; Linking.openURL(u).catch(() => {}); }}>
                        <Text style={s.previewLink}>Preview Website ↗</Text>
                      </Pressable>
                    )}
                    <View style={s.utmRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.utmLabel}>UTM Parameters <Text style={s.optLabelGray}>(Optional)</Text></Text>
                        <Text style={s.utmDesc}>Append tracking parameters to your link.</Text>
                      </View>
                      <Switch value={utmEnabled} onValueChange={setUtmEnabled} trackColor={{ false: "#e5e7eb", true: colors.brand }} thumbColor="#ffffff" ios_backgroundColor="#e5e7eb" />
                    </View>
                  </View>
                ) : (
                  <View style={s.infoBox}>
                    <View style={s.infoIcon}><Info size={20} color={colors.textSecondary} strokeWidth={2} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.infoTitle}>Teezer Instant Page</Text>
                      <Text style={s.infoDesc}>We'll host a fast-loading page for your ad. The full Instant Page builder is coming soon.</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Website Step 3: Who do you want to reach? */}
            {step === 2 && isWebsite && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your ad to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Website Step 4: Budget & Duration (Estimated Website Visits) */}
            {step === 3 && isWebsite && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estVisitsMin)} – {formatCompact(estVisitsMax)}</Text>
                  <Text style={s.estViewsUnit}>Website Visits</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Website Step 5: Where should your ad appear? */}
            {step === 4 && isWebsite && (
              <View style={{ gap: 12 }}>
                {VIEW_PLACEMENTS.map((p) => {
                  const on = viewPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(viewPlacements, setViewPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Website Step 6: Website & Call-to-Action */}
            {step === 5 && isWebsite && (
              <View style={{ gap: 22 }}>
                <Field label="Call-to-Action Button">
                  <Pressable style={s.vsDropdown} onPress={() => setWebsiteCtaSheet(true)}>
                    <Text style={s.vsDropdownText}>{ctaLabelOf(ctaType)}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </Field>

                {/* Sponsored preview */}
                <View style={s.webPreviewCard}>
                  {myVideos[0]?.thumbnail_url ? <Image source={{ uri: myVideos[0].thumbnail_url }} style={s.webPreviewImg} contentFit="cover" /> : <View style={[s.webPreviewImg, s.thumbFallback]}><Globe size={24} color={colors.textFaint} /></View>}
                  <View style={s.webPreviewBadge}><Text style={s.webPreviewBadgeText}>Sponsored</Text></View>
                  <View style={s.webPreviewBody}>
                    <Text style={s.webPreviewHeadline} numberOfLines={2}>{headline || "Your headline appears here"}</Text>
                    {!!websiteUrl.trim() && <Text style={s.webPreviewUrl} numberOfLines={1}>{websiteUrl.trim().replace(/^https?:\/\//, "")}</Text>}
                    {ctaType !== "none" && <View style={s.webPreviewCta}><Text style={s.webPreviewCtaText}>{ctaLabelOf(ctaType)}</Text></View>}
                  </View>
                </View>

                <View style={{ gap: 14 }}>
                  <DetailRow label="Headline">
                    <View style={s.detailField}>
                      <TextInput style={s.detailInput} value={headline} onChangeText={(v) => setHeadline(v.slice(0, 40))} placeholder="Premium Furniture Collection" placeholderTextColor={colors.textFaint} />
                      <Text style={s.detailCounter}>{headline.length}/40</Text>
                    </View>
                  </DetailRow>
                  <DetailRow label="Description">
                    <View style={s.detailField}>
                      <TextInput style={s.detailInput} value={description} onChangeText={(v) => setDescription(v.slice(0, 80))} placeholder="Discover our exclusive collection and shop now!" placeholderTextColor={colors.textFaint} />
                      <Text style={s.detailCounter}>{description.length}/80</Text>
                    </View>
                  </DetailRow>
                </View>
              </View>
            )}

            {/* Website Step 7: Review & Launch */}
            {step === 6 && isWebsite && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={Globe} tint="#dbeafe" color="#2563eb" label="Destination" value={destinationType === "website" ? "Website" : "Instant Page"} onEdit={() => setStep(1)} />
                {destinationType === "website" && !!websiteUrl.trim() && (
                  <ReviewRow icon={Link2} tint="#e0f2fe" color="#0284c7" label="Website URL" value={websiteUrl.trim().replace(/^https?:\/\//, "")} onEdit={() => setStep(1)} />
                )}
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placements" value={`${viewPlacements.length} Placement${viewPlacements.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(4)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(3)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(3)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estVisitsMin)} – {formatCompact(estVisitsMax)}</Text>
                  <Text style={s.estViewsUnit}>Visits</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}

            {/* ══════════════ "Messages" goal - chart-matching flow ══════════════ */}

            {/* Messages Step 2: Who do you want to reach? */}
            {step === 1 && isMessages && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your ad to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Messages Step 3: How much do you want to spend? */}
            {step === 2 && isMessages && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Conversations</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estConvMin)} – {formatCompact(estConvMax)}</Text>
                  <Text style={s.estViewsUnit}>Conversations</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Messages Step 4: Where should your ad appear? */}
            {step === 3 && isMessages && (
              <View style={{ gap: 12 }}>
                {VIEW_PLACEMENTS.map((p) => {
                  const on = viewPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(viewPlacements, setViewPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Messages Step 5: Message Setup */}
            {step === 4 && isMessages && (
              <View style={{ gap: 22 }}>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Message Greeting</Text>
                  <View style={s.msgGreetingBox}>
                    <TextInput style={s.msgGreetingInput} value={messageGreeting} onChangeText={(v) => setMessageGreeting(v.slice(0, 80))} placeholder="Hi! Thanks for your interest. How can we help you today?" placeholderTextColor={colors.textFaint} multiline />
                    <Text style={s.msgGreetingCounter}>{messageGreeting.length}/80</Text>
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Quick Reply Buttons <Text style={s.optLabelGray}>(Optional)</Text></Text>
                  <Text style={s.msgHint}>Add up to 3 quick reply buttons</Text>
                  {quickReplies.map((qr, i) => (
                    <View key={i} style={s.quickReplyRow}>
                      <TextInput style={s.quickReplyInput} value={qr} onChangeText={(v) => setQuickReplies((prev) => prev.map((x, xi) => (xi === i ? v.slice(0, 40) : x)))} placeholder="Quick reply" placeholderTextColor={colors.textFaint} />
                      <Pressable hitSlop={8} onPress={() => setQuickReplies((prev) => prev.filter((_, xi) => xi !== i))}><X size={16} color={colors.textFaint} /></Pressable>
                    </View>
                  ))}
                  {quickReplies.length < 3 && (
                    <Pressable style={s.addQuickReply} onPress={() => setQuickReplies((prev) => [...prev, ""])}>
                      <Plus size={15} color={colors.brand} strokeWidth={2.6} />
                      <Text style={s.addQuickReplyText}>Add quick reply</Text>
                    </Pressable>
                  )}
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Action Button</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setActionButtonSheet(true)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <MessageCircle size={17} color={colors.brand} />
                      <Text style={s.vsDropdownText}>{actionButton}</Text>
                    </View>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                  <View style={s.msgActionNote}>
                    <MessageCircle size={16} color={colors.brand} />
                    <Text style={s.msgActionNoteText}>Your ad will show a {actionButton} button.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Messages Step 6: Preview */}
            {step === 5 && isMessages && (
              <View style={{ gap: 20 }}>
                <View style={s.webPreviewCard}>
                  <View style={s.msgPreviewHead}>
                    <View style={s.msgPreviewAvatarWrap}>
                      {me?.avatar ? <Image source={{ uri: me.avatar }} style={s.msgPreviewAvatar} contentFit="cover" /> : <MessageCircle size={16} color={colors.white} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.msgPreviewBrand} numberOfLines={1}>{me?.username ? `@${me.username}` : "Your Brand"}</Text>
                      <Text style={s.msgPreviewSponsored}>Sponsored</Text>
                    </View>
                    <MoreVertical size={16} color={colors.textMuted} />
                  </View>
                  {myVideos[0]?.thumbnail_url ? <Image source={{ uri: myVideos[0].thumbnail_url }} style={s.webPreviewImg} contentFit="cover" /> : <View style={[s.webPreviewImg, s.thumbFallback]}><MessageCircle size={24} color={colors.textFaint} /></View>}
                  <View style={s.webPreviewBody}>
                    <Text style={s.webPreviewHeadline} numberOfLines={3}>{messageGreeting || "Quality products. Great service. We are here to help you."}</Text>
                    <View style={s.webPreviewCta}><MessageCircle size={16} color={colors.white} /><Text style={s.webPreviewCtaText}>{actionButton}</Text></View>
                  </View>
                </View>

                <View style={s.shownInCard}>
                  <Text style={s.shownInLabel}>Ad will be shown in</Text>
                  {viewPlacements.length === 0 ? (
                    <Text style={s.msgHint}>No placements selected yet.</Text>
                  ) : viewPlacements.map((p) => (
                    <View key={p} style={s.shownInRow}>
                      <View style={s.shownInDot} />
                      <Text style={s.shownInText}>{VIEW_PLACEMENTS.find((x) => x.id === p)?.label ?? p}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Messages Step 7: Review & Launch */}
            {step === 6 && isMessages && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(1)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(2)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(2)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placements" value={`${viewPlacements.length} Placement${viewPlacements.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(3)} />
                <ReviewRow icon={MessageCircle} tint="#dbeafe" color="#2563eb" label="Message Greeting" value={messageGreeting || "-"} onEdit={() => setStep(4)} />
                <ReviewRow icon={MessageSquare} tint="#e0e7ff" color="#4f46e5" label="Action Button" value={actionButton} onEdit={() => setStep(4)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Conversations</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estConvMin)} – {formatCompact(estConvMax)}</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}

            {/* ══════════════ "App Installs" goal - chart-matching flow ══════════════ */}

            {/* Installs Step 2: Select your app */}
            {step === 1 && isInstalls && (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>App Source</Text>
                  {APP_SOURCES.map((src) => {
                    const on = appSource === src.id;
                    const Icon = src.icon;
                    return (
                      <Pressable key={src.id} style={[s.followOpt, on && s.followOptOn]} onPress={() => setAppSource(src.id)}>
                        <View style={s.followOptIcon}><Icon size={19} color={colors.brand} strokeWidth={2.2} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.followOptTitle}>{src.label}</Text>
                          <Text style={s.followOptDesc}>{src.desc}</Text>
                        </View>
                        <Radio on={on} />
                      </Pressable>
                    );
                  })}
                </View>

                {appSource === "my_app" ? (
                  <>
                    <View style={{ gap: 10 }}>
                      <Text style={s.fieldLabel}>App Name</Text>
                      <View style={s.ctaDestField}>
                        <TextInput style={s.ctaDestInput} value={appName} onChangeText={setAppName} placeholder="Your app name" placeholderTextColor={colors.textFaint} />
                      </View>
                    </View>
                    <View style={{ gap: 10 }}>
                      <Text style={s.fieldLabel}>App Store</Text>
                      {PLATFORM_OPTS.map((pl) => {
                        const on = platforms.includes(pl.id);
                        const Icon = pl.icon;
                        return (
                          <Pressable key={pl.id} style={[s.vidRow, on && s.vidRowOn]} onPress={() => toggle(platforms, setPlatforms, pl.id)}>
                            <Icon size={18} color={on ? colors.brand : colors.textSecondary} />
                            <Text style={[s.platformLabel, on && { color: colors.brand }]}>{pl.label}</Text>
                            <View style={{ flex: 1 }} />
                            <CheckBox on={on} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : appSource === "app_store_url" ? (
                  <View style={{ gap: 10 }}>
                    <Text style={s.fieldLabel}>App Store URL</Text>
                    <View style={s.ctaDestField}>
                      <Link2 size={16} color={colors.textMuted} />
                      <TextInput style={s.ctaDestInput} value={appStoreUrl} onChangeText={setAppStoreUrl} placeholder="https://apps.apple.com/..." autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textFaint} />
                    </View>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text style={s.fieldLabel}>Google Play URL</Text>
                    <View style={s.ctaDestField}>
                      <Link2 size={16} color={colors.textMuted} />
                      <TextInput style={s.ctaDestInput} value={googlePlayUrl} onChangeText={setGooglePlayUrl} placeholder="https://play.google.com/..." autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textFaint} />
                    </View>
                  </View>
                )}

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Deep Link <Text style={s.optLabelGray}>(Optional)</Text></Text>
                  <View style={s.ctaDestField}>
                    <Link2 size={16} color={colors.textMuted} />
                    <TextInput style={s.ctaDestInput} value={deepLink} onChangeText={setDeepLink} placeholder="https://yourapp.com/page" autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Text style={s.msgHint}>Send users to a specific page in your app.</Text>
                </View>
              </View>
            )}

            {/* Installs Step 3: Who do you want to reach? */}
            {step === 2 && isInstalls && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your ad to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Installs Step 4: Budget & Duration (Estimated App Installs) */}
            {step === 3 && isInstalls && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estInstallMin)} – {formatCompact(estInstallMax)}</Text>
                  <Text style={s.estViewsUnit}>App Installs</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Installs Step 5: Where should your ad appear? */}
            {step === 4 && isInstalls && (
              <View style={{ gap: 12 }}>
                {VIEW_PLACEMENTS.map((p) => {
                  const on = viewPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(viewPlacements, setViewPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Installs Step 6: Ad Setup */}
            {step === 5 && isInstalls && (
              <View style={{ gap: 22 }}>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Ad Creative</Text>
                  <View style={s.webPreviewCard}>
                    {(video ?? myVideos[0])?.thumbnail_url ? <Image source={{ uri: (video ?? myVideos[0])!.thumbnail_url! }} style={s.webPreviewImg} contentFit="cover" /> : <View style={[s.webPreviewImg, s.thumbFallback]}><Play size={24} color={colors.textFaint} /></View>}
                  </View>
                  <Pressable style={s.changeCreativeBtn} onPress={() => setVideoSheet(true)}>
                    <Text style={s.changeCreativeText}>Change</Text>
                  </Pressable>
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Primary Text</Text>
                  <View style={s.msgGreetingBox}>
                    <TextInput style={s.msgGreetingInput} value={primaryText} onChangeText={(v) => setPrimaryText(v.slice(0, 100))} placeholder="Create, share and watch amazing short videos. Download now!" placeholderTextColor={colors.textFaint} multiline />
                    <Text style={s.msgGreetingCounter}>{primaryText.length}/100</Text>
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Call to Action</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setAppCtaSheet(true)}>
                    <Text style={s.vsDropdownText}>{appCta}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Tracking</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setAppTrackingSheet(true)}>
                    <View>
                      <Text style={s.vsDropdownCaption}>App Event</Text>
                      <Text style={s.vsDropdownText}>{appTracking}</Text>
                    </View>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Installs Step 7: Review & Launch */}
            {step === 6 && isInstalls && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={Download} tint="#dbeafe" color="#2563eb" label="App" value={appSource === "my_app" ? `${appName || "Your app"} (${platforms.map((p) => (p === "ios" ? "iOS" : "Android")).join(", ") || "-"})` : (appSource === "app_store_url" ? "App Store" : "Google Play")} onEdit={() => setStep(1)} />
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(3)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(3)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placements" value={`${viewPlacements.length} Placement${viewPlacements.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(4)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estInstallMin)} – {formatCompact(estInstallMax)}</Text>
                  <Text style={s.estViewsUnit}>Installs</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}

            {/* ══════════════ "More Engagement" goal - chart-matching flow ══════════════ */}

            {/* Engagement Step 2: Select videos to promote */}
            {step === 1 && isEngagement && (
              <View style={{ gap: 12 }}>
                <View style={s.selCountRow}>
                  <Text style={s.selCountLabel}>Selected</Text>
                  <Text style={s.selCountVal}>{promotedVideos.length}/3</Text>
                </View>
                {contentQ.isLoading ? (
                  <ActivityIndicator color={colors.brand} style={{ marginTop: 12 }} />
                ) : myVideos.length === 0 ? (
                  <Text style={s.followEmptyNote}>You have no published videos to promote yet.</Text>
                ) : myVideos.map((v) => {
                  const on = promotedVideos.some((x) => x.id === v.id);
                  return (
                    <Pressable key={v.id} style={[s.vidRow, on && s.vidRowOn]} onPress={() =>
                      setPromotedVideos((prev) => on ? prev.filter((x) => x.id !== v.id) : (prev.length >= 3 ? prev : [...prev, v]))
                    }>
                      {v.thumbnail_url ? <Image source={{ uri: v.thumbnail_url }} style={s.vidThumb} contentFit="cover" /> : <View style={[s.vidThumb, s.thumbFallback]}><Play size={16} color={colors.textFaint} /></View>}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.vidTitle} numberOfLines={1}>{v.title || v.caption || `Video #${v.id}`}</Text>
                        <Text style={s.vidMeta}>{formatCompact(v.views_count ?? 0)} views · {v.duration ? formatDuration(v.duration) : "0:00"}</Text>
                      </View>
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Engagement Step 3: Who do you want to reach? */}
            {step === 2 && isEngagement && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your content to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Engagement Step 4: Where should your ad appear? */}
            {step === 3 && isEngagement && (
              <View style={{ gap: 12 }}>
                {ENGAGEMENT_PLACEMENTS.map((p) => {
                  const on = viewPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(viewPlacements, setViewPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Engagement Step 5: Budget & Duration (Estimated Engagements) */}
            {step === 4 && isEngagement && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Engagements</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estEngMin)} – {formatCompact(estEngMax)}</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Engagement Step 6: Engagement Goal Settings */}
            {step === 5 && isEngagement && (
              <View style={{ gap: 22 }}>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Optimize For</Text>
                  {OPTIMIZE_FOR_OPTIONS.map((o, i) => {
                    const on = optimizeFor === o.id;
                    const Icon = o.icon;
                    return (
                      <Pressable key={o.id} style={[s.followOpt, on && s.followOptOn]} onPress={() => setOptimizeFor(o.id)}>
                        <View style={s.followOptIcon}><Icon size={19} color={colors.brand} strokeWidth={2.2} /></View>
                        <View style={{ flex: 1 }}>
                          <View style={s.followOptTitleRow}>
                            <Text style={s.followOptTitle}>{o.label}</Text>
                            {i === 0 && <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>}
                          </View>
                          <Text style={s.followOptDesc}>{o.desc}</Text>
                        </View>
                        <Radio on={on} />
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Engagement Style</Text>
                  {ENGAGEMENT_STYLES.map((o, i) => {
                    const on = engagementStyle === o.id;
                    const Icon = o.icon;
                    return (
                      <Pressable key={o.id} style={[s.followOpt, on && s.followOptOn]} onPress={() => setEngagementStyle(o.id)}>
                        <View style={s.followOptIcon}><Icon size={19} color={colors.brand} strokeWidth={2.2} /></View>
                        <View style={{ flex: 1 }}>
                          <View style={s.followOptTitleRow}>
                            <Text style={s.followOptTitle}>{o.label}</Text>
                            {i === 0 && <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>}
                          </View>
                          <Text style={s.followOptDesc}>{o.desc}</Text>
                        </View>
                        <Radio on={on} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Engagement Step 7: Review & Launch */}
            {step === 6 && isEngagement && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={Images} tint="#dbeafe" color="#2563eb" label="Promotion Videos" value={`${promotedVideos.length} Video${promotedVideos.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(1)} />
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placements" value={`${viewPlacements.length} Placement${viewPlacements.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(3)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(4)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(4)} />
                <ReviewRow icon={Heart} tint="#ffe4ea" color={colors.brand} label="Optimize For" value={OPTIMIZE_FOR_OPTIONS.find((o) => o.id === optimizeFor)?.label ?? "-"} onEdit={() => setStep(5)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Engagements</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estEngMin)} – {formatCompact(estEngMax)}</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}

            {/* ══════════════ "Sales / Conversions" goal - chart-matching flow ══════════════ */}

            {/* Sales Step 2: What conversion do you want? */}
            {step === 1 && isSales && (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Conversion Location</Text>
                  <Pressable style={[s.followOpt, convLocation === "website" && s.followOptOn]} onPress={() => setConvLocation("website")}>
                    <View style={s.followOptIcon}><Globe size={19} color={colors.brand} strokeWidth={2.2} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={s.followOptTitleRow}><Text style={s.followOptTitle}>Website</Text><View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View></View>
                      <Text style={s.followOptDesc}>Drive sales or actions on your website.</Text>
                    </View>
                    <Radio on={convLocation === "website"} />
                  </Pressable>
                  <Pressable style={[s.followOpt, convLocation === "app" && s.followOptOn]} onPress={() => setConvLocation("app")}>
                    <View style={s.followOptIcon}><Download size={19} color={colors.brand} strokeWidth={2.2} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.followOptTitle}>App</Text>
                      <Text style={s.followOptDesc}>Drive actions in your app.</Text>
                    </View>
                    <Radio on={convLocation === "app"} />
                  </Pressable>
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Conversion Event</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setConvEventSheet(true)}>
                    <View>
                      <Text style={s.vsDropdownText}>{convEvent}</Text>
                      <Text style={s.vsDropdownCaption}>{CONV_EVENT_DESC[convEvent] ?? "Choose the action to optimize for"}</Text>
                    </View>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={s.fieldLabel}>Value <Text style={s.optLabelGray}>(Optional)</Text></Text>
                  {([["same", "Use the same value for each conversion"], ["different", "Use different values for conversions"], ["none", "Don't use a value"]] as const).map(([id, label]) => (
                    <Pressable key={id} style={s.radioListRow} onPress={() => setConvValueType(id)}>
                      <Radio on={convValueType === id} />
                      <Text style={s.radioListText}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Pixel / Event Source</Text>
                  <View style={s.pixelRow}>
                    <Text style={s.pixelName}>Teezer Pixel</Text>
                    <View style={s.pixelActive}><View style={s.pixelDot} /><Text style={s.pixelActiveText}>Active</Text></View>
                  </View>
                </View>
              </View>
            )}

            {/* Sales Step 3: Who do you want to reach? */}
            {step === 2 && isSales && (
              <View style={{ gap: 12 }}>
                <Pressable style={[s.followOpt, audienceMode === "automatic" && s.followOptOn]} onPress={() => setAudienceMode("automatic")}>
                  <View style={s.followOptIcon}><Sparkles size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={s.followOptTitleRow}>
                      <Text style={s.followOptTitle}>Automatic Audience</Text>
                      <View style={s.recBadge}><Text style={s.recBadgeText}>Recommended</Text></View>
                    </View>
                    <Text style={s.followOptDesc}>We'll automatically show your ad to the right people.</Text>
                  </View>
                  <Radio on={audienceMode === "automatic"} />
                </Pressable>

                <Pressable style={[s.followOpt, audienceMode === "custom" && s.followOptOn]} onPress={() => setAudienceMode("custom")}>
                  <View style={s.followOptIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.followOptTitle}>Custom Audience</Text>
                    <Text style={s.followOptDesc}>Manually choose your audience targeting.</Text>
                  </View>
                  <Radio on={audienceMode === "custom"} />
                </Pressable>

                {audienceMode === "automatic" ? (
                  <View style={s.audDetailCard}>
                    <Text style={s.audDetailTitle}>Audience Details</Text>
                    {[["Location", autoLocationLabel], ["Age", "18 – 65+"], ["Gender", "All genders"], ["Languages", "All languages"], ["Interests", "All interests"]].map(([k, val]) => (
                      <View key={k} style={s.audDetailRow}><Text style={s.audDetailKey}>{k}</Text><Text style={s.audDetailVal}>{val}</Text></View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 22, marginTop: 4 }}>
                    <Field label="Location">
                      <Pressable style={s.locationRow} onPress={() => setCountrySheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{countryLabel}</Text>
                        <ChevronRight size={20} color={colors.textFaint} />
                      </Pressable>
                    </Field>
                    <Field label="Target Location (Optional)" hint={country ? `Search a city or area within ${country}.` : "Pick a country first, then narrow to a city or area."}>
                      <Pressable style={s.locationRow} onPress={() => setAreaSheet(true)}>
                        <MapPin size={18} color={colors.text} strokeWidth={2} />
                        <Text style={s.locationText} numberOfLines={1}>{area?.label || (country ? `Anywhere in ${country}` : "Anywhere")}</Text>
                        {area
                          ? <Pressable hitSlop={10} onPress={() => setArea(null)}><X size={18} color={colors.textFaint} /></Pressable>
                          : <ChevronRight size={20} color={colors.textFaint} />}
                      </Pressable>
                    </Field>
                    <Field label="Age">
                      <View style={s.choiceRow}>
                        {AGES.map((a) => (
                          <Pressable key={a} style={[s.choicePill, age === a && s.choicePillOn]} onPress={() => setAge(a)}>
                            <Text style={[s.choiceText, age === a && s.choiceTextOn]}>{a}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Gender">
                      <View style={s.choiceRow}>
                        {GENDERS.map((g) => (
                          <Pressable key={g.id} style={[s.choicePill, s.choicePillTall, gender === g.id && s.choicePillOn]} onPress={() => setGender(g.id)}>
                            <Text style={[s.choiceText, gender === g.id && s.choiceTextOn]}>{g.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Languages (Optional)" hint="Reach people who use these languages.">
                      <View style={s.pillRow}>
                        {languages.map((lng) => (
                          <Pressable key={lng} style={[s.chip, s.chipOn]} onPress={() => toggle(languages, setLanguages, lng)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{lng}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setLanguagesSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{languages.length ? "Add Language" : "All languages"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <Field label="Interests (Optional)">
                      <View style={s.pillRow}>
                        {[...BASE_INTERESTS, ...interests.filter((i) => !BASE_INTERESTS.includes(i))].map((tag) => {
                          const on = interests.includes(tag);
                          return (
                            <Pressable key={tag} style={[s.chip, on && s.chipOn]} onPress={() => toggle(interests, setInterests, tag)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{tag}</Text>
                            </Pressable>
                          );
                        })}
                        <Pressable style={s.addChip} onPress={() => setInterestSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>Add Interest</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.detailHead}><Text style={s.detailHeadText}>Detailed Targeting</Text></View>
                    <Field label="Relationship (Optional)">
                      <View style={s.pillRow}>
                        {RELATIONSHIP.map((r) => {
                          const on = relationship.includes(r);
                          return (
                            <Pressable key={r} style={[s.chip, on && s.chipOn]} onPress={() => toggle(relationship, setRelationship, r)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{r}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Education (Optional)">
                      <View style={s.pillRow}>
                        {EDUCATION.map((e) => {
                          const on = education.includes(e);
                          return (
                            <Pressable key={e} style={[s.chip, on && s.chipOn]} onPress={() => toggle(education, setEducation, e)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{e}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>
                    <Field label="Parental Status (Optional)">
                      <View style={s.choiceRow}>
                        {PARENTAL.map((p2) => (
                          <Pressable key={p2} style={[s.choicePill, s.choicePillTall, parental === p2 && s.choicePillOn]} onPress={() => setParental(p2)}>
                            <Text style={[s.choiceText, parental === p2 && s.choiceTextOn]}>{p2}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>
                    <Field label="Behaviors (Optional)" hint="Reach people by purchase and activity behaviours.">
                      <View style={s.pillRow}>
                        {behaviors.map((b) => (
                          <Pressable key={b} style={[s.chip, s.chipOn]} onPress={() => toggle(behaviors, setBehaviors, b)}>
                            <Text style={[s.chipText, s.chipTextOn]}>{b}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={s.addChip} onPress={() => setBehaviorsSheet(true)}>
                          <Plus size={15} color={colors.textSecondary} strokeWidth={2.6} />
                          <Text style={s.addChipText}>{behaviors.length ? "Add Behavior" : "Add Behaviors"}</Text>
                        </Pressable>
                      </View>
                    </Field>
                    <View style={s.audienceCard}>
                      <View style={s.audienceIcon}><Users size={20} color={colors.brand} strokeWidth={2.2} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.audienceLabel}>Estimated Audience</Text>
                        <Text style={s.audienceValue}>{formatCompact(audience.min)} – {formatCompact(audience.max)}</Text>
                        <Text style={s.audiencePeople}>People</Text>
                      </View>
                      <MiniBars />
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Sales Step 4: Budget & Duration (Estimated Conversions) */}
            {step === 3 && isSales && (
              <View style={{ gap: 22 }}>
                <Field label={goalBudgetType === "daily" ? "Daily Budget" : "Lifetime Budget"}>
                  <View style={[s.choiceRow, { marginBottom: 12 }]}>
                    {(["daily", "lifetime"] as const).map((b) => (
                      <Pressable key={b} style={[s.choicePill, s.choicePillTall, goalBudgetType === b && s.choicePillOn]} onPress={() => setGoalBudgetType(b)}>
                        <Text style={[s.choiceText, goalBudgetType === b && s.choiceTextOn]}>{b === "daily" ? "Daily" : "Lifetime"}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.amountBox}>
                    <Pressable style={s.currencyBtn} onPress={() => setCurrencySheet(true)}>
                      <Text style={s.currencyText}>{currency}</Text>
                      <ChevronDown size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={s.amountDivider} />
                    <TextInput style={s.amountInput} value={group(amount)} onChangeText={(v) => setAmount(Math.min(9_999_999, parseInt(v.replace(/[^0-9]/g, "") || "0", 10)))} keyboardType="number-pad" placeholderTextColor={colors.textFaint} />
                  </View>
                  <Slider value={Math.min(amount, SLIDER_MAX)} min={SLIDER_MIN} max={SLIDER_MAX} onChange={setAmount} />
                  <View style={s.sliderEnds}>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MIN)}</Text>
                    <Text style={s.sliderEndText}>{currency} {group(SLIDER_MAX)}+</Text>
                  </View>
                  {currency !== "USD" && <Text style={s.fxNote}>{usdHint(amount, currency)} · billed in USD</Text>}
                </Field>

                <Field label="Duration">
                  <View style={s.choiceRow}>
                    <Pressable style={[s.choicePill, s.choicePillTall, !continuous && s.choicePillOn]} onPress={() => setContinuous(false)}>
                      <Text style={[s.choiceText, !continuous && s.choiceTextOn]}>Set End Date</Text>
                    </Pressable>
                    <Pressable style={[s.choicePill, s.choicePillTall, continuous && s.choicePillOn]} onPress={() => setContinuous(true)}>
                      <Text style={[s.choiceText, continuous && s.choiceTextOn]}>Run Continuously</Text>
                    </Pressable>
                  </View>
                  <View style={[s.scheduleBox, { marginTop: 12 }]}>
                    <Pressable style={[s.scheduleRow, !continuous && s.scheduleRowBorder]} onPress={() => setStartSheet(true)}>
                      <Text style={s.scheduleKey}>Start Date</Text>
                      <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(startDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                    </Pressable>
                    {!continuous && (
                      <Pressable style={s.scheduleRow} onPress={() => setEndSheet(true)}>
                        <Text style={s.scheduleKey}>End Date</Text>
                        <View style={s.scheduleVal}><Text style={s.scheduleValText}>{fmtDate(endDate)}</Text><Calendar size={16} color={colors.textMuted} /></View>
                      </Pressable>
                    )}
                  </View>
                  <Text style={s.msgHint}>{continuous ? "Runs continuously (billed every 30 days) until you turn it off." : `${followDays} ${followDays === 1 ? "day" : "days"} · ${fmtDate(startDate)} – ${fmtDate(endDate)}`}</Text>
                </Field>

                <View style={s.estCard}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estSalesConvMin)} – {formatCompact(estSalesConvMax)}</Text>
                  <Text style={s.estViewsUnit}>Conversions</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>
              </View>
            )}

            {/* Sales Step 5: Where should your ad appear? */}
            {step === 4 && isSales && (
              <View style={{ gap: 12 }}>
                {VIEW_PLACEMENTS.map((p) => {
                  const on = viewPlacements.includes(p.id);
                  const Icon = p.icon;
                  return (
                    <Pressable key={p.id} style={[s.followPlace, on && s.followPlaceOn]} onPress={() => toggle(viewPlacements, setViewPlacements, p.id)}>
                      <View style={s.followPlaceIcon}><Icon size={20} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.followPlaceTitle, on && { color: colors.brand }]}>{p.label}</Text>
                        <Text style={s.followPlaceDesc}>{p.desc}</Text>
                      </View>
                      <PlacementMini id={p.id} on={on} />
                      <CheckBox on={on} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Sales Step 6: Tracking & Optimization */}
            {step === 5 && isSales && (
              <View style={{ gap: 22 }}>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Optimization Goal</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setConvOptSheet(true)}>
                    <Text style={s.vsDropdownText}>{convOptimizationGoal}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Bid Strategy</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setConvBidSheet(true)}>
                    <Text style={s.vsDropdownText}>{convBidStrategy}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                  <Text style={s.msgHint}>Get the most conversions for your budget.</Text>
                </View>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Attribution Window</Text>
                  <Pressable style={s.vsDropdown} onPress={() => setConvAttrSheet(true)}>
                    <Text style={s.vsDropdownText}>{convAttribution}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={{ gap: 10 }}>
                  <Text style={s.fieldLabel}>Payment Event <Text style={s.optLabelGray}>(Optional)</Text></Text>
                  <Pressable style={s.vsDropdown} onPress={() => setConvPayEventSheet(true)}>
                    <Text style={s.vsDropdownText}>{convPaymentEvent}</Text>
                    <ChevronDown size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <View style={s.tipBox}>
                  <Lightbulb size={18} color={colors.brand} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tipLabel}>TIP</Text>
                    <Text style={s.tipDesc}>Make sure your Pixel is installed correctly on your website and the {convPaymentEvent} event is firing.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Sales Step 7: Review & Launch */}
            {step === 6 && isSales && (
              <View style={{ gap: 12 }}>
                <ReviewRow icon={goal.icon} tint={goal.tint} color={goal.color} label="Campaign Goal" value={goal.label} onEdit={() => setStep(0)} />
                <ReviewRow icon={ShoppingBag} tint="#dbeafe" color="#2563eb" label="Conversion Event" value={convEvent} onEdit={() => setStep(1)} />
                <ReviewRow icon={Users} tint="#ede9fe" color="#7c3aed" label="Audience" value={audienceMode === "automatic" ? "Automatic Audience" : `${country || "Anywhere"} • Age ${age.replace("-", "–")}`} onEdit={() => setStep(2)} />
                <ReviewRow icon={Wallet} tint="#fff1d6" color="#f59e0b" label="Budget" value={`${cur(amount, currency)} / day`} onEdit={() => setStep(3)} />
                <ReviewRow icon={Clock} tint="#e0f2fe" color="#0284c7" label="Duration" value={continuous ? "Continuous" : `${followDays} Days`} onEdit={() => setStep(3)} />
                <ReviewRow icon={LayoutGrid} tint="#dcfce7" color="#16a34a" label="Placements" value={`${viewPlacements.length} Placement${viewPlacements.length === 1 ? "" : "s"} Selected`} onEdit={() => setStep(4)} />

                <View style={{ gap: 10 }}>
                  <Text style={s.detailHeadText}>Ad Preview</Text>
                  <View style={s.previewCard}>
                    {previewThumb ? <Image source={{ uri: previewThumb }} style={s.previewThumb} contentFit="cover" /> : <View style={[s.previewThumb, s.thumbFallback]}><Play size={22} color={colors.textFaint} /></View>}
                    <LinearGradient colors={["rgba(0,0,0,0.65)", "rgba(0,0,0,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewTop}>
                      <View style={s.previewAvatar}><Text style={s.previewAvatarText}>{previewName.replace("@", "").slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.previewName} numberOfLines={1}>{previewName}</Text>
                        <Text style={s.previewSponsored}>Sponsored</Text>
                      </View>
                      <View style={s.previewChevron}><ChevronDown size={16} color={colors.white} /></View>
                    </LinearGradient>
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.previewBottom}>
                      <Text style={s.previewHeadline} numberOfLines={2}>{previewHeadline}</Text>
                      {previewCta !== "No Button" && (
                        <View style={s.previewCtaBtn}><Text style={s.previewCtaText}>{previewCta}</Text><ArrowRight size={14} color={colors.white} strokeWidth={2.6} /></View>
                      )}
                    </LinearGradient>
                  </View>
                </View>
                <View style={[s.estCard, { marginTop: 8 }]}>
                  <Text style={s.estTitle}><Text style={s.estTitleAccent}>Estimated Results</Text></Text>
                  <Text style={s.estFollowValue}>{formatCompact(estSalesConvMin)} – {formatCompact(estSalesConvMax)}</Text>
                  <Text style={s.estViewsUnit}>Conversions</Text>
                  <Text style={s.estFollowNote}>{estScopeNote}</Text>
                </View>

                <View style={s.payHead}><Text style={s.detailHeadText}>Payment Method</Text></View>
                <View style={s.payGoalGrid}>
                  {GOAL_PAY_METHODS.map((pm) => {
                    const on = payTab === pm.id;
                    const Icon = pm.icon;
                    return (
                      <Pressable key={pm.id} style={[s.payGoalCard, on && s.payGoalCardOn]} onPress={() => setPayTab(pm.id)}>
                        <Icon size={18} color={on ? colors.brand : colors.textSecondary} strokeWidth={2.1} />
                        <Text style={[s.payGoalLabel, on && { color: colors.brand }]} numberOfLines={1}>{pm.label}</Text>
                        {pm.id === "coins" && <Text style={s.payGoalSub}>{formatCompact(coinBalance)} coins</Text>}
                      </Pressable>
                    );
                  })}
                </View>
                {payTab === "coins" && (
                  <View style={[s.coinsNote, !enoughCoins && s.coinsNoteLow]}>
                    <Coins size={16} color={enoughCoins ? colors.success : colors.danger} />
                    <Text style={s.coinsNoteText}>
                      {enoughCoins
                        ? `Pay ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}) · balance ${formatCompact(coinBalance)}`
                        : `Need ${formatCompact(coinsNeeded)} coins (≈ $${goalTotalUsd.toFixed(2)}); you have ${formatCompact(coinBalance)}. Earn more or choose another method.`}
                    </Text>
                  </View>
                )}
                <View style={s.paySecure}>
                  <Lock size={13} color={colors.textMuted} strokeWidth={2.2} />
                  <Text style={s.paySecureText}>Payments are secure and encrypted. You're only charged once the ad is approved.</Text>
                </View>
                <View style={s.orderGoalCard}>
                  <Text style={s.orderGoalTitle}>Order Summary</Text>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>{goalBudgetType === "daily" ? "Daily budget" : "Lifetime budget"}</Text>
                    <Text style={s.orderGoalVal}>{cur(amount, currency)}{goalBudgetType === "daily" ? " / day" : ""}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Schedule</Text>
                    <Text style={s.orderGoalVal}>{continuous ? "Runs continuously" : `${followDays} ${followDays === 1 ? "day" : "days"}`}</Text>
                  </View>
                  <View style={s.orderGoalLine}>
                    <Text style={s.orderGoalK}>Payment</Text>
                    <Text style={s.orderGoalVal}>{GOAL_PAY_METHODS.find((m) => m.id === payTab)?.label ?? "Card"}</Text>
                  </View>
                  <View style={s.orderGoalDivide} />
                  <View style={s.orderGoalRow}>
                    <Text style={s.orderGoalTotalK}>Total{continuous ? " / 30-day cycle" : ""}</Text>
                    <Text style={s.orderGoalTotalV}>{cur(goalTotal, currency)}</Text>
                  </View>
                </View>

                <Pressable style={s.termsRow} onPress={() => setAgreedTerms((v) => !v)}>
                  <View style={[s.termsCheck, agreedTerms && s.termsCheckOn]}>{agreedTerms && <Check size={13} color={colors.white} strokeWidth={3} />}</View>
                  <Text style={s.termsRowText}>I agree to the <Text style={s.termsLink}>Terms &amp; Conditions</Text></Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable onPress={goNext} disabled={createM.isPending || verifying}>
            <LinearGradient colors={["#ff3b63", "#fe2c55", "#e0243d"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.nextBtn}>
              {verifying ? (
                <><ActivityIndicator color={colors.white} /><Text style={s.nextText}>  Verifying payment…</Text></>
              ) : createM.isPending && createM.variables === "pending_review" ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  {step === 6 && <Lock size={15} color={colors.white} strokeWidth={2.6} />}
                  <Text style={s.nextText}>{nextLabels[step]}</Text>
                  {step < 6 && <ArrowRight size={18} color={colors.white} strokeWidth={2.6} />}
                </>
              )}
            </LinearGradient>
          </Pressable>
          {step === 6 && !isViews && !isFollowers && !isWebsite && !isMessages && !isInstalls && !isEngagement && !isSales && (
            <Text style={s.terms}>By continuing you agree to Teezer Ads <Text style={s.termsLink}>Terms</Text> and <Text style={s.termsLink}>Advertising Policies</Text>.</Text>
          )}
        </View>
      </View>

      {/* ── Sheets ── */}
      <CountrySheet visible={countrySheet} onClose={() => setCountrySheet(false)} selected={country} onSelect={setCountry} />
      <ListSheet visible={currencySheet} onClose={() => setCurrencySheet(false)} title="Currency" options={CURRENCIES} selected={currency} onSelect={setCurrency} />
      <ListSheet visible={optimizationSheet} onClose={() => setOptimizationSheet(false)} title="Optimization Goal" options={OPTIMIZATION_GOALS} selected={optimizationGoal} onSelect={setOptimizationGoal} />
      <ListSheet visible={websiteCtaSheet} onClose={() => setWebsiteCtaSheet(false)} title="Call-to-Action" options={WEBSITE_CTA_OPTIONS} selected={ctaLabelOf(ctaType)} onSelect={(label) => { const f = CTA_GRID.find((c) => c.label === label); if (f) setCtaType(f.value); }} />
      <ListSheet visible={actionButtonSheet} onClose={() => setActionButtonSheet(false)} title="Action Button" options={MESSAGE_ACTIONS} selected={actionButton} onSelect={setActionButton} />
      <ListSheet visible={appCtaSheet} onClose={() => setAppCtaSheet(false)} title="Call to Action" options={INSTALL_CTA_OPTIONS} selected={appCta} onSelect={setAppCta} />
      <ListSheet visible={appTrackingSheet} onClose={() => setAppTrackingSheet(false)} title="Tracking Event" options={INSTALL_TRACKING_OPTIONS} selected={appTracking} onSelect={setAppTracking} />
      <ListSheet visible={convEventSheet} onClose={() => setConvEventSheet(false)} title="Conversion Event" options={CONV_EVENTS} selected={convEvent} onSelect={setConvEvent} />
      <ListSheet visible={convOptSheet} onClose={() => setConvOptSheet(false)} title="Optimization Goal" options={CONV_OPT_GOALS} selected={convOptimizationGoal} onSelect={setConvOptimizationGoal} />
      <ListSheet visible={convBidSheet} onClose={() => setConvBidSheet(false)} title="Bid Strategy" options={CONV_BID_STRATEGIES} selected={convBidStrategy} onSelect={setConvBidStrategy} />
      <ListSheet visible={convAttrSheet} onClose={() => setConvAttrSheet(false)} title="Attribution Window" options={CONV_ATTRIBUTION} selected={convAttribution} onSelect={setConvAttribution} />
      <ListSheet visible={convPayEventSheet} onClose={() => setConvPayEventSheet(false)} title="Payment Event" options={CONV_PAYMENT_EVENTS} selected={convPaymentEvent} onSelect={setConvPaymentEvent} />
      <InterestSheet visible={interestSheet} onClose={() => setInterestSheet(false)} selected={interests} onToggle={(t2) => toggle(interests, setInterests, t2)} />
      <LanguagesSheet visible={languagesSheet} onClose={() => setLanguagesSheet(false)} selected={languages} onToggle={(t2) => toggle(languages, setLanguages, t2)} />
      <BehaviorsSheet visible={behaviorsSheet} onClose={() => setBehaviorsSheet(false)} selected={behaviors} onToggle={(t2) => toggle(behaviors, setBehaviors, t2)} />
      <AreaSheet
        visible={areaSheet}
        onClose={() => setAreaSheet(false)}
        countryCode={countryC?.code}
        hasArea={!!area}
        onSelect={(r) => setArea({ label: [r.city, r.region].filter(Boolean).join(", ") || r.formatted, city: r.city, region: r.region })}
        onClear={() => setArea(null)}
      />
      <LocationMapSheet visible={mapSheet} onClose={() => setMapSheet(false)} initial={geo}
        onConfirm={(g) => { setGeo(g); setMapSheet(false); }} />
      <StartDateSheet visible={startSheet} onClose={() => setStartSheet(false)} value={startDate}
        onSelect={(d) => { setStartDate(d); setEndDate((e) => (e <= d ? addDays(d, 6) : e)); }} />
      <EndDateSheet visible={endSheet} onClose={() => setEndSheet(false)} value={endDate} min={startDate} onSelect={setEndDate} />
      <VideoSheet visible={videoSheet} onClose={() => setVideoSheet(false)} selectedId={video?.id} onSelect={(v) => { setVideo(v); setVideoSheet(false); }} />
    </Modal>
  );
}

/* ───────────────────────────── small pieces ───────────────────────────── */

function Radio({ on }: { on: boolean }) {
  return <View style={[s.radio, on && s.radioOn]}>{on && <Check size={12} color={colors.white} strokeWidth={3.2} />}</View>;
}
function CheckBox({ on }: { on: boolean }) {
  return <View style={[s.checkbox, on && s.checkboxOn]}>{on && <Check size={14} color={colors.white} strokeWidth={3.2} />}</View>;
}

/* Numbered step indicator (steps 2-7), completed steps show a check. */
function StepDots({ current }: { current: number }) {
  return (
    <View style={s.dotsRow}>
      {STEP_TITLES.map((_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={i}>
            {i > 0 && <View style={[s.dotLine, i <= current && s.dotLineOn]} />}
            <View style={[s.dot, (done || active) && s.dotOn]}>
              {done
                ? <Check size={13} color={colors.white} strokeWidth={3} />
                : <Text style={[s.dotText, active && s.dotTextOn]}>{i + 1}</Text>}
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

/* Placement icon inside its outlined tile. In-Feed uses a circle-play glyph. */
function PlaceIcon({ id }: { id: string }) {
  const p = { size: 24, color: colors.text, strokeWidth: 1.9 } as const;
  switch (id) {
    case "in_feed": return <View style={s.circlePlay}><Play size={11} color={colors.text} fill={colors.text} strokeWidth={0} /></View>;
    case "profile_top": return <User {...p} />;
    case "hashtag": return <Hash {...p} />;
    case "search": return <Search {...p} />;
    case "inbox": return <MessageCircle {...p} />;
    case "explore": return <Compass {...p} />;
    default: return null;
  }
}

/* Small stylised phone preview per placement (approximates the design's screenshots). */
function PhoneMock({ variant }: { variant: string }) {
  const cells = (n: number) => Array.from({ length: n }, (_, i) => <View key={i} style={s.pmCell} />);
  return (
    <View style={s.phone}>
      <View style={s.phoneNotch} />
      <View style={s.phoneScreen}>
        {variant === "feed" && (
          <View style={s.pmImg}>
            <View style={s.pmTopTabs}><View style={s.pmTab} /><View style={[s.pmTab, s.pmTabOn]} /></View>
            <View style={s.pmDotsCol}>{[0, 1, 2, 3].map((i) => <View key={i} style={s.pmDot} />)}</View>
          </View>
        )}
        {variant === "profile" && (
          <View style={s.pmPad}>
            <View style={s.pmAvatar} />
            <View style={[s.pmLine, { width: "45%", alignSelf: "center", marginTop: 4 }]} />
            <View style={s.pmStatsRow}>{[0, 1, 2].map((i) => <View key={i} style={s.pmStat} />)}</View>
            <View style={s.pmGrid}>{cells(3)}</View>
          </View>
        )}
        {variant === "hashtag" && (
          <View style={s.pmPad}>
            <View style={s.pmHashRow}><Text style={s.pmHash}>#</Text><View style={[s.pmLine, { width: 26 }]} /></View>
            <View style={s.pmGrid}>{cells(6)}</View>
          </View>
        )}
        {variant === "search" && (
          <View style={s.pmPad}>
            <View style={s.pmSearchBar} />
            {[0, 1, 2].map((i) => (
              <View key={i} style={s.pmRow}>
                <View style={s.pmThumb} />
                <View style={{ gap: 3, flex: 1 }}><View style={s.pmLine} /><View style={[s.pmLine, { width: "60%" }]} /></View>
              </View>
            ))}
          </View>
        )}
        {variant === "inbox" && (
          <View style={s.pmPad}>
            <View style={[s.pmLine, { width: "42%", alignSelf: "center", height: 5, marginBottom: 2 }]} />
            {[0, 1, 2].map((i) => (
              <View key={i} style={s.pmRow}>
                <View style={s.pmAvatarSm} />
                <View style={{ gap: 3, flex: 1 }}><View style={s.pmLine} /><View style={[s.pmLine, { width: "70%" }]} /></View>
                <View style={s.pmRedDot} />
              </View>
            ))}
          </View>
        )}
        {variant === "explore" && (
          <View style={s.pmPad}>
            <View style={s.pmTabsRow}>{[0, 1, 2].map((i) => <View key={i} style={s.pmTabSm} />)}</View>
            <View style={s.pmGrid}>{cells(6)}</View>
          </View>
        )}
      </View>
    </View>
  );
}
/** Map a goal-flow placement id to a phone-preview layout. */
function placementVariant(id: string): "feed" | "explore" | "search" | "profile" {
  switch (id) {
    case "explore_feed": case "discover_people": case "explore": return "explore";
    case "search_results": case "search": return "search";
    case "profile_feed": case "profile_top": case "suggested_accounts": case "follow_recommendations": return "profile";
    default: return "feed"; // for_you_feed, following_feed, suggested_videos, in_feed
  }
}

/** Compact mobile preview shown on the right of each placement row - highlights
 *  where the ad appears for that surface. Brand-tinted when the placement is on. */
function PlacementMini({ id, on }: { id: string; on: boolean }) {
  const v = placementVariant(id);
  const accent = on ? colors.brand : "#c4cad4";
  return (
    <View style={s.miniPhone}>
      <View style={s.miniNotch} />
      <View style={s.miniScreen}>
        {v === "feed" && (
          <View style={[s.miniFull, { backgroundColor: accent }]}>
            <View style={s.miniPlay} />
            <View style={s.miniFeedDots}>{[0, 1, 2].map((i) => <View key={i} style={s.miniFeedDot} />)}</View>
          </View>
        )}
        {v === "explore" && (
          <View style={s.miniGrid}>{[0, 1, 2, 3].map((i) => <View key={i} style={[s.miniCell, { backgroundColor: accent }]} />)}</View>
        )}
        {v === "search" && (
          <View style={s.miniPad}>
            <View style={[s.miniSearchBar, { backgroundColor: accent }]} />
            {[0, 1].map((i) => (
              <View key={i} style={s.miniSearchRow}>
                <View style={[s.miniThumb, { backgroundColor: accent }]} />
                <View style={{ flex: 1, gap: 2 }}><View style={s.miniLine} /><View style={[s.miniLine, { width: "60%" }]} /></View>
              </View>
            ))}
          </View>
        )}
        {v === "profile" && (
          <View style={s.miniPad}>
            <View style={[s.miniAvatar, { backgroundColor: accent }]} />
            <View style={s.miniGridRow}>{[0, 1, 2].map((i) => <View key={i} style={[s.miniCellSm, { backgroundColor: accent }]} />)}</View>
          </View>
        )}
      </View>
    </View>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {!!hint && <Text style={s.fieldHint}>{hint}</Text>}
      {children}
    </View>
  );
}
/* Step 5 ad-detail row: label on the left, field on the right. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      {children}
    </View>
  );
}
function LabeledInput({
  label, value, onChange, placeholder, counter, multiline, keyboardType,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  counter: string; multiline?: boolean; keyboardType?: "default" | "number-pad";
}) {
  return (
    <View style={{ gap: 5 }}>
      <View style={s.inLabelRow}>
        <Text style={s.inLabel}>{label}</Text>
        {!!counter && <Text style={s.inCounter}>{counter}</Text>}
      </View>
      <TextInput
        style={[s.input, multiline && s.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        keyboardType={keyboardType ?? "default"}
      />
    </View>
  );
}
function EstTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.estLabel}>{label}</Text>
      <Text style={s.estValue}>{value}</Text>
      <Text style={s.estUnit}>{unit}</Text>
    </View>
  );
}
function SummaryLine({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={s.summaryLine}>
      <Text style={[s.summaryK, bold && { color: colors.text, fontWeight: font.weightBold }]}>{k}</Text>
      <Text style={[s.summaryV, bold && { color: colors.brand }]}>{v}</Text>
    </View>
  );
}
/* Step 7 - payment method tile top graphic */
function PayTop({ id, active }: { id: string; active: boolean }) {
  const c = active ? colors.brand : colors.text;
  if (id === "apple") return (
    <View style={s.payBrandRow}><Apple size={16} color={c} fill={c} strokeWidth={0} /><Text style={[s.payBrandText, { color: c }]}> Pay</Text></View>
  );
  if (id === "google") return (
    <View style={s.payBrandRow}><Text style={[s.payBrandText, { color: "#4285F4" }]}>G</Text><Text style={[s.payBrandText, { color: c }]}> Pay</Text></View>
  );
  if (id === "wallet") return <Wallet size={22} color={c} strokeWidth={2} />;
  return <CreditCard size={22} color={c} strokeWidth={2} />;
}
/* Step 7 - saved-card brand mark */
function CardBrand({ brand }: { brand: string }) {
  if (brand === "Mastercard") return (
    <View style={s.brandBox}>
      <View style={s.mcRow}>
        <View style={[s.mcCircle, { backgroundColor: "#eb001b" }]} />
        <View style={[s.mcCircle, { backgroundColor: "#f79e1b", marginLeft: -9 }]} />
      </View>
    </View>
  );
  if (brand === "American Express") return (
    <View style={[s.brandBox, { backgroundColor: "#1e6fd9" }]}><Text style={s.amexText}>AMEX</Text></View>
  );
  return <View style={s.brandBox}><Text style={s.visaText}>VISA</Text></View>;
}
/* Step 7 - order-summary line with a leading icon */
function SummaryRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Icon size={16} color={colors.textMuted} strokeWidth={2} />
      <Text style={s.summaryRowK}>{label}</Text>
      <Text style={s.summaryRowV} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function MiniBars() {
  const h = [8, 11, 14, 12, 18, 22, 28];
  return (
    <View style={s.miniBars}>
      {h.map((v, i) => <View key={i} style={[s.miniBar, { height: v, backgroundColor: i >= 5 ? "#8b5cf6" : "#c9bbf3" }]} />)}
    </View>
  );
}
function ReviewRow({ icon: Icon, tint, color, label, value, onEdit, round }: {
  icon: any; tint: string; color: string; label: string; value: string; onEdit: () => void; round?: boolean;
}) {
  return (
    <View style={s.reviewRow}>
      <View style={[s.reviewIcon, { backgroundColor: tint }]}>
        {round ? (
          <View style={[s.reviewIconRound, { backgroundColor: color }]}>
            <Icon size={13} color={colors.white} fill={colors.white} strokeWidth={0} />
          </View>
        ) : (
          <Icon size={21} color={color} strokeWidth={2.2} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.reviewLabel}>{label}</Text>
        <Text style={s.reviewValue} numberOfLines={2}>{value}</Text>
      </View>
      <Pressable hitSlop={10} onPress={onEdit} style={s.editBtn}><Pencil size={17} color={colors.textMuted} strokeWidth={2} /></Pressable>
    </View>
  );
}

/* ── Draggable slider (no native dependency; PanResponder over the track) ──
   Handlers read the track geometry + latest onChange from refs so the once-created
   PanResponder never closes over a stale width/callback, and use absolute page X
   (gesture x0/moveX) so the value doesn't jump when the touch lands on the thumb.

   Perf: the thumb/fill's LIVE position during drag is driven by an Animated.Value
   updated via .setValue() on every touch-move - that updates the underlying native
   views directly (bypassing React reconciliation), so dragging never re-renders this
   component, let alone the whole multi-step wizard above it. The `onChange` callback
   (which is a `setAmount` React state update one level up) is only invoked at a
   throttled ~12/sec cadence while dragging - enough to keep the "amount" field
   showing a live value - plus once more with the exact final value on release, so
   the committed number is never a stale throttled snapshot. Percentage-based
   left/width (matching the existing sliderFill/sliderThumb styles) aren't eligible
   for useNativeDriver (only transform/opacity are), and a relative-dx
   Animated.event mapping would reintroduce the "touch lands on the thumb" jump bug
   the absolute-page-X approach above was written to avoid - so the value stays
   JS-driven, just decoupled from React state. */
const SLIDER_COMMIT_MS = 80; // ~12 commits/sec while dragging

function Slider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const ref = useRef<View>(null);
  const geo = useRef({ left: 0, width: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const ratio = useRef(new Animated.Value(pct)).current;
  const draggingRef = useRef(false);
  const lastCommitRef = useRef(0);

  // Keep the animated thumb/fill in sync with `value` changes that come from
  // OUTSIDE a drag (typing in the amount field, switching steps/currency) -
  // never while the finger is down, or an in-flight drag would get yanked by
  // a stale/throttled prop update.
  useEffect(() => {
    if (!draggingRef.current) ratio.setValue(pct);
  }, [pct, ratio]);

  const commit = (r: number, final: boolean) => {
    const snapped = Math.round((min + r * (max - min)) / 50) * 50;
    if (final) {
      lastCommitRef.current = Date.now();
      onChangeRef.current(snapped);
      return;
    }
    const now = Date.now();
    if (now - lastCommitRef.current >= SLIDER_COMMIT_MS) {
      lastCommitRef.current = now;
      onChangeRef.current(snapped);
    }
  };

  const setFromAbs = (absX: number, final: boolean) => {
    const { left, width } = geo.current;
    if (width <= 0) return;
    const r = Math.max(0, Math.min(1, (absX - left) / width));
    ratio.setValue(r);       // visual position - every move, no React state involved
    commit(r, final);        // numeric value - throttled during drag, exact on release
  };
  const measure = () => ref.current?.measureInWindow((x, _y, width) => { geo.current = { left: x, width }; });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_e, g) => {
        draggingRef.current = true;
        ref.current?.measureInWindow((x, _y, width) => { geo.current = { left: x, width }; setFromAbs(g.x0, false); });
      },
      onPanResponderMove: (_e, g) => setFromAbs(g.moveX, false),
      onPanResponderRelease: (_e, g) => { setFromAbs(g.moveX, true); draggingRef.current = false; },
      onPanResponderTerminate: (_e, g) => { setFromAbs(g.moveX, true); draggingRef.current = false; },
    }),
  ).current;

  const fillWidthPct = ratio.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <View ref={ref} style={s.sliderHit} onLayout={measure} {...pan.panHandlers}>
      <View style={s.sliderTrack}>
        <Animated.View style={[s.sliderFill, { width: fillWidthPct }]} />
      </View>
      <Animated.View style={[s.sliderThumb, { left: fillWidthPct }]} />
    </View>
  );
}

/* ── Success ── */
function SuccessView({ insets, data, onDashboard, onAnother }: {
  insets: { top: number; bottom: number };
  data: {
    thumb: string | null; title: string; dateRange: string; budgetText: string;
    goalIcon: any; goalRound: boolean; goalColor: string; goalLabel: string;
    audienceText: string; placementText: string; durationText: string;
  };
  onDashboard: () => void;
  onAnother: () => void;
}) {
  const NEXT = [
    { icon: Bell, text: "You'll get a notification after approval" },
    { icon: Play, text: "Your ad will start running automatically" },
    { icon: BarChart3, text: "Track performance in Ads Dashboard" },
    { icon: PauseCircle, text: "You can pause or edit anytime" },
  ];
  const STATS = [
    { icon: data.goalIcon, label: "Goal", value: data.goalLabel },
    { icon: Users, label: "Audience", value: data.audienceText },
    { icon: LayoutGrid, label: "Placement", value: data.placementText },
    { icon: Clock, label: "Duration", value: data.durationText },
  ];
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.topBar}>
        <View style={s.brandRow}><Logo height={22} /><Text style={s.brandStudio}>Studio</Text></View>
        <Pressable hitSlop={10} onPress={onDashboard} style={s.topIcon}><X size={22} color={colors.text} /></Pressable>
      </View>
      {/* Progress bar (full) */}
      <View style={s.progressWrap}>
        <Text style={s.stepLabel}>Create Campaign</Text>
        <View style={s.progressRow}>
          {STEP_TITLES.map((_, i) => <View key={i} style={[s.seg, s.segOn]} />)}
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.successScroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {/* Confetti check */}
        <View style={s.successHero}>
          {CONFETTI.map((c, i) => (
            <View key={i} aria-hidden style={[s.confetti, {
              top: c.top, left: c.left as any,
              width: c.long ? c.size * 1.9 : c.size, height: c.size,
              backgroundColor: c.bg, borderRadius: c.long ? 2 : c.size / 2,
              transform: [{ rotate: c.rot }],
            }]} />
          ))}
          <LinearGradient colors={["#ff5573", "#fe2c55", "#e0243d"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.successCheck}>
            <Check size={46} color={colors.white} strokeWidth={3.5} />
          </LinearGradient>
        </View>

        <Text style={s.successTitle}>Campaign Created!</Text>
        <Text style={s.successSub}>Your campaign is under review. We'll notify you once it's approved.</Text>

        {/* Campaign summary card */}
        <View style={s.doneCard}>
          <View style={s.doneTop}>
            {data.thumb ? (
              <Image source={{ uri: data.thumb }} style={s.doneThumb} contentFit="cover" />
            ) : <View style={[s.doneThumb, s.thumbFallback]}><Play size={20} color={colors.textFaint} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.doneTitleRow}>
                <Text style={s.doneTitle} numberOfLines={2}>{data.title}</Text>
                <MoreVertical size={18} color={colors.textMuted} />
              </View>
              <View style={s.underReview}>
                <View style={s.underReviewDot} />
                <Text style={s.underReviewText}>Under Review</Text>
              </View>
              <View style={s.doneMeta}>
                <Calendar size={13} color={colors.textMuted} />
                <Text style={s.doneMetaText}>{data.dateRange}</Text>
                <View style={s.doneMetaDot} />
                <Wallet size={13} color={colors.textMuted} />
                <Text style={s.doneMetaText}>{data.budgetText}</Text>
              </View>
            </View>
          </View>
          <View style={s.doneDivide} />
          <View style={s.doneStats}>
            {STATS.map((st, i) => (
              <Fragment key={i}>
                {i > 0 && <View style={s.statColDivide} />}
                <View style={s.statCol}>
                  <st.icon size={16} color={colors.textSecondary} strokeWidth={2} />
                  <Text style={s.statColLabel}>{st.label}</Text>
                  <Text style={s.statColValue} numberOfLines={2}>{st.value}</Text>
                </View>
              </Fragment>
            ))}
          </View>
        </View>

        {/* What's Next */}
        <View style={s.wnCard}>
          <Text style={s.wnTitle}>What's Next?</Text>
          {NEXT.map((n, i) => (
            <Pressable key={i} style={s.wnRow}>
              <View style={s.wnIcon}><n.icon size={16} color={colors.brand} strokeWidth={2.3} /></View>
              <Text style={s.wnText}>{n.text}</Text>
              <ChevronRight size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>

        {/* Buttons */}
        <Pressable onPress={onDashboard} style={{ marginTop: 24 }}>
          <LinearGradient colors={["#ff3b63", "#fe2c55", "#e0243d"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.successPrimary}>
            <Text style={s.successPrimaryText}>Go to Dashboard</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={s.successOutline} onPress={onAnother}>
          <Text style={s.successOutlineText}>Create Another Campaign</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ── Sheets ── */
function CountrySheet({ visible, onClose, selected, onSelect }: {
  visible: boolean; onClose: () => void; selected: string; onSelect: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const base = [{ name: "", code: "" }, ...COUNTRIES];
    if (!q.trim()) return base;
    return base.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  }, [q]);
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.7} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>Location</Text>}>
      <View style={s.sheetSearch}>
        <Search size={15} color={colors.textFaint} />
        <TextInput style={s.sheetSearchInput} value={q} onChangeText={setQ} placeholder="Search countries" placeholderTextColor={colors.textFaint} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {list.map((c) => {
          const on = c.name === selected;
          return (
            <Pressable key={c.code || "any"} style={s.sheetRow} onPress={() => { onSelect(c.name); onClose(); }}>
              <Text style={[s.sheetRowText, on && s.sheetRowTextOn]} numberOfLines={1}>
                {c.code ? `${countryFlag(c.code)}  ${c.name}` : "🌍  Anywhere"}
              </Text>
              {on && <Check size={17} color={colors.brand} strokeWidth={2.6} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
function ListSheet({ visible, onClose, title, options, selected, onSelect }: {
  visible: boolean; onClose: () => void; title: string; options: string[]; selected: string; onSelect: (v: string) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.5} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>{title}</Text>}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {options.map((o) => {
          const on = o === selected;
          return (
            <Pressable key={o} style={s.sheetRow} onPress={() => { onSelect(o); onClose(); }}>
              <Text style={[s.sheetRowText, on && s.sheetRowTextOn]}>{o}</Text>
              {on && <Check size={17} color={colors.brand} strokeWidth={2.6} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
function InterestSheet({ visible, onClose, selected, onToggle }: {
  visible: boolean; onClose: () => void; selected: string[]; onToggle: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? CATEGORIES.filter((c) => c.toLowerCase().includes(needle)) : CATEGORIES;
  }, [q]);
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.75} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>Interests</Text>}>
      <View style={s.sheetSearch}>
        <Search size={15} color={colors.textFaint} />
        <TextInput style={s.sheetSearchInput} value={q} onChangeText={setQ} placeholder="Search interests" placeholderTextColor={colors.textFaint} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[s.pillRow, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
          {list.map((tag) => {
            const on = selected.includes(tag);
            return (
              <Pressable key={tag} style={[s.pill, on && s.pillOn]} onPress={() => onToggle(tag)}>
                <Text style={[s.pillText, on && s.pillTextOn]}>{tag}</Text>
              </Pressable>
            );
          })}
          {list.length === 0 && <Text style={s.emptyText}>No interests found.</Text>}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function LanguagesSheet({ visible, onClose, selected, onToggle }: {
  visible: boolean; onClose: () => void; selected: string[]; onToggle: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? LANGUAGES.filter((c) => c.toLowerCase().includes(needle)) : LANGUAGES;
  }, [q]);
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.75} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>Languages</Text>}>
      <View style={s.sheetSearch}>
        <Search size={15} color={colors.textFaint} />
        <TextInput style={s.sheetSearchInput} value={q} onChangeText={setQ} placeholder="Search languages" placeholderTextColor={colors.textFaint} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[s.pillRow, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
          {list.map((tag) => {
            const on = selected.includes(tag);
            return (
              <Pressable key={tag} style={[s.pill, on && s.pillOn]} onPress={() => onToggle(tag)}>
                <Text style={[s.pillText, on && s.pillTextOn]}>{tag}</Text>
              </Pressable>
            );
          })}
          {list.length === 0 && <Text style={s.emptyText}>No languages found.</Text>}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function BehaviorsSheet({ visible, onClose, selected, onToggle }: {
  visible: boolean; onClose: () => void; selected: string[]; onToggle: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? BEHAVIORS.filter((c) => c.toLowerCase().includes(needle)) : BEHAVIORS;
  }, [q]);
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.75} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>Behaviors</Text>}>
      <View style={s.sheetSearch}>
        <Search size={15} color={colors.textFaint} />
        <TextInput style={s.sheetSearchInput} value={q} onChangeText={setQ} placeholder="Search behaviors" placeholderTextColor={colors.textFaint} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[s.pillRow, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
          {list.map((tag) => {
            const on = selected.includes(tag);
            return (
              <Pressable key={tag} style={[s.pill, on && s.pillOn]} onPress={() => onToggle(tag)}>
                <Text style={[s.pillText, on && s.pillTextOn]}>{tag}</Text>
              </Pressable>
            );
          })}
          {list.length === 0 && <Text style={s.emptyText}>No behaviors found.</Text>}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function AreaSheet({ visible, onClose, countryCode, hasArea, onSelect, onClear }: {
  visible: boolean; onClose: () => void; countryCode?: string; hasArea: boolean;
  onSelect: (r: LocationResult) => void; onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 400);
  const searchQ = useQuery({
    queryKey: ["area-search", debounced, countryCode ?? ""],
    queryFn: () => locationApi.search(debounced, countryCode),
    enabled: visible && debounced.length >= 2,
    staleTime: 60_000,
  });
  const results = searchQ.data ?? [];
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.75} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>Target area</Text>}>
      <View style={s.sheetSearch}>
        <Search size={15} color={colors.textFaint} />
        <TextInput style={s.sheetSearchInput} value={q} onChangeText={setQ} placeholder="Search city, area or region" placeholderTextColor={colors.textFaint} autoFocus />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {hasArea && (
          <Pressable style={s.sheetRow} onPress={() => { onClear(); onClose(); }}>
            <X size={16} color={colors.brand} />
            <Text style={[s.sheetRowText, { color: colors.brand, marginLeft: 10 }]}>Clear area - target whole country</Text>
          </Pressable>
        )}
        {debounced.length < 2 ? (
          <Text style={s.emptyText}>Type at least 2 letters to search areas.</Text>
        ) : searchQ.isFetching ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : results.length === 0 ? (
          <Text style={s.emptyText}>No areas found. Try a different search.</Text>
        ) : results.map((r, idx) => (
          <Pressable key={`${r.formatted}-${idx}`} style={s.sheetRow} onPress={() => { onSelect(r); onClose(); }}>
            <MapPin size={15} color={colors.textMuted} />
            <Text style={[s.sheetRowText, { marginLeft: 10 }]} numberOfLines={2}>{r.formatted}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
/* Lightweight month-grid calendar (no native date dependency). Dates outside
   [min,max] are disabled; picking a day calls onSelect. */
const CAL_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
function CalendarPicker({ value, min, max, onSelect }: {
  value: Date; min?: Date; max?: Date; onSelect: (d: Date) => void;
}) {
  const [view, setView] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const y = view.getFullYear();
  const m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));

  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const minT = min ? dayStart(min) : -Infinity;
  const maxT = max ? dayStart(max) : Infinity;
  const canPrev = !min || new Date(y, m, 1) > new Date(min.getFullYear(), min.getMonth(), 1);
  const canNext = !max || new Date(y, m, 1) < new Date(max.getFullYear(), max.getMonth(), 1);

  return (
    <View style={s.cal}>
      <View style={s.calHead}>
        <Pressable style={[s.calNav, !canPrev && s.calNavOff]} disabled={!canPrev} onPress={() => setView(new Date(y, m - 1, 1))}>
          <ChevronLeft size={20} color={canPrev ? colors.text : colors.textFaint} />
        </Pressable>
        <Text style={s.calMonth}>{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
        <Pressable style={[s.calNav, !canNext && s.calNavOff]} disabled={!canNext} onPress={() => setView(new Date(y, m + 1, 1))}>
          <ChevronRight size={20} color={canNext ? colors.text : colors.textFaint} />
        </Pressable>
      </View>
      <View style={s.calWeekRow}>
        {CAL_WEEKDAYS.map((d, i) => <Text key={i} style={s.calWeekday}>{d}</Text>)}
      </View>
      <View style={s.calGrid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={s.calCell} />;
          const t = dayStart(d);
          const disabled = t < minT || t > maxT;
          const sel = iso(d) === iso(value);
          return (
            <Pressable key={i} style={s.calCell} disabled={disabled} onPress={() => onSelect(d)}>
              <View style={[s.calDay, sel && s.calDayOn]}>
                <Text style={[s.calDayText, sel && s.calDayTextOn, disabled && s.calDayTextOff]}>{d.getDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
function StartDateSheet({ visible, onClose, value, onSelect }: {
  visible: boolean; onClose: () => void; value: Date; onSelect: (d: Date) => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.62} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>Start date</Text>}>
      <CalendarPicker value={value} min={today} onSelect={(d) => { onSelect(d); onClose(); }} />
    </BottomSheet>
  );
}
function EndDateSheet({ visible, onClose, value, min, onSelect }: {
  visible: boolean; onClose: () => void; value: Date; min: Date; onSelect: (d: Date) => void;
}) {
  // End must be at least the day after the start.
  const minEnd = addDays(new Date(min.getFullYear(), min.getMonth(), min.getDate()), 1);
  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.62} scrollable={false} dragArea="header"
      header={<Text style={s.sheetTitle}>End date</Text>}>
      <CalendarPicker value={value} min={minEnd} onSelect={(d) => { onSelect(d); onClose(); }} />
    </BottomSheet>
  );
}
const CONTENT_FILTERS: { id: "all" | "reels" | "photos"; label: string }[] = [
  { id: "all", label: "All" }, { id: "reels", label: "Reels" }, { id: "photos", label: "Photos" },
];
function VideoSheet({ visible, onClose, selectedId, onSelect }: {
  visible: boolean; onClose: () => void; selectedId?: number; onSelect: (v: Video) => void;
}) {
  const [filter, setFilter] = useState<"all" | "reels" | "photos">("all");
  const q = useQuery({
    queryKey: ["studio-content", "promotable"],
    queryFn: () => studioApi.content({ status: "published", per_page: 50 }),
    enabled: visible,
    staleTime: 60_000,
  });
  const videos = q.data?.data ?? [];
  const shown = videos.filter((v) =>
    filter === "all" ? true : filter === "reels" ? v.media_type === "video" : v.media_type !== "video");

  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.82} scrollable={false} dragArea="header"
      header={<View><Text style={s.sheetTitle}>Choose content</Text><Text style={s.sheetSubtitle}>Your public reels & photos</Text></View>}>
      <View style={s.filterRow}>
        {CONTENT_FILTERS.map((f) => (
          <Pressable key={f.id} style={[s.filterTab, filter === f.id && s.filterTabOn]} onPress={() => setFilter(f.id)}>
            <Text style={[s.filterTabText, filter === f.id && s.filterTabTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}>
        {q.isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />
        ) : shown.length === 0 ? (
          <Text style={s.emptyText}>
            {filter === "photos" ? "No public photos to promote yet." : filter === "reels" ? "No public reels to promote yet." : "You have no public content to promote yet."}
          </Text>
        ) : (
          <View style={s.videoGrid}>
            {shown.map((v) => {
              const on = selectedId === v.id;
              const isPhoto = v.media_type !== "video";
              return (
                <Pressable key={v.id} style={s.videoCard} onPress={() => onSelect(v)}>
                  <View style={[s.videoCardThumbWrap, on && { borderWidth: 2, borderColor: colors.brand }]}>
                    {v.thumbnail_url ? (
                      <Image source={{ uri: v.thumbnail_url }} style={s.videoCardThumb} contentFit="cover" />
                    ) : <View style={[s.videoCardThumb, s.thumbFallback]}>{isPhoto ? <Images size={18} color={colors.textFaint} /> : <Play size={18} color={colors.textFaint} />}</View>}
                    <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.videoCardShade} />
                    <View style={s.videoCardBadge}>
                      {isPhoto ? <Images size={11} color={colors.white} /> : <Play size={10} color={colors.white} fill={colors.white} strokeWidth={0} />}
                    </View>
                    {!isPhoto && !!v.duration && <View style={s.videoCardDur}><Text style={s.videoCardDurText}>{formatDuration(v.duration)}</Text></View>}
                    <View style={s.videoCardViews}>
                      <Text style={s.videoCardViewsText}>{formatCompact(v.views_count ?? 0)}</Text>
                    </View>
                    {on && <View style={s.videoCardCheck}><Check size={13} color={colors.white} strokeWidth={3} /></View>}
                  </View>
                  <Text style={s.videoCardTitle} numberOfLines={1}>{v.title || v.caption || `#${v.id}`}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

/* ───────────────────────────── styles ───────────────────────────── */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  topIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", marginLeft: -4 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  brandStudio: { fontSize: 16.5, fontWeight: font.weightHeavy, color: colors.brand, letterSpacing: -0.2, marginLeft: 3 },
  draftsBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  draftsText: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },

  progressWrap: { paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: spacing.md, gap: 8 },
  stepLabel: { fontSize: 13, fontWeight: font.weightBold, color: colors.textMuted },
  progressRow: { flexDirection: "row", gap: 6 },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#eceef1" },
  segOn: { backgroundColor: colors.brand },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  h1: { fontSize: 31, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.8, lineHeight: 36 },
  sub: { fontSize: 15, color: colors.textMuted, lineHeight: 21, marginTop: -4, marginBottom: 6 },

  /* Step 1 - goal cards (matched to the hi-fi design) */
  goalCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: "#eef0f2", paddingVertical: 15, paddingHorizontal: 15 },
  goalCardOn: { borderColor: colors.brand, backgroundColor: "#fff5f7" },
  goalIcon: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  playCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  goalTitle: { fontSize: 16.5, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.2 },
  goalDesc: { marginTop: 3, fontSize: 13.5, color: colors.textMuted, lineHeight: 18 },
  goalTip: { flexDirection: "row", alignItems: "center", gap: 13, backgroundColor: "#fff2f5", borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, marginTop: 4 },
  goalTipText: { flex: 1, fontSize: 13.5, color: colors.textSecondary, lineHeight: 18.5 },

  /* Option cards (placement / creative / payment) */
  optCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, padding: 13 },
  optCardOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  optIcon: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optLabel: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.text },
  optDesc: { marginTop: 2, fontSize: 12.5, color: colors.textMuted, lineHeight: 16 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#d6d9de", alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: "#d6d9de", alignItems: "center", justifyContent: "center" },
  checkboxOn: { borderColor: colors.brand, backgroundColor: colors.brand },

  /* Step 2 - numbered stepper */
  dotsRow: { flexDirection: "row", alignItems: "center" },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: "#d6d9de", backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  dotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dotText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textMuted },
  dotTextOn: { color: colors.white },
  dotLine: { flex: 1, height: 2, backgroundColor: "#e3e5e9", marginHorizontal: 2 },
  dotLineOn: { backgroundColor: colors.brand },

  /* Step 2 - placement cards */
  placeCard: { position: "relative", overflow: "hidden", flexDirection: "row", alignItems: "center", gap: 12, minHeight: 104, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1.5, borderColor: "#eef0f2", paddingVertical: 14, paddingLeft: 14, paddingRight: 84 },
  placeCardOn: { borderColor: colors.brand, backgroundColor: "#fff5f7" },
  placeTile: { width: 54, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: "#e5e7eb", backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  circlePlay: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.text, alignItems: "center", justifyContent: "center", paddingLeft: 1 },
  placeText: { flex: 1, gap: 4 },
  placeTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  placeTitle: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.2 },
  placeDesc: { fontSize: 13.5, color: colors.textMuted, lineHeight: 18 },
  hotBadge: { backgroundColor: "#ffe1e8", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  hotBadgeText: { fontSize: 11.5, fontWeight: font.weightHeavy, color: colors.brand },

  /* Step 2 - phone preview */
  phoneWrap: { position: "absolute", right: -4, top: 12 },
  phone: { width: 82, height: 150, borderRadius: 16, borderWidth: 3, borderColor: "#15151a", backgroundColor: colors.white, overflow: "hidden" },

  /* Compact placement preview (right side of each placement row) */
  miniPhone: { width: 34, height: 56, borderRadius: 8, borderWidth: 2, borderColor: "#15151a", backgroundColor: colors.white, overflow: "hidden" },
  miniNotch: { position: "absolute", top: 2, alignSelf: "center", left: 12, width: 10, height: 2.5, borderRadius: 2, backgroundColor: "#15151a", zIndex: 2 },
  miniScreen: { flex: 1, margin: 2, borderRadius: 4, overflow: "hidden", backgroundColor: "#eef0f4" },
  miniFull: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  miniPlay: { width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6, borderTopColor: "transparent", borderBottomColor: "transparent", borderLeftColor: colors.white, marginLeft: 2 },
  miniFeedDots: { position: "absolute", right: 3, gap: 2 },
  miniFeedDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.9)" },
  miniGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", padding: 2, gap: 2, alignContent: "flex-start" },
  miniCell: { width: 11, height: 11, borderRadius: 2 },
  miniPad: { flex: 1, padding: 3, gap: 3 },
  miniSearchBar: { height: 6, borderRadius: 2 },
  miniSearchRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  miniThumb: { width: 8, height: 8, borderRadius: 2 },
  miniLine: { height: 2.5, borderRadius: 1.5, backgroundColor: "#d3d7de" },
  miniAvatar: { width: 12, height: 12, borderRadius: 6, alignSelf: "center" },
  miniGridRow: { flexDirection: "row", justifyContent: "center", gap: 2, marginTop: 3 },
  miniCellSm: { width: 7, height: 7, borderRadius: 1.5 },
  phoneNotch: { position: "absolute", top: 4, left: 29, width: 22, height: 4, borderRadius: 2, backgroundColor: "#15151a", zIndex: 3 },
  phoneScreen: { flex: 1, backgroundColor: colors.white },
  pmImg: { flex: 1, backgroundColor: "#c3cad4" },
  pmTopTabs: { flexDirection: "row", justifyContent: "center", gap: 6, paddingTop: 12 },
  pmTab: { width: 18, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.5)" },
  pmTabOn: { backgroundColor: colors.white },
  pmDotsCol: { position: "absolute", right: 5, bottom: 20, gap: 6 },
  pmDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.9)" },
  pmPad: { flex: 1, padding: 6, paddingTop: 12, gap: 4 },
  pmAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#c3cad4", alignSelf: "center" },
  pmAvatarSm: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#c3cad4" },
  pmLine: { height: 4, borderRadius: 2, backgroundColor: "#dfe3e8" },
  pmStatsRow: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 2 },
  pmStat: { width: 12, height: 4, borderRadius: 2, backgroundColor: "#dfe3e8" },
  pmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3, marginTop: 3 },
  pmCell: { width: 19, height: 21, borderRadius: 3, backgroundColor: "#c3cad4" },
  pmHashRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 2 },
  pmHash: { fontSize: 13, fontWeight: font.weightHeavy, color: "#3a3f47" },
  pmSearchBar: { height: 11, borderRadius: 6, backgroundColor: "#eceef1", marginBottom: 3 },
  pmRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  pmThumb: { width: 16, height: 18, borderRadius: 3, backgroundColor: "#c3cad4" },
  pmRedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  pmTabsRow: { flexDirection: "row", gap: 5, marginBottom: 2 },
  pmTabSm: { width: 16, height: 4, borderRadius: 2, backgroundColor: "#dfe3e8" },

  /* Step 2 - info box */
  infoBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f2f3f5", borderRadius: 14, padding: 14, marginTop: 4 },
  infoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.text },
  infoDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginTop: 2 },

  /* Fields */
  fieldLabel: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text },
  fieldHint: { fontSize: 14, color: colors.textMuted, lineHeight: 19, marginTop: -2 },
  selectRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 13, height: 48 },
  selectText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: font.weightMedium, marginLeft: 0 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  pillOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  pillText: { fontSize: 13, fontWeight: font.weightBold, color: colors.textSecondary },
  pillTextOn: { color: colors.brand },
  addPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: "dashed" },
  addPillText: { fontSize: 13, fontWeight: font.weightBold, color: colors.textSecondary },

  segmented: { flexDirection: "row", backgroundColor: colors.bgMuted, borderRadius: 12, padding: 4, gap: 4 },
  segment: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: colors.brand },
  segmentText: { fontSize: 13, fontWeight: font.weightBold, color: colors.textSecondary },
  segmentTextOn: { color: colors.white },

  /* Step 3 - Location / choice pills / interest chips */
  locationRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, paddingHorizontal: 16, height: 56 },
  locationText: { flex: 1, fontSize: 16, fontWeight: font.weightBold, color: colors.text },
  choiceRow: { flexDirection: "row", gap: 9 },
  choicePill: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: "#e5e7eb", backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  choicePillTall: { height: 58 },
  choicePillOn: { borderColor: colors.brand, backgroundColor: "#fff0f4" },
  choiceText: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.textSecondary },
  choiceTextOn: { color: colors.brand },
  chip: { paddingHorizontal: 18, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#e5e7eb", backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  chipOn: { borderColor: colors.brand, backgroundColor: "#fff0f4" },
  chipText: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.textSecondary },
  chipTextOn: { color: colors.brand },
  addChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: "#e5e7eb", backgroundColor: colors.card },
  addChipText: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.textSecondary },

  audienceCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#f4f3f8", borderRadius: 16, padding: 16 },
  audienceIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  audienceLabel: { fontSize: 13, color: colors.textMuted, fontWeight: font.weightMedium },
  audienceValue: { fontSize: 26, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.5, marginTop: 1 },
  audiencePeople: { fontSize: 14, color: colors.textMuted, fontWeight: font.weightMedium, marginTop: 1 },
  audienceUnit: { fontSize: 12, fontWeight: font.weightBold, color: colors.textMuted },
  miniBars: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 32 },
  miniBar: { width: 6, borderRadius: 3 },
  estNote: { fontSize: 11.5, color: colors.textFaint, textAlign: "center" },
  estRow2: { flexDirection: "row", alignItems: "center", gap: 7 },
  estText: { fontSize: 13, color: colors.textFaint },

  /* Step 4 - Budget & Schedule */
  amountBox: { flexDirection: "row", alignItems: "center", height: 60, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, backgroundColor: colors.card, overflow: "hidden" },
  currencyBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, alignSelf: "stretch", justifyContent: "center" },
  currencyText: { fontSize: 15, fontWeight: font.weightBold, color: colors.text },
  amountDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#e5e7eb", marginVertical: 10 },
  amountInput: { flex: 1, alignSelf: "stretch", paddingHorizontal: 16, fontSize: 19, fontWeight: font.weightHeavy, color: colors.text },
  sliderHit: { height: 34, justifyContent: "center", marginTop: 14 },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: "#e6e8ec", overflow: "hidden" },
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
  sliderThumb: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, borderWidth: 6, borderColor: colors.brand, marginLeft: -12, shadowColor: colors.brand, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  sliderEnds: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  sliderEndText: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  fxNote: { marginTop: 10, textAlign: "center", fontSize: 12.5, color: colors.brand, fontWeight: font.weightBold },
  detailHead: { paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailHeadText: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: 0.2 },

  /* Review & Payment step (goal flows) */
  payHead: { marginTop: 4, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  payGoalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  payGoalCard: { width: "47.5%", flexGrow: 1, minHeight: 58, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8 },
  payGoalCardOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  payGoalLabel: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  payGoalSub: { fontSize: 10.5, fontWeight: font.weightBold, color: colors.brand },
  paySecure: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  paySecureText: { flex: 1, fontSize: 11.5, color: colors.textMuted, lineHeight: 15 },
  coinsNote: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: colors.brandTint, borderRadius: 12, padding: 12 },
  coinsNoteLow: { backgroundColor: "#fef2f2" },
  coinsNoteText: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: font.weightMedium, lineHeight: 16 },
  orderGoalCard: { marginTop: 12, backgroundColor: colors.bgMuted, borderRadius: 12, padding: 14 },
  orderGoalTitle: { fontSize: 12.5, fontWeight: font.weightHeavy, color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 },
  orderGoalLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  orderGoalVal: { fontSize: 13, color: colors.text, fontWeight: font.weightBold },
  orderGoalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderGoalK: { fontSize: 13, color: colors.textSecondary, fontWeight: font.weightMedium },
  orderGoalDivide: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 10 },
  orderGoalTotalK: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.text },
  orderGoalTotalV: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.brand },

  estCard: { backgroundColor: "#f5f5f8", borderRadius: 16, padding: 16, gap: 14 },
  estTitle: { fontSize: 14.5, fontWeight: font.weightHeavy, color: colors.text },
  estTitleAccent: { color: "#7c3aed" },
  estTitleMuted: { color: colors.textMuted, fontWeight: font.weightMedium, fontSize: 13 },
  estRow: { flexDirection: "row", alignItems: "flex-start" },
  estDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#e0e1e6", marginHorizontal: 16 },
  estLabel: { fontSize: 13, color: colors.textMuted, fontWeight: font.weightMedium },
  estValue: { fontSize: 22, fontWeight: font.weightHeavy, color: colors.text, marginTop: 4, letterSpacing: -0.5 },
  estUnit: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },

  scheduleBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, backgroundColor: colors.card, overflow: "hidden" },
  scheduleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 62, paddingHorizontal: 16 },
  scheduleRowBorder: { borderBottomWidth: 1, borderBottomColor: "#eef0f2" },
  scheduleSummary: { marginTop: 12, backgroundColor: colors.bgMuted, borderRadius: 12, padding: 14, gap: 8 },
  scheduleSummaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scheduleSummaryKey: { fontSize: 13, color: colors.textMuted },
  scheduleSummaryVal: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  scheduleSummaryTotal: { marginTop: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  scheduleSummaryTotalKey: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.text },
  scheduleSummaryTotalVal: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.brand },
  scheduleKey: { fontSize: 15, color: colors.text, fontWeight: font.weightMedium },
  scheduleVal: { flexDirection: "row", alignItems: "center", gap: 9 },
  scheduleValText: { fontSize: 15, fontWeight: font.weightBold, color: colors.text },

  tipBox: { flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: "#fff2f5", borderRadius: 14, padding: 16 },
  tipLabel: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.brand, marginBottom: 3, letterSpacing: 0.3 },
  tipDesc: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },

  /* Step 5 - Ad creative */
  subLabel: { fontSize: 13.5, color: colors.textMuted, fontWeight: font.weightMedium, marginTop: -2 },
  optLabelGray: { color: colors.textMuted, fontWeight: font.weightMedium },
  creativeCard: { flexDirection: "row", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, padding: 12 },
  creativeThumbWrap: { width: 104, height: 74, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" },
  creativeThumb: { width: "100%", height: "100%" },
  thumbFallback: { backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  creativePlay: { position: "absolute", top: "50%", left: "50%", width: 28, height: 28, borderRadius: 14, marginTop: -14, marginLeft: -14, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  creativeDur: { position: "absolute", bottom: 5, right: 5, backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  creativeDurText: { color: colors.white, fontSize: 10, fontWeight: font.weightBold },
  creativeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  creativeName: { flex: 1, fontSize: 14.5, fontWeight: font.weightHeavy, color: colors.text },
  creativeMeta: { marginTop: 3, fontSize: 12.5, color: colors.textMuted },
  creativeActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  creativeBtn: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  creativeBtnText: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  creativePick: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", borderRadius: 14, padding: spacing.md },
  creativePickIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },

  /* Step 5 - Thumbnail row */
  thumbRow: { flexDirection: "row", gap: 10 },
  thumbTile: { flex: 1, height: 68, borderRadius: 10, overflow: "hidden", backgroundColor: colors.bgMuted },
  thumbImg: { width: "100%", height: "100%" },
  thumbAdd: { flex: 1, height: 68, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },

  /* Step 5 - Ad details (label left, field right) */
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  detailLabel: { width: 104, fontSize: 13.5, color: colors.textMuted, fontWeight: font.weightMedium },
  detailField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, height: 50, backgroundColor: colors.card },

  /* CTA button icon-tile grid */
  ctaGridSub: { fontSize: 12.5, color: colors.textMuted, marginTop: -4, marginBottom: 4 },
  ctaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ctaTile: {
    width: "31%", flexGrow: 1, minWidth: 96, height: 74, borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb",
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center", gap: 7,
  },
  ctaTileOn: { borderColor: colors.brand, backgroundColor: colors.brandTint, borderWidth: 1.5 },
  ctaTileDot: { position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  ctaTileText: { fontSize: 12, fontWeight: font.weightBold, color: colors.textSecondary },
  ctaTileTextOn: { color: colors.brand },
  ctaDestField: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, height: 50, backgroundColor: colors.card },
  ctaDestInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  detailInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  detailValue: { flex: 1, fontSize: 14, fontWeight: font.weightMedium, color: colors.text },
  detailCounter: { fontSize: 12, color: colors.textFaint, fontVariant: ["tabular-nums"] },

  inLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inLabel: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  inCounter: { fontSize: 11, color: colors.textFaint, fontVariant: ["tabular-nums"] },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 11, paddingHorizontal: 13, height: 46, fontSize: 14, color: colors.text },
  inputMultiline: { height: 72, paddingTop: 12, textAlignVertical: "top" },
  urlRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 11, paddingHorizontal: 13, height: 46 },
  urlInput: { flex: 1, fontSize: 14, color: colors.text },

  previewCard: { height: 185, borderRadius: 16, overflow: "hidden", backgroundColor: "#111" },
  previewThumb: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  previewTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 26 },
  previewAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#1a1a20", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  previewAvatarText: { color: colors.white, fontSize: 15, fontWeight: font.weightHeavy },
  previewName: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.white },
  previewSponsored: { fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginTop: 1 },
  previewChevron: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  previewBottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 24, paddingBottom: 12, gap: 8, justifyContent: "flex-end" },
  previewHeadline: { color: colors.white, fontSize: 14, fontWeight: font.weightBold },
  previewCtaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 10 },
  previewCtaText: { color: colors.white, fontSize: 13.5, fontWeight: font.weightHeavy },

  /* Calendar date picker */
  cal: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  calNav: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted },
  calNavOff: { opacity: 0.4 },
  calMonth: { fontSize: 15.5, fontWeight: font.weightHeavy, color: colors.text },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calWeekday: { width: "14.2857%", textAlign: "center", fontSize: 11, fontWeight: font.weightBold, color: colors.textFaint },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: "14.2857%", aspectRatio: 1, alignItems: "center", justifyContent: "center", paddingVertical: 2 },
  calDay: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  calDayOn: { backgroundColor: colors.brand },
  calDayText: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  calDayTextOn: { color: colors.white },
  calDayTextOff: { color: colors.textFaint, opacity: 0.4 },

  /* Choose-content grid popup (3-col reels/photos) */
  sheetSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  filterTab: { paddingHorizontal: 16, height: 32, borderRadius: radius.pill, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  filterTabOn: { backgroundColor: colors.brand },
  filterTabText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  filterTabTextOn: { color: colors.white },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  videoCard: { width: "31%" },
  videoCardThumbWrap: { width: "100%", aspectRatio: 9 / 16, borderRadius: 11, overflow: "hidden", backgroundColor: colors.bgMuted, position: "relative" },
  videoCardThumb: { width: "100%", height: "100%" },
  videoCardShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" },
  videoCardBadge: { position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  videoCardDur: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  videoCardDurText: { color: colors.white, fontSize: 9.5, fontWeight: font.weightBold },
  videoCardViews: { position: "absolute", left: 6, bottom: 6 },
  videoCardViewsText: { color: colors.white, fontSize: 10.5, fontWeight: font.weightBold },
  videoCardCheck: { position: "absolute", bottom: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.white },
  videoCardTitle: { marginTop: 5, fontSize: 11, fontWeight: font.weightBold, color: colors.text },

  /* Review */
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: "#eef0f2", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14 },
  reviewIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  reviewIconRound: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingLeft: 1 },
  reviewLabel: { fontSize: 13.5, color: colors.textMuted, fontWeight: font.weightMedium },
  reviewValue: { marginTop: 3, fontSize: 15.5, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 20 },
  editBtn: { padding: 4 },
  reviewNote: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f5f5f8", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  reviewNoteText: { flex: 1, fontSize: 13, color: colors.textMuted },

  /* Step 7 - Payment method tiles */
  payGrid: { flexDirection: "row", gap: 10 },
  payTile: { flex: 1, height: 88, borderRadius: 12, borderWidth: 1.5, borderColor: "#e5e7eb", backgroundColor: colors.card, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 4 },
  payTileOn: { borderColor: colors.brand, backgroundColor: "#fff0f4" },
  payTop: { height: 24, alignItems: "center", justifyContent: "center" },
  payTileLabel: { fontSize: 11.5, fontWeight: font.weightBold, color: colors.text, textAlign: "center", lineHeight: 15 },
  payBrandRow: { flexDirection: "row", alignItems: "center" },
  payBrandText: { fontSize: 15, fontWeight: font.weightHeavy },

  /* Step 7 - Saved cards */
  savedCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderWidth: 1.5, borderColor: "#eef0f2", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  savedCardOn: { borderColor: colors.brand, backgroundColor: "#fff5f7" },
  savedCardName: { fontSize: 15, fontWeight: font.weightBold, color: colors.text },
  savedDots: { color: colors.textMuted, letterSpacing: 1 },
  savedCardExp: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  savedCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  savedRadio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#d6d9de" },
  brandBox: { width: 46, height: 32, borderRadius: 6, backgroundColor: "#f1f3f8", alignItems: "center", justifyContent: "center" },
  visaText: { color: "#1a1f71", fontSize: 12, fontWeight: font.weightHeavy, fontStyle: "italic", letterSpacing: 0.3 },
  amexText: { color: colors.white, fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 0.3 },
  mcRow: { flexDirection: "row", alignItems: "center" },
  mcCircle: { width: 18, height: 18, borderRadius: 9 },
  addCardBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: "dashed", alignSelf: "flex-start", paddingHorizontal: 18 },
  addCardText: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  twoCol: { flexDirection: "row", gap: spacing.sm },

  /* Step 7 - Order summary */
  orderCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: "#eef0f2", borderRadius: 16, padding: 16, gap: 12 },
  orderTitle: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.text, marginBottom: 2 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryRowK: { fontSize: 14, color: colors.textSecondary },
  summaryRowV: { flex: 1, textAlign: "right", fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  orderDivide: { height: 1, backgroundColor: "#eef0f2", marginVertical: 2 },
  orderDivideBold: { height: 1, backgroundColor: "#e0e1e6", marginVertical: 2 },
  orderLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderTaxK: { flexDirection: "row", alignItems: "center", gap: 5 },
  orderK: { fontSize: 14, color: colors.textMuted, fontWeight: font.weightMedium },
  orderV: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  orderTotalK: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text },
  orderTotalV: { fontSize: 18, fontWeight: font.weightHeavy, color: colors.brand },

  /* Step 7 - Billing + security */
  billingRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14 },
  billingTitle: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.text },
  billingSub: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  securityBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f5f5f8", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  securityIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  securityTitle: { fontSize: 13, color: colors.textSecondary, fontWeight: font.weightMedium, lineHeight: 17 },
  securitySub: { marginTop: 1, fontSize: 11.5, color: colors.textFaint },

  /* legacy - kept for the unused SummaryLine helper */
  summaryLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryK: { fontSize: 13, color: colors.textMuted, fontWeight: font.weightMedium },
  summaryV: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },

  terms: { fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 17, marginTop: 10 },
  termsLink: { color: colors.brand, fontWeight: font.weightBold },

  /* ── "More Followers" flow ── */
  followOpt: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, padding: 14, backgroundColor: colors.card },
  followOptOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  followOptIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  followOptTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  followOptTitle: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.text },
  followOptDesc: { marginTop: 3, fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },
  recBadge: { backgroundColor: colors.brandTint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  recBadgeText: { fontSize: 10, fontWeight: font.weightHeavy, color: colors.brand },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  orText: { fontSize: 12, fontWeight: font.weightBold, color: colors.textFaint },

  vidRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 10, backgroundColor: colors.card },
  vidRowOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  vidThumb: { width: 44, height: 56, borderRadius: 8, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  vidTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  vidMeta: { marginTop: 2, fontSize: 11.5, color: colors.textFaint },
  followEmptyNote: { fontSize: 12, color: colors.textMuted, textAlign: "center", paddingVertical: 4 },

  audDetailCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, gap: 4, marginTop: 4 },
  audDetailTitle: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.text, marginBottom: 6 },
  audDetailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  audDetailKey: { fontSize: 13, color: colors.textMuted },
  audDetailVal: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },

  followPlace: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, padding: 14, backgroundColor: colors.card },
  followPlaceOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  followPlaceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  followPlaceTitle: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.text },
  followPlaceDesc: { marginTop: 2, fontSize: 12, color: colors.textMuted },

  estFollowValue: { fontSize: 26, fontWeight: font.weightHeavy, color: "#16a34a", textAlign: "center" },
  estFollowNote: { fontSize: 11.5, color: colors.textMuted, textAlign: "center" },

  followCard: { backgroundColor: "#0f0f14", borderRadius: 20, padding: 22, alignItems: "center", gap: 5 },
  followCardAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#1c1c24", borderWidth: 2, borderColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  followCardNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  followCardName: { fontSize: 16, fontWeight: font.weightHeavy, color: "#ffffff" },
  followCardStat: { fontSize: 13, fontWeight: font.weightBold, color: "#d1d5db" },
  followCardCat: { fontSize: 12, color: "#9ca3af" },
  followCardBtn: { marginTop: 10, backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 40, paddingVertical: 11 },
  followCardBtnText: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.white },

  followTextGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  followTextTile: { width: "47%", flexGrow: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  followTextTileOn: { borderColor: colors.brand, backgroundColor: colors.brandTint, borderWidth: 1.5 },
  followTextTileText: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.textSecondary },
  followTextTileTextOn: { color: colors.brand },

  termsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, paddingVertical: 4 },
  termsCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  termsCheckOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  termsRowText: { fontSize: 13.5, color: colors.textSecondary, fontWeight: font.weightMedium },

  /* ── "More Video Views" flow ── */
  selCountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selCountLabel: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.text },
  selCountVal: { fontSize: 13, fontWeight: font.weightBold, color: colors.brand },
  estViewsUnit: { fontSize: 13, fontWeight: font.weightBold, color: colors.textSecondary, textAlign: "center", marginTop: -6 },
  vsDropdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 16, height: 52, backgroundColor: colors.card },
  vsDropdownText: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.text },

  /* ── "Website Traffic" flow ── */
  previewLink: { fontSize: 13, fontWeight: font.weightBold, color: colors.brand },
  utmRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  utmLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  utmDesc: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  webPreviewCard: { borderRadius: 16, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  webPreviewImg: { width: "100%", height: 150, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  webPreviewBadge: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  webPreviewBadgeText: { fontSize: 10.5, fontWeight: font.weightBold, color: colors.white },
  webPreviewBody: { padding: 14, gap: 8 },
  webPreviewHeadline: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 20 },
  webPreviewUrl: { fontSize: 12.5, color: colors.textMuted },
  webPreviewCta: { marginTop: 4, backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  webPreviewCtaText: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.white },

  /* ── "Messages" flow ── */
  msgGreetingBox: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: 14, backgroundColor: colors.card, gap: 6 },
  msgGreetingInput: { fontSize: 14, color: colors.text, minHeight: 60, textAlignVertical: "top", padding: 0 },
  msgGreetingCounter: { fontSize: 11, color: colors.textFaint, alignSelf: "flex-end" },
  msgHint: { fontSize: 12, color: colors.textMuted },
  quickReplyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: colors.card },
  quickReplyInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  addQuickReply: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 12, borderWidth: 1, borderColor: "#fecdd3", backgroundColor: colors.brandTint },
  addQuickReplyText: { fontSize: 13, fontWeight: font.weightBold, color: colors.brand },
  msgActionNote: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandTint, borderRadius: 12, padding: 12 },
  msgActionNoteText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, fontWeight: font.weightMedium },
  msgPreviewHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  msgPreviewAvatarWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  msgPreviewAvatar: { width: 32, height: 32, borderRadius: 16 },
  msgPreviewBrand: { fontSize: 13.5, fontWeight: font.weightHeavy, color: colors.text },
  msgPreviewSponsored: { fontSize: 11, color: colors.textMuted },
  shownInCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 8 },
  shownInLabel: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.text, marginBottom: 2 },
  shownInRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  shownInDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  shownInText: { fontSize: 13, color: colors.textSecondary, fontWeight: font.weightMedium },

  /* ── "App Installs" flow ── */
  platformLabel: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  changeCreativeBtn: { alignSelf: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 9, marginTop: 4 },
  changeCreativeText: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  vsDropdownCaption: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  /* ── "Sales / Conversions" flow ── */
  radioListRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  radioListText: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: font.weightMedium },
  pixelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, paddingHorizontal: 16, height: 52, backgroundColor: colors.card },
  pixelName: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  pixelActive: { flexDirection: "row", alignItems: "center", gap: 6 },
  pixelDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  pixelActiveText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.success },

  /* Footer */
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  nextBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 56, borderRadius: 16 },
  nextText: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.white },

  /* Success screen (light) */
  successScroll: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  successHero: { height: 176, alignItems: "center", justifyContent: "center", marginTop: 12 },
  confetti: { position: "absolute" },
  successCheck: { width: 118, height: 118, borderRadius: 59, alignItems: "center", justifyContent: "center", shadowColor: colors.brand, shadowOpacity: 0.4, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  successTitle: { fontSize: 31, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center", letterSpacing: -0.6, marginTop: 6 },
  successSub: { fontSize: 15.5, color: colors.textMuted, textAlign: "center", lineHeight: 22, marginTop: 10, paddingHorizontal: 16 },

  doneCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: "#eef0f2", borderRadius: 18, padding: 16, marginTop: 26 },
  doneTop: { flexDirection: "row", gap: 14 },
  doneThumb: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.bgMuted },
  doneTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  doneTitle: { flex: 1, fontSize: 17, fontWeight: font.weightHeavy, color: colors.text, lineHeight: 22 },
  underReview: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#dcfce7", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  underReviewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },
  underReviewText: { fontSize: 12.5, fontWeight: font.weightBold, color: "#16a34a" },
  doneMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" },
  doneMetaText: { fontSize: 13, color: colors.textSecondary, fontWeight: font.weightMedium },
  doneMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textFaint, marginHorizontal: 2 },
  doneDivide: { height: 1, backgroundColor: "#eef0f2", marginVertical: 14 },
  doneStats: { flexDirection: "row" },
  statCol: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 3 },
  statColDivide: { width: 1, backgroundColor: "#eef0f2" },
  statColLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statColValue: { fontSize: 12.5, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center", lineHeight: 16 },

  wnCard: { backgroundColor: "#f5f5f8", borderRadius: 18, padding: 14, marginTop: 26, gap: 10 },
  wnTitle: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text, marginBottom: 2 },
  wnRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: "#eef0f2", paddingVertical: 12, paddingHorizontal: 12 },
  wnIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  wnText: { flex: 1, fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  successPrimary: { alignItems: "center", justifyContent: "center", height: 56, borderRadius: 16 },
  successPrimaryText: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.white },
  successOutline: { height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", marginTop: 12 },
  successOutlineText: { fontSize: 15, fontWeight: font.weightBold, color: colors.text },

  /* Sheets */
  sheetTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center", paddingVertical: spacing.md },
  sheetSearch: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: 12, height: 42, borderRadius: 11, backgroundColor: colors.bgMuted },
  sheetSearchInput: { flex: 1, fontSize: 14, color: colors.text },
  sheetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sheetRowText: { fontSize: 14.5, color: colors.text, flex: 1 },
  sheetRowTextOn: { color: colors.brand, fontWeight: font.weightBold },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  videoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  videoThumb: { width: 44, height: 54, borderRadius: 8 },
  videoTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  videoMeta: { marginTop: 1, fontSize: 11.5, color: colors.textFaint },
});
