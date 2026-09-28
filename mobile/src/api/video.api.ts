import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./client";
import type { Video } from "@/types";

/* ── Post upload (presign → PUT to B2 → complete) - same flow as the website's
 * uploadService, and the same presign-then-PUT shape inbox.api.ts's
 * getUploadUrl/uploadToR2 already use for chat media. ── */

export interface UploadUrlResponse {
  upload_url: string;
  object_key: string;
  expires_in: number;
  content_type: string;
}

/* ── Multipart (large files) - mirrors frontend/src/services/upload.service.ts's
 * own multipart addition against the SAME server endpoints. Concurrency is
 * tuned lower than web's (3 vs 5): a phone radio is a less reliable, more
 * contended pipe than a desktop's connection, and a phone paying for 5
 * parallel uploads on a weak signal fails more often than it helps. ── */

export interface MultipartCreateResponse {
  object_key: string;
  upload_id: string;
  part_size: number;
  content_type: string;
}

export interface MultipartPart {
  PartNumber: number;
  ETag: string;
}

export interface MultipartStatusResponse {
  parts: { PartNumber: number; ETag: string; Size: number }[];
  uploaded_bytes: number;
}

/** Videos at or above this size use multipart; below it the existing
 *  single-PUT path already works fine - matches web's own threshold. */
export const MULTIPART_THRESHOLD_BYTES = 25 * 1024 * 1024;

const MULTIPART_CONCURRENCY = 3;
const PART_MAX_ATTEMPTS = 4;
const RESUME_KEY_PREFIX = "teezer_multipart_upload_";

type MultipartResumeManifest = {
  object_key: string;
  upload_id: string;
  content_type: string;
  part_size: number;
};

/** name+size+lastModified fingerprint of a locally-picked file - same
 *  reasoning as web's fingerprintFile: cheap, not a security boundary
 *  (ownership is enforced server-side regardless), just enough to tell "the
 *  user re-picked the file they were uploading before" from a different one. */
async function fingerprintFile(uri: string): Promise<string> {
  const file = new File(uri);
  return `${file.name}:${file.size}:${file.modificationTime ?? 0}`;
}

async function loadResumeManifest(uri: string): Promise<MultipartResumeManifest | null> {
  try {
    const raw = await AsyncStorage.getItem(RESUME_KEY_PREFIX + (await fingerprintFile(uri)));
    return raw ? (JSON.parse(raw) as MultipartResumeManifest) : null;
  } catch {
    return null;
  }
}

async function saveResumeManifest(uri: string, manifest: MultipartResumeManifest): Promise<void> {
  try {
    await AsyncStorage.setItem(RESUME_KEY_PREFIX + (await fingerprintFile(uri)), JSON.stringify(manifest));
  } catch {
    /* best-effort - see prefs.store.ts's own writeSnapshot for the same idiom */
  }
}

async function clearResumeManifest(uri: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(RESUME_KEY_PREFIX + (await fingerprintFile(uri)));
  } catch {
    /* best-effort */
  }
}

/** PUT one chunk to its signed part URL via XHR (same mechanism
 *  uploadToB2 already uses, for the same reason: plain fetch has no
 *  upload-progress event and RN's fetch is built on XHR anyway), reading
 *  back the ETag header B2 returns - required verbatim by
 *  completeMultipartUpload. Retries transient failures with backoff. */
