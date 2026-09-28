import { api } from "./api";

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  favicon: string | null;
}

export const linkPreviewService = {
  get: async (url: string): Promise<LinkPreviewData | null> =>
    (await api.get("/link-preview", { params: { url } })).data?.data ?? null,
};
