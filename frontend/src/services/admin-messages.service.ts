import { api as apiClient } from './api';

export interface AdminConvUser {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_online: boolean;
  last_active: string | null;
  is_banned: boolean;
}

export interface AdminLastMessage {
  id: number;
  body: string | null;
  message_type: string;
  sender_id: number;
  created_at: string;
}

export interface AdminConversation {
  id: number;
  status: string;
  report_status: string | null;
  risk_level: string | null;
  flagged_at: string | null;
  shadow_restricted: boolean;
  dm_restricted: boolean;
  message_approval_required: boolean;
  links_disabled: boolean;
  media_restricted: boolean;
  prevent_new_requests: boolean;
  auto_hide_reported: boolean;
  history_archived: boolean;
  auto_delete_flagged: string | null;
  admin_closed_at: string | null;
  admin_muted_at: string | null;
  updated_at: string | null;
  user_a: AdminConvUser;
  user_b: AdminConvUser;
  last_message: AdminLastMessage | null;
  unread_count: number;
  flagged_count: number;
}

export interface AdminMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  receiver_id: number;
  body: string | null;
  message_type: string;
  r2_url: string | null;
  thumbnail_url: string | null;
  read_at: string | null;
  edited_at: string | null;
  is_pinned: boolean;
  flagged_by_admin: boolean;
  deleted_for_everyone: boolean;
  created_at: string;
  sender: { id: number; username: string; avatar: string | null } | null;
}

export interface AdminMsgStats {
  total_conversations: number;
  total_messages: number;
  reported_messages: number;
  blocked_users: number;
}

export interface AdminActivityLog {
  id: number;
  conversation_id: number;
  admin_id: number | null;
  action: string;
  actor_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const BASE = '/admin/messages';

export const adminMessagesService = {
  async stats(): Promise<AdminMsgStats> {
    const { data } = await apiClient.get(`${BASE}/stats`);
    return data;
  },

  async conversations(params?: { search?: string; filter?: string; page?: number; user_id?: number }) {
    const { data } = await apiClient.get(`${BASE}/conversations`, { params });
    return data as { data: AdminConversation[]; meta: { current_page: number; last_page: number; total: number } };
  },

  async messages(conversationId: number, page = 1) {
    const { data } = await apiClient.get(`${BASE}/conversations/${conversationId}/messages`, { params: { page } });
    return data as { conversation: AdminConversation; messages: AdminMessage[]; meta: { current_page: number; last_page: number; total: number } };
  },

  async activity(conversationId: number) {
    const { data } = await apiClient.get(`${BASE}/conversations/${conversationId}/activity`);
    return data.data as AdminActivityLog[];
  },

  async updateSettings(conversationId: number, settings: Partial<AdminConversation>) {
    const { data } = await apiClient.post(`${BASE}/conversations/${conversationId}/settings`, settings);
    return data;
  },

  async conversationAction(conversationId: number, action: string, extra?: Record<string, unknown>) {
    const { data } = await apiClient.post(`${BASE}/conversations/${conversationId}/action`, { action, ...extra });
    return data;
  },

  async flagMessage(messageId: number) {
    const { data } = await apiClient.post(`${BASE}/${messageId}/flag`);
    return data;
  },

  async deleteMessage(messageId: number) {
    const { data } = await apiClient.delete(`${BASE}/${messageId}`);
    return data;
  },

  async exportChat(conversationId: number) {
    const { data } = await apiClient.get(`${BASE}/conversations/${conversationId}/export`);
    return data;
  },
};
