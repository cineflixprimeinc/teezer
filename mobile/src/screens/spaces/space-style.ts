import {
  AudioLines, Baby, Bitcoin, BookOpen, Briefcase, Camera, Car, Church,
  CircleDollarSign, Clapperboard, Dumbbell, Flame, FlaskConical, Gamepad2,
  GraduationCap, Heart, HeartPulse, Landmark, Laugh, Megaphone, Mic, Monitor,
  Music, Newspaper, Palette, PawPrint, Plane, Rocket, Shirt, Sparkles,
  TrendingUp, Trophy, UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";

/**
 * The look of a Space, decided here rather than by the server.
 *
 * GET /spaces sends facts - who is hosting, how many are listening, what the
 * topic is. Which gradient rings an avatar, which tint stands in for cover art
 * nobody has uploaded, and which glyph a topic wears are presentation, so they
 * live with the screen. That is also why the API has no `ring`/`tint`/`icon`
 * fields to keep in sync.
 */

/**
 * The dark palette every in-room screen shares.
 *
 * The design puts the whole flow - room, people, chat, listeners, requests - on
 * the same near-black ground, not just the room. Pulling it into one token set
 * keeps those five screens reading as one place with the lights off, instead of
 * five screens that each re-picked their own greys.
 */
export const SPACE_DARK = {
  /** Screen ground - flat black for the list screens, the room gradients over it. */
  bg: "#0c0a11",
  gradTop: "#241033",
  gradBottom: "#0c0713",
  /** A raised surface: message bubbles, the pinned banner, cards. */
  panel: "#17141e",
  panelHi: "#201b2b",
  line: "rgba(255,255,255,0.08)",
  text: "#ffffff",
  dim: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.42)",
  glass: "rgba(255,255,255,0.08)",
  glassLine: "rgba(255,255,255,0.13)",
  brand: "#fe2c55",
  brandSoft: "rgba(254,44,85,0.16)",
  green: "#28c76f",
  greenSoft: "rgba(40,199,111,0.16)",
  purple: "#8b5cf6",
  purpleSoft: "rgba(139,92,246,0.20)",
} as const;

/**
 * The Spaces tab's own light surfaces.
 *
 * The browse page is the one Spaces screen with the lights ON, so it cannot
 * borrow SPACE_DARK above, and the app's global tokens are a shade cooler than
 * this design's warm greys. These are the design's values, kept here so the
 * page, its filter sheet and its settings sheet stay one surface.
 *
 * Brand pink is the app's #fe2c55 rather than the mockup's #f5194e - every
 * other screen accents in the app's red, and a Spaces-only pink would read as a
 * bug rather than a decision (the same call the old Spaces screen made).
 */
export const SPACE_LIGHT = {
  /** A grouped list's container - Scheduled rows, settings groups. */
  group: "#f7f7f9",
  /** A resting icon button / inactive chip. */
  chip: "#f2f2f4",
  /** A live card's ground. */
  card: "#f7f7f9",
  /** The pink wash behind the LIVE pill and the filter banner. */
  brandWash: "#fdeaef",
  /** Readable pink on brandWash - the plain brand is too light on it. */
  brandInk: "#a3123c",
  text: "#111111",
  dim: "#8a8a90",
  faint: "#9a9aa0",
  /** A section label above a group of options. */
  label: "#a0a0a6",
  line: "#e4e4e8",
  chevron: "#c4c4ca",
} as const;

/** The quick-react emoji under a chat message - a fixed, tappable set. */
export const REACTION_EMOJIS = ["❤️", "👏", "😂", "🔥", "😮", "🙌"] as const;

/** A role's badge label + colour, shared by every list that shows one. */
export function roleBadge(role: "host" | "speaker" | "listener"): { label: string; color: string } {
  if (role === "host") return { label: "Host", color: SPACE_DARK.brand };
  if (role === "speaker") return { label: "Speaker", color: "#ff6b8a" };
  return { label: "Listener", color: SPACE_DARK.faint };
}

/** Speaker ring gradients, cycled by the participant's position. */
export const RING_GRADIENTS: readonly (readonly [string, string])[] = [
  ["#ff9f43", "#fe2c55"],
  ["#c084fc", "#fe2c55"],
  ["#818cf8", "#c084fc"],
];

/** The ring a listener gets - flat grey, so speakers are the ones that glow. */
export const LISTENER_RING: readonly [string, string] = ["#e5e7eb", "#e5e7eb"];

/** Cover-art stand-ins, cycled by row (the same trick ExploreScreen uses for
 *  hashtags, which have no artwork either). */
export const COVER_TINTS: readonly (readonly [string, string])[] = [
  ["#f43f5e", "#7c3aed"],
  ["#f97316", "#be123c"],
  ["#6366f1", "#a855f7"],
  ["#0ea5e9", "#6366f1"],
];

