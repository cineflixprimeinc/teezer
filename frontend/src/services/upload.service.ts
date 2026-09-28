import axios from "axios";
import { api } from "./api";
import type { ApiResponse } from "@/types/api";
import type { ReelsooVideo } from "@/types/video";

/* ─── Types ────────────────────────────────────────────────────────────────── */
export type AllowedVideoMime =
  | "video/mp4"
  | "video/webm"
  | "video/quicktime"
  | "video/x-msvideo"
  | "video/avi";

export type AllowedImageMime =
  | "image/jpeg"
  | "image/jpg"
  | "image/png"
  | "image/webp";

export type AllowedMediaMime = AllowedVideoMime | AllowedImageMime;

export type UploadUrlResponse = {
  upload_url:   string;
  object_key:   string;
  expires_in:   number;
  content_type: string;
};

export type CarouselMediaItem = {
  object_key: string;
  order:      number;
  mime_type:  string;
};

export type CompleteUploadPayload = {
  object_key:         string;
  thumbnail_key?:     string | null;
  title?:             string | null;
  caption?:           string | null;
  category?:          string | null;
  location?:          string | null;
  hashtags?:          string[];
  status?:            "published" | "draft" | "private" | "unlisted" | "scheduled";
  scheduled_at?:      string;
  duration?:          number;
  width?:             number;
  height?:            number;
  mime_type?:         AllowedMediaMime;
  file_size?:         number;
  allow_comments?:          boolean;
  allow_duet?:              boolean;
  allow_stitch?:            boolean;
  is_ai_generated?:         boolean;
  media_items?:             CarouselMediaItem[];
  tagged_users?:            { id: number; username: string }[];
  audio_track_id?:          number;
  music_track_id?:          number;
  original_audio_volume?:   number;
  music_volume?:            number;
  is_original_audio_muted?: boolean;
  is_music_muted?:          boolean;
};

export type UploadProgress = {
  loaded:  number;
  total:   number;
  percent: number;
};

/* ─── Multipart (large files) ─────────────────────────────────────────────────
 * The server's B2 multipart endpoints (create/sign/status/complete/abort)
 * already existed and worked - this is the first client wiring them up. See
 * MultipartUploadController.php's own doc comment for the B2-side contract
 * this mirrors: "the bytes never touch this server... status asks B2
 * directly rather than trusting a row that could disagree with the bucket."
 */
export type MultipartCreateResponse = {
  object_key:   string;
  upload_id:    string;
  part_size:    number;
  content_type: string;
};

export type MultipartPart = { PartNumber: number; ETag: string };

export type MultipartStatusResponse = {
  parts:          { PartNumber: number; ETag: string; Size: number }[];
  uploaded_bytes: number;
};

/** Videos at or above this size use multipart; below it, the existing
 *  single-PUT path (below) already works fine and gains nothing from the
 *  extra round trips - B2's own part-size floor is 5 MB, so anything much
 *  smaller than this threshold would be 1-2 parts anyway. */
export const MULTIPART_THRESHOLD_BYTES = 25 * 1024 * 1024;

/** A fixed-size worker pool pulls from a shared part queue - never
 *  Promise.all() on every part at once. Tuned separately from mobile's own
 *  concurrency (mobile/src/api/video.api.ts), since a browser tab and a
 *  phone's radio have different realistic upload concurrency. */
const MULTIPART_CONCURRENCY = 5;
const PART_MAX_ATTEMPTS     = 4;

type MultipartResumeManifest = {
  object_key:   string;
  upload_id:    string;
  content_type: string;
  part_size:    number;
};

const RESUME_KEY_PREFIX = 'reelsoo_multipart_upload_';

/**
 * name+size+lastModified, not a content hash - cheap (no reading the file)
 * and good enough to tell "the user re-picked a file that still looks like
 * the one they were uploading before" from "a different file entirely".
 * Not a security boundary - object-key ownership is enforced server-side
 * (MultipartUploadController::owns()) regardless of what this matches.
 */
function fingerprintFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Mirrors the try/catch-guarded localStorage JSON round-trip already used
 *  in messages-page.tsx / music-library-modal.tsx - private-mode/full-quota
 *  localStorage degrades to "no resume next time", never a broken upload. */
function loadResumeManifest(file: File): MultipartResumeManifest | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY_PREFIX + fingerprintFile(file));
    return raw ? (JSON.parse(raw) as MultipartResumeManifest) : null;
  } catch {
    return null;
  }
}

