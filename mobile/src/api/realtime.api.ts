import { api } from "./client";

/**
 * Centrifugo client credentials, minted by Laravel for the authenticated user.
 * - token(): the connection JWT (Centrifuge `getToken`).
 * - subscribe(channel): a subscription JWT authorizing one private channel.
 */
export const realtimeApi = {
  token: () =>
    api.get<{ success: boolean; data: { token: string } }>("/realtime/token").then((r) => r.data.data.token),
  subscribe: (channel: string) =>
    api.post<{ success: boolean; data: { token: string } }>("/realtime/subscribe", { channel }).then((r) => r.data.data.token),

  // Phase 4 client→server actions (used by the Centrifugo adapter's emitBridge,
  // since pub/sub can't carry request/response or DB writes).
  markDelivered: (messageIds: number[]) =>
    api.post("/messages/delivered", { message_ids: messageIds }).then((r) => r.data),
  typing: (peerId: number) =>
    api.post(`/messages/conversations/${peerId}/typing`, { typing: true }).then((r) => r.data),
  presence: (userIds: number[]) =>
    api.post<{ success: boolean; data: { online: number[] } }>("/presence", { user_ids: userIds }).then((r) => r.data.data.online),

  // Calls - 1:1 signalling.
  initiateCall: (toUserId: number, type: "audio" | "video") =>
    api.post<{ success: boolean; data: { call_id: string } }>("/calls", { to_user_id: toUserId, type }).then((r) => r.data.data),
  acceptCall: (id: string) => api.post(`/calls/${id}/accept`).then((r) => r.data),
  rejectCall: (id: string) => api.post(`/calls/${id}/reject`).then((r) => r.data),
  endCall: (id: string) => api.post(`/calls/${id}/end`).then((r) => r.data),
  signalCall: (id: string, toUserId: number, type: string, payload: any) =>
    api.post(`/calls/${id}/signal`, { to_user_id: toUserId, type, payload }).then((r) => r.data),
};
