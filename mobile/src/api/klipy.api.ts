import axios from "axios";
import { config } from "@/constants/config";

/**
 * Klipy - the GIF provider behind the comment GIF picker.
 *
 * Called over plain REST rather than through an SDK. The two packages on npm
 * (`klipy-sdk`, `react-native-klipy`) are both third-party rather than Klipy's
 * own, and the React Native one is a native TurboModule - which cannot run in
 * Expo Go at all. This is ~40 lines against an endpoint that is already
 * verified working, with no native code and nothing new to trust.
 *
 * Its own axios instance, NOT the app client: that one attaches the Teezer
 * bearer token and base URL to every request, and neither belongs on a call to
 * a third party.
 *
 * Contract (established by probing the live API - docs.klipy.com 403s):
 *   GET https://api.klipy.com/api/v1/{KEY}/gifs/trending?customer_id&page&per_page
 *   GET https://api.klipy.com/api/v1/{KEY}/gifs/search?q&customer_id&page&per_page
 * The key is a PATH segment. The payload nests twice: `data.data` is the array.
 */

const BASE = "https://api.klipy.com/api/v1";

/** Klipy sizes each item into hd/md/sm/xs, and each format into an object. */
interface KlipyFile {
  url?: string | null;
  width?: number | null;
  height?: number | null;
}
interface KlipyVariant {
  gif?: KlipyFile;
  webp?: KlipyFile;
  mp4?: KlipyFile;
}
interface KlipyItem {
  id: number | string;
  slug?: string | null;
  title?: string | null;
  file?: Partial<Record<"hd" | "md" | "sm" | "xs", KlipyVariant>>;
}

/** What the picker renders and what a posted comment carries. */
export interface Gif {
  id: string;
  title: string;
  /** Full-size GIF - what the comment stores and other viewers load. */
  url: string;
  /** Small GIF for the picker grid and the comment's inline preview. */
  previewUrl: string;
  width: number;
  height: number;
}

const client = axios.create({ timeout: 15_000 });

/** First size that actually has a URL, largest-first or smallest-first. */
function pick(item: KlipyItem, order: ("hd" | "md" | "sm" | "xs")[]): KlipyFile | null {
  for (const size of order) {
    const f = item.file?.[size]?.gif;
    if (f?.url) return f;
  }
  return null;
}

function toGif(item: KlipyItem): Gif | null {
  // `md` first for the full version: `hd` can be several megabytes, which is a
  // lot to push through a comment thread on mobile data.
  const full = pick(item, ["md", "hd", "sm", "xs"]);
  const preview = pick(item, ["sm", "xs", "md", "hd"]);
  if (!full?.url || !preview?.url) return null;
  return {
    id: String(item.id),
    title: item.title ?? "",
    url: full.url,
    previewUrl: preview.url,
    width: full.width ?? 200,
    height: full.height ?? 200,
  };
}

async function fetchGifs(path: string, params: Record<string, string | number>): Promise<Gif[]> {
  const r = await client.get<{ result?: boolean; data?: { data?: KlipyItem[] } }>(
    `${BASE}/${config.klipyKey}/gifs/${path}`,
    { params },
  );
  // Read defensively: a bad key or a rate-limit answers 200 with no array.
  return (r.data?.data?.data ?? []).map(toGif).filter((g): g is Gif => g !== null);
}

export const klipyApi = {
  /**
   * `customerId` is Klipy's per-viewer identifier. It is the caller's user id
   * where there is one and a fixed guest string otherwise - never a random
   * value per call, which would defeat the de-duplication it exists for.
   */
  trending: (customerId: string, page = 1, perPage = 24) =>
    fetchGifs("trending", { customer_id: customerId, page, per_page: perPage }),

  search: (q: string, customerId: string, page = 1, perPage = 24) =>
    fetchGifs("search", { q, customer_id: customerId, page, per_page: perPage }),
};

/** The shape `videoApi.addComment` wants for its `gif` argument. */
export const toCommentGif = (g: Gif) => ({
  gif_url: g.url,
  gif_preview_url: g.previewUrl,
  gif_provider: "klipy",
  gif_provider_id: g.id,
});
