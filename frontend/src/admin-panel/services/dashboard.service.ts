import { api } from "./api";

export type DateRange = "7d" | "30d" | "90d";

/* ── Types ────────────────────────────────────────────────────────────────── */
export interface OverviewData {
  totalUsers: number;
  activeCreators: number;
  totalVideos: number;
  liveSessions: number;
  totalCoinsTransacted: number;
  platformRevenue: number;
  growth: {
    users: number;
    creators: number;
    videos: number;
    liveSessions: number;
    coins: number;
    revenue: number;
  };
}

export interface AnalyticsData {
  labels: string[];
  users: number[];
  videos: number[];
  coins: number[];
  revenue: number[];
}

export interface RevenueBreakdown {
  label: string;
  value: number;
  growth: number;
  color: string;
}

export interface RevenueData {
  totalRevenue: number;
  growth: number;
  breakdown: RevenueBreakdown[];
}

export interface Transaction {
  id: string;
  userName: string;
  username: string;
  avatar: string | null;
  type: string;
  coins: number | null;
  amountUsd: number;
  status: string;
  date: string;
}

export interface TopCreator {
  rank: number;
  name: string;
  username: string;
  avatar: string | null;
  coins: number;
  growth: number;
}

export interface SystemStatus {
  serverStatus: string;
  databaseStatus: string;
  storageUsage: number;
  apiResponseMs: number;
  activeSessions: number;
  supportTickets: number;
  apiSparkline: number[];
  sessionSparkline: number[];
  ticketSparkline: number[];
}

export interface MiniMetrics {
  newUsers: number;
  newVideos: number;
  liveViews: number;
  coinsSold: number;
  revenue: number;
  growth: {
    newUsers: number;
    newVideos: number;
    liveViews: number;
    coinsSold: number;
    revenue: number;
  };
  sparklines: {
    newUsers: number[];
    newVideos: number[];
    liveViews: number[];
    coinsSold: number[];
    revenue: number[];
  };
}

/* ── Fallback data (shown when API is unreachable - always zeros, never fake) ─ */
const FALLBACK_OVERVIEW: OverviewData = {
  totalUsers: 0, activeCreators: 0, totalVideos: 0, liveSessions: 0,
  totalCoinsTransacted: 0, platformRevenue: 0,
  growth: { users:0, creators:0, videos:0, liveSessions:0, coins:0, revenue:0 },
};

const FALLBACK_ANALYTICS: AnalyticsData = {
  labels: [], users: [], videos: [], coins: [], revenue: [],
};

const FALLBACK_REVENUE: RevenueData = {
  totalRevenue: 0, growth: 0,
  breakdown: [
    { label:"Coins Revenue",        value:0, growth:0, color:"#3b82f6" },
    { label:"Subscription Revenue", value:0, growth:0, color:"#fd4605" },
    { label:"Promotion Revenue",    value:0, growth:0, color:"#f59e0b" },
    { label:"Other Revenue",        value:0, growth:0, color:"#10b981" },
  ],
};

const FALLBACK_TRANSACTIONS: Transaction[] = [];

const FALLBACK_TOP_CREATORS: TopCreator[] = [];

const FALLBACK_SYSTEM: SystemStatus = {
  serverStatus:"unknown", databaseStatus:"unknown",
  storageUsage:0, apiResponseMs:0, activeSessions:0, supportTickets:0,
  apiSparkline:[], sessionSparkline:[], ticketSparkline:[],
};

const FALLBACK_MINI: MiniMetrics = {
  newUsers:0, newVideos:0, liveViews:0, coinsSold:0, revenue:0,
  growth:{ newUsers:0, newVideos:0, liveViews:0, coinsSold:0, revenue:0 },
  sparklines:{ newUsers:[], newVideos:[], liveViews:[], coinsSold:[], revenue:[] },
};

/* ── Service ─────────────────────────────────────────────────────────────── */
async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); }
  catch { return fallback; }
}

export const dashboardService = {
  overview: (range: DateRange = "7d") =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:OverviewData}>(`/admin/dashboard/overview?range=${range}`);
      return data.data;
    }, FALLBACK_OVERVIEW),

  analytics: (range: DateRange = "7d") =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:AnalyticsData}>(`/admin/dashboard/analytics?range=${range}`);
      return data.data;
    }, FALLBACK_ANALYTICS),

  revenue: (range: DateRange = "7d") =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:RevenueData}>(`/admin/dashboard/revenue?range=${range}`);
      return data.data;
    }, FALLBACK_REVENUE),

  recentTransactions: (limit = 5) =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:Transaction[]}>(`/admin/dashboard/recent-transactions?limit=${limit}`);
      return data.data;
    }, FALLBACK_TRANSACTIONS),

  topCreators: (limit = 5) =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:TopCreator[]}>(`/admin/dashboard/top-creators?limit=${limit}`);
      return data.data;
    }, FALLBACK_TOP_CREATORS),

  systemStatus: () =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:SystemStatus}>(`/admin/dashboard/system-status`);
      return data.data;
    }, FALLBACK_SYSTEM),

  miniMetrics: (range: DateRange = "7d") =>
    safeFetch(async () => {
      const { data } = await api.get<{success:boolean;data:MiniMetrics}>(`/admin/dashboard/mini-metrics?range=${range}`);
      return data.data;
    }, FALLBACK_MINI),
};