function uploadPart(url: string, chunk: Blob, contentType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader("ETag") ?? xhr.getResponseHeader("etag");
          if (!etag) {
            reject(new Error("Part upload succeeded but B2 returned no ETag header."));
            return;
          }
          resolve(etag);
        } else if (n < PART_MAX_ATTEMPTS - 1) {
          setTimeout(() => attempt(n + 1), 500 * 2 ** n);
        } else {
          reject(new Error(`Part upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => {
        if (n < PART_MAX_ATTEMPTS - 1) setTimeout(() => attempt(n + 1), 500 * 2 ** n);
        else reject(new Error("Part upload failed - check your connection and try again."));
      };
      xhr.send(chunk);
    };
    attempt(0);
  });
}

export interface CompleteUploadPayload {
  object_key: string;
  thumbnail_key?: string | null;
  title?: string | null;
  caption?: string | null;
  category?: string | null;
  location?: string | null;
  /** "Add link" on the Details card - a single external URL. */
  link_url?: string | null;
  /** "Add link" -> Teezer Product - up to 3 of the caller's OWN active
   *  Shop products (ownership + the cap are re-verified server-side, see
   *  VideoService::syncFeaturedProducts - never trust this array alone). */
  product_ids?: number[];
  hashtags?: string[];
  status?: "published" | "draft" | "private" | "unlisted" | "scheduled";
  /** Only meaningful when status is "scheduled" - required by the server in
   *  that case. Any format Date.parse()/PHP's `date` validation rule accept. */
  scheduled_at?: string | null;
  duration?: number;
  width?: number;
  height?: number;
  mime_type?: string;
  file_size?: number;
  allow_comments?: boolean;
  allow_duet?: boolean;
  allow_stitch?: boolean;
  is_ai_generated?: boolean;
  /** "Content rights confirmed" - Media & safety's real, required-to-publish
   *  legal attestation (server persists rights_confirmed + a timestamp). */
  rights_confirmed?: boolean;
  /** "Subject consent confirmed" - same idea, not a hard requirement. */
  consent_confirmed?: boolean;
  audio_track_id?: number;
  music_track_id?: number;
  original_audio_volume?: number;
  music_volume?: number;
  is_original_audio_muted?: boolean;
  is_music_muted?: boolean;
  /* Music timeline, in milliseconds. Integers, not floats: an edit has to
   * reproduce exactly on web and mobile, and AudioTimeline re-clamps all of it
   * server-side against the project duration and the track's real length. */
  project_duration_ms?: number;
  music_source_start_ms?: number;
  music_source_end_ms?: number;
  music_video_start_ms?: number;
  music_fade_in_ms?: number;
  music_fade_out_ms?: number;
  music_auto_duck?: boolean;
  /** Explicit "Tag people" selections - distinct from @mentions typed into
   *  the caption text, which the server parses separately. */
  tagged_users?: { id?: number; username?: string }[];
  /** "Paid partnership" collab tags - same shape as tagged_users, its own
   *  approval workflow and Video::collabUsers() relation. */
  collab_users?: { id?: number; username?: string }[];
}

export interface FeedComment {
  id: number;
  body: string | null;
  love_count: number;
  dislike_count?: number;
  reply_count: number;
  created_at: string;
  parent_id?: number | null;
  root_id?: number | null;
  is_author?: boolean;             // comment by the video owner
  comment_rank?: number | null;    // 1|2|3 → "1st/2nd/3rd comment" badge
  is_pinned?: boolean;
  is_edited?: boolean;
  current_user_reaction?: "love" | "dislike" | null;
  gif_url?: string | null;
  gif_preview_url?: string | null;
  /** An uploaded photo attached to the comment (already an absolute URL). */
  image_url?: string | null;
  /**
   * Set when this comment IS a gift sent on the post. The row renders the
   * gift's own animated artwork instead of the body text; `body` still carries
   * a plain-language fallback ("sent a Rose") for anything that has not been
   * taught about gifts.
   */
  gift?: {
    id: number;
    name: string;
    slug: string | null;
    /** Absolute - the server resolves the site-relative catalog path. */
    icon_url: string | null;
    coins: number;
  } | null;
  user?: { id: number; username: string; name: string | null; avatar: string | null; is_verified: boolean; is_following?: boolean };
}

/** Video like/unlike/toggle - all return the fresh server-side like state + count. */
export interface VideoLikeResponse {
  success: boolean;
  liked: boolean;
  likes_count: number;
}

export interface VideoViewResponse {
  success: boolean;
  counted: boolean;
  views_count: number;
}

/** Delete-comment response carries the authoritative video comment total. */
export interface DeleteCommentResponse {
  success: boolean;
  message?: string;
  video_comments_count?: number;
}

interface CommentsResponse {
  success: boolean;
  data: FeedComment[];
  meta?: { current_page: number; last_page: number; next_page_url?: string | null };
  visible_comments_count?: number;
  video_comments_count?: number;
}

export interface CommentReactResponse {
  success: boolean;
  action: "added" | "removed" | "switched";
  current_user_reaction: "love" | "dislike" | null;
  love_count: number;
  dislike_count: number;
}

/**
 * Video interactions - same backend endpoints as the website. Like/save/follow/
 * comment-post require auth; share, view and the comments list are public.
 */
export const videoApi = {
  // Single reel by id (same VideoResource the feed uses) - used to open a
  // notification's linked post in the full-screen player.
  get: (id: number) => api.get<{ success: boolean; data: Video }>(`/videos/${id}`).then((r) => r.data.data),

  requestUploadUrl: (params: { file_name: string; file_type: string; file_size: number }) =>
    api.post<{ success: boolean; data: UploadUrlResponse }>("/videos/upload-url", params).then((r) => r.data.data),

  requestThumbnailUploadUrl: (params: { file_name: string; file_type: string; file_size: number }) =>
    api.post<{ success: boolean; data: UploadUrlResponse }>("/videos/thumbnail-url", params).then((r) => r.data.data),

  /**
   * PUT the picked file straight to the presigned B2 URL - same fetch+blob
   * mechanism inbox.api.ts's uploadToR2 already uses for chat media, with
   * progress added via XMLHttpRequest directly (what fetch is built on in
   * React Native too; plain fetch has no upload-progress event of its own).
   */
  uploadToB2: (uploadUrl: string, uri: string, contentType: string, onProgress?: (percent: number) => void) =>
    new Promise<void>((resolve, reject) => {
      (async () => {
        try {
          // expo-file-system's File, not `await fetch(uri).blob()`.
          //
          // React Native's fetch hands back an ArrayBuffer body for a local
          // file, and its Response.blob() then does `new Blob([arrayBuffer])`
          // - which RN's Blob refuses outright with "Creating blobs from
          // 'ArrayBuffer' and 'ArrayBufferView' are not supported", failing
          // every upload before a byte left the device. File implements Blob
          // natively and is what uploadMultipart below already uses.
          const blob = new File(uri);
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", contentType);
          if (onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error("Couldn't upload the file to storage - check your connection and try again."));
          xhr.send(blob);
        } catch (e) {
          reject(e instanceof Error ? e : new Error("Couldn't read the picked file"));
        }
      })();
    }),

  completeUpload: (payload: CompleteUploadPayload) =>
    api.post<{ success: boolean; data: Video }>("/videos/complete-upload", payload).then((r) => r.data.data),

  /* ── Multipart (large files) - same server endpoints web's uploadService uses ── */

  createMultipartUpload: (params: { file_name: string; content_type: string; file_size: number }) =>
    api.post<{ success: boolean; data: MultipartCreateResponse }>("/videos/upload/multipart/create", params).then((r) => r.data.data),

  signPart: (objectKey: string, uploadId: string, partNumber: number) =>
    api
      .post<{ success: boolean; data: { url: string; part_number: number } }>("/videos/upload/multipart/sign", {
        object_key: objectKey,
        upload_id: uploadId,
        part_number: partNumber,
      })
      .then((r) => r.data.data.url),

  getMultipartStatus: (objectKey: string, uploadId: string) =>
    api
      .get<{ success: boolean; data: MultipartStatusResponse }>("/videos/upload/multipart/status", {
        params: { object_key: objectKey, upload_id: uploadId },
      })
      .then((r) => r.data.data),

  completeMultipartUpload: (objectKey: string, uploadId: string, parts: MultipartPart[]) =>
    api
      .post<{ success: boolean; data: { object_key: string } }>("/videos/upload/multipart/complete", {
        object_key: objectKey,
        upload_id: uploadId,
        parts,
      })
      .then((r) => r.data.data),

  /** Best-effort, like everything else that cleans up an abandoned upload - never throws. */
  abortMultipartUpload: (objectKey: string, uploadId: string) =>
    api.post("/videos/upload/multipart/abort", { object_key: objectKey, upload_id: uploadId }).catch(() => {}),

  /**
   * Uploads one large local file via B2 multipart - the mobile counterpart
   * of upload.service.ts's uploadMultipart, same resumability story
   * (AsyncStorage manifest keyed by fingerprintFile, status always
   * re-confirmed against B2 itself via getMultipartStatus rather than
   * trusted from the manifest alone). File.slice() (expo-file-system) reads
   * only each part's own byte range natively - the picked video is never
   * read into memory as a whole, even for a multi-GB file.
   */
  uploadMultipart: async (
    uri: string,
    onProgress?: (percent: number) => void,
    onCancelRef?: { current: (() => void) | null },
  ): Promise<{ object_key: string }> => {
    let session = await loadResumeManifest(uri);
    let cancelled = false;
    if (onCancelRef) onCancelRef.current = () => { cancelled = true; };

    if (!session) {
      const file = new File(uri);
      const created = await videoApi.createMultipartUpload({
        file_name: file.name,
        content_type: file.type || "video/mp4",
        file_size: file.size,
      });
      session = {
        object_key: created.object_key,
        upload_id: created.upload_id,
        content_type: created.content_type,
        part_size: created.part_size,
      };
      await saveResumeManifest(uri, session);
    }

    try {
      const file = new File(uri);
      const totalParts = Math.ceil(file.size / session.part_size);

      const status = await videoApi.getMultipartStatus(session.object_key, session.upload_id);
      const done = new Map<number, string>();
      for (const p of status.parts) done.set(p.PartNumber, p.ETag);

      let uploadedBytes = status.uploaded_bytes;
      const report = () => onProgress?.(file.size ? Math.round((uploadedBytes / file.size) * 100) : 0);
      report();

      const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));
      let cursor = 0;

      const worker = async () => {
        while (cursor < remaining.length) {
          if (cancelled) throw new Error("Upload cancelled");

          const partNumber = remaining[cursor++];
          const start = (partNumber - 1) * session!.part_size;
          const end = Math.min(start + session!.part_size, file.size);
          const chunk = file.slice(start, end);

          const url = await videoApi.signPart(session!.object_key, session!.upload_id, partNumber);
          const etag = await uploadPart(url, chunk, session!.content_type);

          done.set(partNumber, etag);
          uploadedBytes += end - start;
          report();
        }
      };

      await Promise.all(Array.from({ length: Math.min(MULTIPART_CONCURRENCY, remaining.length) }, worker));

      const parts: MultipartPart[] = Array.from(done.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([PartNumber, ETag]) => ({ PartNumber, ETag }));

      const result = await videoApi.completeMultipartUpload(session.object_key, session.upload_id, parts);
      await clearResumeManifest(uri);
      return result;
    } catch (e) {
      if (cancelled) {
        await videoApi.abortMultipartUpload(session.object_key, session.upload_id);
        await clearResumeManifest(uri);
      }
      throw e;
    } finally {
      if (onCancelRef) onCancelRef.current = null;
    }
  },

  like: (id: number) => api.post<VideoLikeResponse>(`/videos/${id}/like`).then((r) => r.data),
  unlike: (id: number) => api.delete<VideoLikeResponse>(`/videos/${id}/like`).then((r) => r.data),
  save: (id: number) => api.post(`/videos/${id}/save`),
  unsave: (id: number) => api.delete(`/videos/${id}/save`),
  share: (id: number) => api.post(`/videos/${id}/share`),
  recordView: (id: number, watchDuration = 2) =>
    api.post<VideoViewResponse>(`/videos/${id}/view`, { watch_duration: watchDuration }).then((r) => r.data),

  // "More options" sheet actions (all soft recommendation signals or reports).
  report: (id: number, reason: string, description?: string) =>
    api.post<{ success: boolean; message?: string }>(`/videos/${id}/report`, { reason, description: description || undefined }).then((r) => r.data),
  notInterested: (id: number) =>
    api.post<{ success: boolean; message?: string }>(`/videos/${id}/not-interested`).then((r) => r.data),
  dontRecommendCreator: (id: number) =>
    api.post<{ success: boolean; message?: string }>(`/videos/${id}/not-interested-creator`).then((r) => r.data),

  follow: (username: string) => api.post(`/users/${username}/follow`),
  unfollow: (username: string) => api.delete(`/users/${username}/follow`),

  /** Profile page's bell icon - "notify me when this creator posts".
   *  Requires an existing accepted follow; the server 422s otherwise. */
  toggleFollowNotify: (username: string) =>
    api.put<{ success: boolean; notify_posts: boolean }>(`/users/${username}/follow/notify`).then((r) => r.data),

  comments: (id: number, page = 1) =>
    api.get<CommentsResponse>(`/videos/${id}/comments`, { params: { page, per_page: 50 } }).then((r) => r.data),
  // Post a comment, or a reply when parentId is set (same rules as the website).
  // A comment may carry text, a GIF, and/or an uploaded photo. When a photo is
  // attached the request goes multipart (the file cannot ride in JSON); the
  // axios client strips its own Content-Type for FormData so the boundary is set.
  addComment: (
    id: number,
    body: string,
    parentId?: number | null,
    gif?: { gif_url: string; gif_preview_url: string; gif_provider: string; gif_provider_id: string } | null,
    image?: { uri: string; name?: string; type?: string } | null,
  ) => {
    const url = `/videos/${id}/comments`;
    if (image) {
      const form = new FormData();
      if (body) form.append("body", body);
      if (parentId != null) form.append("parent_id", String(parentId));
      if (gif) {
        form.append("gif_url", gif.gif_url);
        form.append("gif_preview_url", gif.gif_preview_url);
        form.append("gif_provider", gif.gif_provider);
        form.append("gif_provider_id", gif.gif_provider_id);
      }
      form.append("image", { uri: image.uri, name: image.name ?? "photo.jpg", type: image.type ?? "image/jpeg" } as any);
      return api
        .post<{ success: boolean; data: FeedComment; video_comments_count?: number; root_comment_id?: number; root_replies_count?: number }>(
          url, form, { headers: { "Content-Type": "multipart/form-data" } },
        )
        .then((r) => r.data);
    }
    return api
      .post<{ success: boolean; data: FeedComment; video_comments_count?: number; root_comment_id?: number; root_replies_count?: number }>(
        url,
        { body, parent_id: parentId ?? undefined, ...(gif ?? {}) },
      )
      .then((r) => r.data);
  },
  // Toggle/switch love or dislike on a comment (one reaction per user).
  reactComment: (commentId: number, type: "love" | "dislike") =>
    api.post<CommentReactResponse>(`/comments/${commentId}/react`, { reaction_type: type }).then((r) => r.data),
  // Flat thread (all replies sharing the comment's root_id), oldest first.
  // root_comment_id resolves ANY id in the thread (root or reply) to its
  // top-level ancestor - used to find/expand the right row when jumping to a
  // specific reply from a "mentioned you" notification.
  commentReplies: (commentId: number) =>
    api.get<{ success: boolean; data: FeedComment[]; total: number; root_comment_id: number }>(`/comments/${commentId}/replies`).then((r) => r.data),

  // Comment menu actions (same endpoints + permission rules as the website).
  editComment: (commentId: number, body: string) =>
    api.put<{ success: boolean; data: FeedComment }>(`/comments/${commentId}`, { body }).then((r) => r.data),
  deleteComment: (commentId: number) =>
    api.delete<DeleteCommentResponse>(`/comments/${commentId}`).then((r) => r.data),
  pinComment: (commentId: number) => api.post(`/comments/${commentId}/pin`),
  unpinComment: (commentId: number) => api.post(`/comments/${commentId}/unpin`),
  reportComment: (commentId: number, reason: string, details?: string) =>
    api.post(`/comments/${commentId}/report`, { reason, details: details || undefined }),
};

/** Report reasons - must match the backend enum. */
export const COMMENT_REPORT_REASONS: { key: string; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "hate_speech", label: "Hate speech" },
  { key: "nudity", label: "Nudity or sexual content" },
  { key: "violence", label: "Violence" },
  { key: "misinformation", label: "Misinformation" },
  { key: "other", label: "Other" },
];