export type SpaceTopic = {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
};

/**
 * The topic chips, in the order they scroll past.
 *
 * "trending" leads and is not a topic the API stores - it is the unfiltered
 * view, which the server reads as "no filter". Each id is what lands in
 * spaces.topic, so adding a chip here is all it takes to filter on it; the
 * endpoint matches the column and needs no change.
 *
 * Each colour is the chip's resting glyph tint - the active chip drops it for
 * brand pink, so the row has one accent at a time.
 */
export const SPACE_TOPICS: SpaceTopic[] = [
  { id: "trending", label: "Trending", icon: TrendingUp, color: "#fe2c55" },
  { id: "business", label: "Business", icon: Briefcase, color: "#6366f1" },
  { id: "music", label: "Music", icon: Music, color: "#f97316" },
  { id: "technology", label: "Technology", icon: Monitor, color: "#0ea5e9" },
  { id: "health", label: "Health", icon: HeartPulse, color: "#16a34a" },
  { id: "gaming", label: "Gaming", icon: Gamepad2, color: "#a855f7" },
  { id: "sports", label: "Sports", icon: Trophy, color: "#0891b2" },
  { id: "comedy", label: "Comedy", icon: Laugh, color: "#eab308" },
  { id: "education", label: "Education", icon: GraduationCap, color: "#4f46e5" },
  { id: "news", label: "News", icon: Newspaper, color: "#64748b" },
  { id: "art", label: "Art & Design", icon: Palette, color: "#db2777" },
  { id: "food", label: "Food", icon: UtensilsCrossed, color: "#ea580c" },
  { id: "travel", label: "Travel", icon: Plane, color: "#0ea5e9" },
  { id: "finance", label: "Finance", icon: CircleDollarSign, color: "#059669" },
  { id: "film", label: "Film & TV", icon: Clapperboard, color: "#7c3aed" },
  { id: "wellness", label: "Wellness", icon: Sparkles, color: "#14b8a6" },
  { id: "fashion", label: "Fashion & Beauty", icon: Shirt, color: "#ec4899" },
  { id: "science", label: "Science", icon: FlaskConical, color: "#0d9488" },
  { id: "crypto", label: "Crypto & Web3", icon: Bitcoin, color: "#f59e0b" },
  { id: "startups", label: "Startups", icon: Rocket, color: "#ef4444" },
  { id: "marketing", label: "Marketing", icon: Megaphone, color: "#8b5cf6" },
  { id: "relationships", label: "Relationships", icon: Heart, color: "#e11d48" },
  { id: "motivation", label: "Motivation", icon: Flame, color: "#f97316" },
  { id: "books", label: "Books & Writing", icon: BookOpen, color: "#0284c7" },
  { id: "photography", label: "Photography", icon: Camera, color: "#6366f1" },
  { id: "politics", label: "Politics", icon: Landmark, color: "#475569" },
  { id: "parenting", label: "Parenting", icon: Baby, color: "#14b8a6" },
  { id: "pets", label: "Pets & Animals", icon: PawPrint, color: "#d97706" },
  { id: "cars", label: "Cars & Autos", icon: Car, color: "#0891b2" },
  { id: "fitness", label: "Fitness", icon: Dumbbell, color: "#16a34a" },
  { id: "spirituality", label: "Spirituality", icon: Church, color: "#a855f7" },
];

/**
 * A room's cover glyph, from its topic. Kept separate from the chip icons on
 * purpose: a chip is a filter (Trending wears an arrow), while a cover stands
 * in for artwork and should say what the room IS - so trending rooms get a mic,
 * not an arrow. Anything unrecognised falls back to the audio meter.
 */
const TOPIC_ICONS: Record<string, LucideIcon> = {
  trending: Mic,
  business: Briefcase,
  music: Music,
  technology: Camera,
  health: HeartPulse,
  gaming: Gamepad2,
  sports: Trophy,
  comedy: Laugh,
  education: GraduationCap,
  news: Newspaper,
  art: Palette,
  food: UtensilsCrossed,
  travel: Plane,
  finance: CircleDollarSign,
  film: Clapperboard,
  wellness: Sparkles,
  fashion: Shirt,
  science: FlaskConical,
  crypto: Bitcoin,
  startups: Rocket,
  marketing: Megaphone,
  relationships: Heart,
  motivation: Flame,
  books: BookOpen,
  photography: Camera,
  politics: Landmark,
  parenting: Baby,
  pets: PawPrint,
  cars: Car,
  fitness: Dumbbell,
  spirituality: Church,
};

export function topicIcon(topic: string | null): LucideIcon {
  return (topic && TOPIC_ICONS[topic]) || AudioLines;
}
