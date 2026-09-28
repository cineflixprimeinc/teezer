import { api } from "./api";

export type MessageType = "text" | "image" | "video" | "voice" | "audio" | "document" | "story_reply" | "story_reaction";

export interface DmMessage {
  id: number;
  sender_id: number;
  receiver_id: number;
  body: string;
  message_type: MessageType;
  r2_key: string | null;
  r2_url: string | null;
  thumbnail_key: string | null;
  thumbnail_url: string | null;
  file_size: number | null;
  duration: number | null;
  file_name: string | null;
  mime_type: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  // story reply context
  story_id?: number | null;
  story_thumbnail_url?: string | null;
  // action columns
  reply_to_message_id?: number | null;
  edited_at?: string | null;
  is_pinned?: boolean;
  pinned_at?: string | null;
  deleted_for_everyone_at?: string | null;
}

export interface DmConversation {
  user_id: number;
  username: string;
  name: string;
  avatar: string | null;
  is_verified: boolean | number;
  last_message: string | null;
  /** Type of the most recent message - already returned by the shared
   *  conversations endpoint (see MessageController.php's `last_message_type`
   *  column), just never typed/read on this client before. */
  last_message_type?: string | null;
  last_ts: string | null;
  last_sender_id: number | null;
  last_read_at: string | null;
  unread_count: number;
}

export type ConversationStatus = "approved" | "pending_request" | "rejected" | "blocked";

export interface SendResult {
  message: DmMessage;
  conversation_status: ConversationStatus;
}

export interface DmRequest {
  user_id: number;
  username: string;
  name: string;
  avatar: string | null;
  is_verified: boolean | number;
  conversation_id: number;
  status: ConversationStatus;
  direction: "incoming" | "sent";
  last_message: string | null;
  last_message_type: string | null;
  last_ts: string | null;
}

export interface DmRequestsResponse {
  incoming: DmRequest[];
  sent: DmRequest[];
}

export interface SendMediaPayload {
  message_type: MessageType;
  body?: string;
  r2_key: string;
  r2_url: string;
  thumbnail_key?: string;
  thumbnail_url?: string;
  file_size?: number;
  duration?: number;
  file_name?: string;
  mime_type?: string;
}

export interface R2UploadResult {
  upload_url: string;
  object_key: string;
  expires_in: number;
  content_type: string;
}

export const messageService = {
  async conversations(): Promise<DmConversation[]> {
    const { data } = await api.get("/messages/conversations");
    return data.data ?? [];
  },

  async history(userId: number, before?: number): Promise<DmMessage[]> {
    const params: Record<string, string> = {};
    if (before) params.before = String(before);
    const { data } = await api.get(`/messages/conversations/${userId}`, { params });
    return data.data ?? [];
  },

  async send(userId: number, body: string, replyToMessageId?: number): Promise<SendResult> {
    const { data } = await api.post(`/messages/conversations/${userId}`, {
      body,
      ...(replyToMessageId !== undefined ? { reply_to_message_id: replyToMessageId } : {}),
    });
    return {
      message: data.data,
      conversation_status: (data.conversation_status as ConversationStatus) ?? "approved",
    };
  },

  async sendMedia(userId: number, payload: SendMediaPayload): Promise<SendResult> {
    const { data } = await api.post(`/messages/conversations/${userId}`, payload);
    return {
      message: data.data,
      conversation_status: (data.conversation_status as ConversationStatus) ?? "approved",
    };
  },

  async getUploadUrl(params: {
    file_name: string;
    file_type: string;
    file_size: number;
    media_type: "image" | "video" | "voice" | "audio" | "document" | "thumbnail";
  }): Promise<R2UploadResult> {
    const { data } = await api.post("/messages/upload-url", params);
    return data.data;
  },

  async uploadToR2(uploadUrl: string, file: File | Blob, contentType: string): Promise<void> {
    await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
  },

  async markRead(userId: number): Promise<void> {
    await api.post(`/messages/conversations/${userId}/read`);
  },

  async unreadCount(): Promise<{ count: number; request_count: number }> {
    const { data } = await api.get("/messages/unread-count");
    return { count: data.data?.count ?? 0, request_count: data.data?.request_count ?? 0 };
  },

  // ── Message Requests ────────────────────────────────────────────
  async messageRequests(): Promise<DmRequestsResponse> {
    const { data } = await api.get("/messages/requests");
    return {
      incoming: data.data?.incoming ?? [],
      sent:     data.data?.sent     ?? [],
    };
  },

  async acceptRequest(conversationId: number): Promise<void> {
    await api.post(`/messages/requests/${conversationId}/accept`);
  },

  async cancelRequest(conversationId: number): Promise<void> {
    await api.post(`/messages/requests/${conversationId}/cancel`);
  },

  async deleteRequest(conversationId: number): Promise<void> {
    await api.post(`/messages/requests/${conversationId}/delete`);
  },

  async blockRequest(conversationId: number): Promise<void> {
    await api.post(`/messages/requests/${conversationId}/block`);
  },

  async reportRequest(conversationId: number, reason?: string): Promise<void> {
    await api.post(`/messages/requests/${conversationId}/report`, { reason });
  },

  // ── Message actions ─────────────────────────────────────────────
  async editMessage(id: number, body: string): Promise<DmMessage> {
    const { data } = await api.patch(`/messages/${id}`, { body });
    return data.data;
  },

  async deleteMessage(id: number, scope: "me" | "everyone"): Promise<void> {
    await api.delete(`/messages/${id}`, { data: { scope } });
  },

  async pinMessage(id: number): Promise<DmMessage> {
    const { data } = await api.post(`/messages/${id}/pin`);
    return data.data;
  },

  async unpinMessage(id: number): Promise<void> {
    await api.post(`/messages/${id}/unpin`);
  },

  async forwardMessage(id: number, conversationIds: number[]): Promise<DmMessage[]> {
    const { data } = await api.post(`/messages/${id}/forward`, { conversation_ids: conversationIds });
    return data.data;
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