function saveResumeManifest(file: File, manifest: MultipartResumeManifest): void {
  try {
    localStorage.setItem(RESUME_KEY_PREFIX + fingerprintFile(file), JSON.stringify(manifest));
  } catch {
    // Best-effort - see loadResumeManifest.
  }
}

function clearResumeManifest(file: File): void {
  try {
    localStorage.removeItem(RESUME_KEY_PREFIX + fingerprintFile(file));
  } catch {
    // Nothing to do if this fails too - the manifest just outlives its
    // usefulness until the browser evicts it or a future upload overwrites it.
  }
}

/** PUT one chunk to its signed part URL, returning the ETag B2 hands back -
 *  required verbatim by completeMultipartUpload. Retries transient failures
 *  with backoff; a user cancel (AbortSignal) is never retried. */
async function uploadPart(url: string, chunk: Blob, contentType: string, signal?: AbortSignal): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PART_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.put(url, chunk, {
        headers: { 'Content-Type': contentType },
        signal,
        timeout: 0,
      });
      const etag = (res.headers['etag'] ?? res.headers['ETag']) as string | undefined;
      if (!etag) {
        throw new Error('Part upload succeeded but B2 returned no ETag - check the bucket CORS exposeHeaders rule.');
      }
      // B2 wraps the ETag in quotes on the wire; completeMultipartUpload
      // wants it exactly as B2 will compare it, quotes included, so this is
      // passed through as-is rather than stripped.
      return etag;
    } catch (e) {
      if (axios.isCancel(e) || (e as { code?: string })?.code === 'ERR_CANCELED') throw e;
      lastErr = e;
      if (attempt < PART_MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Part upload failed after retries.');
}

/* ─── Client ───────────────────────────────────────────────────────────────── */
/**
 * Two-step direct-to-R2 upload:
 *   1. POST /videos/upload-url    → presigned PUT URL + object key
 *   2. PUT  signed URL with file  (browser uploads straight to R2)
 *   3. POST /videos/complete-upload → register the DB row
 *
 * Supports both video and image files. The backend routes to the correct R2
 * directory (videos/original or images/original) based on the mime type.
 */
export const uploadService = {
  /** Request a presigned PUT URL for any media type (video or image). */
  async requestUploadUrl(file: File): Promise<UploadUrlResponse> {
    const { data } = await api.post<ApiResponse<UploadUrlResponse>>("/videos/upload-url", {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    });
    return data.data;
  },

  async requestThumbnailUploadUrl(file: File): Promise<UploadUrlResponse> {
    const { data } = await api.post<ApiResponse<UploadUrlResponse>>("/videos/thumbnail-url", {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    });
    return data.data;
  },

  async putToR2(
    signedUrl:   string,
    file:        File,
    onProgress?: (p: UploadProgress) => void,
    signal?:     AbortSignal,
  ): Promise<void> {
    // Bare axios - no interceptors / Bearer header; R2 won't accept ours.
    // Retry once on a transient failure (network blip, R2 5xx) before giving up.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await axios.put(signedUrl, file, {
          headers: { "Content-Type": file.type },
          signal,
          timeout: 0, // never let axios time out a large upload
          onUploadProgress: (e) => {
            if (!onProgress) return;
            const total  = e.total ?? file.size;
            const loaded = e.loaded ?? 0;
            onProgress({ loaded, total, percent: total ? Math.round((loaded / total) * 100) : 0 });
          },
        });
        return;
      } catch (e) {
        // Honour a user cancel immediately - never retry it.
        if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") throw e;
        lastErr = e;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    // Surface a storage-specific message instead of the generic "could not reach
    // the server", so it's clear the failure was the direct upload to R2.
    const status = axios.isAxiosError(lastErr) ? lastErr.response?.status : undefined;
    throw new Error(
      status
        ? `Storage upload failed - R2 returned ${status}. Please try again.`
        : "Couldn't upload the file to storage (R2). This is usually a network or bucket-CORS issue - please try again.",
    );
  },

  async completeUpload(payload: CompleteUploadPayload): Promise<ReelsooVideo> {
    const { data } = await api.post<ApiResponse<ReelsooVideo>>("/videos/complete-upload", payload);
    return data.data;
  },

  /* ── Multipart (large files) ── */

  async createMultipartUpload(file: File): Promise<MultipartCreateResponse> {
    const { data } = await api.post<ApiResponse<MultipartCreateResponse>>("/videos/upload/multipart/create", {
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
    });
    return data.data;
  },

  async signPart(objectKey: string, uploadId: string, partNumber: number): Promise<string> {
    const { data } = await api.post<ApiResponse<{ url: string; part_number: number }>>("/videos/upload/multipart/sign", {
      object_key: objectKey,
      upload_id: uploadId,
      part_number: partNumber,
    });
    return data.data.url;
  },

  async getMultipartStatus(objectKey: string, uploadId: string): Promise<MultipartStatusResponse> {
    const { data } = await api.get<ApiResponse<MultipartStatusResponse>>("/videos/upload/multipart/status", {
      params: { object_key: objectKey, upload_id: uploadId },
    });
    return data.data;
  },

  async completeMultipartUpload(objectKey: string, uploadId: string, parts: MultipartPart[]): Promise<{ object_key: string }> {
    const { data } = await api.post<ApiResponse<{ object_key: string }>>("/videos/upload/multipart/complete", {
      object_key: objectKey,
      upload_id: uploadId,
      parts,
    });
    return data.data;
  },

  /** Best-effort, like cancelUpload above - never throws. */
  async abortMultipartUpload(objectKey: string, uploadId: string): Promise<void> {
    try {
      await api.post("/videos/upload/multipart/abort", { object_key: objectKey, upload_id: uploadId });
    } catch {
      // Best-effort cleanup - ignore errors silently
    }
  },

  /**
   * Uploads one large file via B2 multipart, resumable across a page
   * reload IF the user re-selects a file matching fingerprintFile (name +
   * size + lastModified - see that function). Resume status is always
   * asked of B2 directly (getMultipartStatus), never trusted from the
   * local manifest alone - the manifest only remembers WHICH upload to ask
   * about, matching MultipartUploadController's own resume philosophy.
   *
   * Controlled concurrency (MULTIPART_CONCURRENCY), per-part retry with
   * backoff (uploadPart), and the whole file is never read into memory at
   * once - each part is a Blob slice, uploaded and released before the next
   * batch starts.
   */
  async uploadMultipart(
    file: File,
    onProgress?: (p: UploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<{ object_key: string }> {
    let session = loadResumeManifest(file);

    if (!session) {
      const created = await uploadService.createMultipartUpload(file);
      session = {
        object_key: created.object_key,
        upload_id: created.upload_id,
        content_type: created.content_type,
        part_size: created.part_size,
      };
      saveResumeManifest(file, session);
    }

    // Abort the B2-side session too, not just the client-side loop below -
    // otherwise a cancelled upload leaves billed, invisible-in-a-normal-
    // listing parts sitting in B2 forever (see abortMultipartUpload's own
    // reasoning, mirrored from the server's AbortMultipartUpload doc comment).
    const onAbort = () => {
      if (session) void uploadService.abortMultipartUpload(session.object_key, session.upload_id);
      clearResumeManifest(file);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const totalParts = Math.ceil(file.size / session.part_size);

      const status = await uploadService.getMultipartStatus(session.object_key, session.upload_id);
      const done = new Map<number, string>();
      for (const p of status.parts) done.set(p.PartNumber, p.ETag);

      let uploadedBytes = status.uploaded_bytes;
      const reportProgress = () => {
        onProgress?.({
          loaded: uploadedBytes,
          total: file.size,
          percent: file.size ? Math.round((uploadedBytes / file.size) * 100) : 0,
        });
      };
      reportProgress();

      const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));
      let cursor = 0;

      const worker = async () => {
        while (cursor < remaining.length) {
          if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

          const partNumber = remaining[cursor++];
          const start = (partNumber - 1) * session!.part_size;
          const end = Math.min(start + session!.part_size, file.size);
          const chunk = file.slice(start, end);

          const url = await uploadService.signPart(session!.object_key, session!.upload_id, partNumber);
          const etag = await uploadPart(url, chunk, session!.content_type, signal);

          done.set(partNumber, etag);
          uploadedBytes += chunk.size;
          reportProgress();
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(MULTIPART_CONCURRENCY, remaining.length) }, worker),
      );

      const parts: MultipartPart[] = Array.from(done.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([PartNumber, ETag]) => ({ PartNumber, ETag }));

      const result = await uploadService.completeMultipartUpload(session.object_key, session.upload_id, parts);
      clearResumeManifest(file);
      return result;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  },

  /** Delete an orphaned R2 file that was never registered as a video (best-effort, never throws). */
  async cancelUpload(objectKey: string): Promise<void> {
    try {
      await api.delete("/upload/cancel", { data: { object_key: objectKey } });
    } catch {
      // Best-effort cleanup - ignore errors silently
    }
  },

  /**
   * Full upload orchestration for any media (video or image).
   * For videos: uploads optional thumbnail before the main file.
   * For images: no thumbnail upload step.
   */
  async uploadMedia(args: {
    file:           File;
    meta:           Omit<CompleteUploadPayload, "object_key">;
    thumbnailFile?: File | null;
    onProgress?:    (p: UploadProgress) => void;
    signal?:        AbortSignal;
  }): Promise<ReelsooVideo> {
    const { file, meta, thumbnailFile, onProgress, signal } = args;
    const isVideo = file.type.startsWith("video/");

    // ── 0. Upload thumbnail (video only, optional) ───────────────────────
    let thumbnailKey: string | null = null;
    if (isVideo && thumbnailFile) {
      try {
        const thumbSigned = await uploadService.requestThumbnailUploadUrl(thumbnailFile);
        await uploadService.putToR2(thumbSigned.upload_url, thumbnailFile, undefined, signal);
        thumbnailKey = thumbSigned.object_key;
      } catch {
        // Non-fatal: post the video without a thumbnail
        thumbnailKey = null;
      }
    }

    // ── 1 + 2. Get the media into B2 ──────────────────────────────────────
    // Multipart above the threshold (resumable, parallel, retries per part -
    // see uploadMultipart's own doc comment); the existing single-PUT path
    // below that, unchanged - it already works fine at that size and gains
    // nothing from multipart's extra round trips.
    let objectKey: string;
    if (isVideo && file.size >= MULTIPART_THRESHOLD_BYTES) {
      const result = await uploadService.uploadMultipart(file, onProgress, signal);
      objectKey = result.object_key;
    } else {
      const signed = await uploadService.requestUploadUrl(file);
      await uploadService.putToR2(signed.upload_url, file, onProgress, signal);
      objectKey = signed.object_key;
    }

    // ── 3. Register DB row ───────────────────────────────────────────────
    return uploadService.completeUpload({
      ...meta,
      object_key:    objectKey,
      thumbnail_key: thumbnailKey ?? undefined,
      mime_type:     file.type as AllowedMediaMime,
      file_size:     file.size,
    });
  },

  /**
   * Upload multiple images as a carousel post.
   * Each image is PUT to R2 independently; all object keys are collected
   * as `media_items` and sent to completeUpload with the first key as primary.
   */
  async uploadCarousel(args: {
    files:        File[];
    meta:         Omit<CompleteUploadPayload, "object_key" | "media_items" | "mime_type" | "file_size">;
    onProgress?:  (p: UploadProgress) => void;
    signal?:      AbortSignal;
  }): Promise<ReelsooVideo> {
    const { files, meta, onProgress, signal } = args;
    const totalBytes    = files.reduce((s, f) => s + f.size, 0);
    const loadedArr     = new Array<number>(files.length).fill(0);
    const mediaItems: CarouselMediaItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f      = files[i];
      const signed = await uploadService.requestUploadUrl(f);

      await uploadService.putToR2(signed.upload_url, f, (p) => {
        loadedArr[i] = p.loaded;
        if (onProgress) {
          const loaded = loadedArr.reduce((s, b) => s + b, 0);
          onProgress({ loaded, total: totalBytes, percent: totalBytes > 0 ? Math.round((loaded / totalBytes) * 100) : 0 });
        }
      }, signal);

      mediaItems.push({ object_key: signed.object_key, order: i, mime_type: f.type });
    }

    return uploadService.completeUpload({
      ...meta,
      object_key:  mediaItems[0].object_key,
      mime_type:   files[0].type as AllowedMediaMime,
      file_size:   files[0].size,
      media_items: mediaItems,
    });
  },

  /** @deprecated Use uploadMedia() - kept for any existing callers. */
  async uploadVideo(args: {
    file:           File;
    meta:           Omit<CompleteUploadPayload, "object_key">;
    thumbnailFile?: File | null;
    onProgress?:    (p: UploadProgress) => void;
    signal?:        AbortSignal;
  }): Promise<ReelsooVideo> {
    return uploadService.uploadMedia(args);
  },
};
