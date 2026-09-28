import {
  Award, BarChart3, CheckCircle2, Clock, Coins, Crown, DollarSign, Eye, Flag,
  Gem, Gift, Handshake, Heart, Megaphone, Package, Percent, Rocket, Shield,
  ShieldCheck, Sparkles, Star, Store, Target, ThumbsUp, TrendingUp, Trophy,
  Users, Video, Wallet, Zap,
  type LucideIcon,
} from "lucide-react-native";

/**
 * Mirrors the server's curated icon set (MonetizationProgram::FEATURE_ICONS)
 * exactly, name for name - an admin's `features[].icon` string is looked up
 * here to render a programme's bullet icons (Gifts & Coins, Sell on Teezer,
 * Creator Rewards). An unrecognised name (the server should never send one,
 * but a stale client or a future icon added only server-side could) falls
 * back to Star rather than rendering nothing.
 */
export const FEATURE_ICON_MAP: Record<string, LucideIcon> = {
  Gift, Wallet, Star, Trophy, Award, BarChart3, TrendingUp, Users, Heart,
  Coins, DollarSign, Percent, CheckCircle2, Zap, Shield, ShieldCheck, Store,
  Package, Video, Eye, Clock, Target, Sparkles, Rocket, Crown, Gem, ThumbsUp,
  Handshake, Megaphone, Flag,
};

export function featureIcon(name: string): LucideIcon {
  return FEATURE_ICON_MAP[name] ?? Star;
}
