import { api } from "./api";

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const adminService = {
  stats:        async () => (await api.get("/admin/stats")).data.data,
  userStats:    async () => (await api.get("/admin/stats/users")).data.data,
  systemHealth: async () => (await api.get("/admin/system-health")).data.data,

  // ── Monitoring (read-only platform health + metrics) ───────────────────────
  monitoring: {
    overview: async () => (await api.get("/admin/monitoring/overview")).data.data,
    redis:    async () => (await api.get("/admin/monitoring/redis")).data.data,
    database: async () => (await api.get("/admin/monitoring/database")).data.data,
    queue:    async () => (await api.get("/admin/monitoring/queue")).data.data,
    realtime: async () => (await api.get("/admin/monitoring/realtime")).data.data,
    logs:     async () => (await api.get("/admin/monitoring/logs")).data.data,
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  users: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/users", { params })).data,
  user: async (id: number) =>
    (await api.get(`/admin/users/${id}`)).data.data,
  updateUser: async (id: number, data: Record<string, string>) =>
    (await api.put(`/admin/users/${id}`, data)).data,
  banUser: async (id: number, reason: string) =>
    (await api.post(`/admin/users/${id}/ban`, { reason })).data,
  unbanUser: async (id: number) =>
    (await api.post(`/admin/users/${id}/unban`)).data,
  suspendUser: async (id: number, reason: string, suspendUntil?: string | null) =>
    (await api.post(`/admin/users/${id}/suspend`, { reason, suspend_until: suspendUntil ?? null })).data,
  promoteUser: async (id: number, role: string) =>
    (await api.post(`/admin/users/${id}/promote`, { role })).data,
  verifyUser: async (id: number) =>
    (await api.post(`/admin/users/${id}/verify`)).data,
  unverifyUser: async (id: number) =>
    (await api.post(`/admin/users/${id}/unverify`)).data,
  warnUser: async (id: number, reason: string) =>
    (await api.post(`/admin/users/${id}/warn`, { reason })).data,
  resetPassword: async (id: number) =>
    (await api.post(`/admin/users/${id}/reset-password`)).data,
  deleteUser: async (id: number) =>
    (await api.delete(`/admin/users/${id}`)).data,
  countryOverride: async (id: number, data: Record<string, string>) =>
    (await api.post(`/admin/users/${id}/country-override`, data)).data,

  // ── Sounds ───────────────────────────────────────────────────────────────
  soundStats: async () =>
    (await api.get("/admin/sounds/stats")).data.data,
  sounds: async (params?: Record<string, string | number | boolean>) =>
    (await api.get("/admin/sounds", { params })).data,
  soundVideos: async (id: number, params?: Record<string, string | number>) =>
    (await api.get(`/admin/sounds/${id}/videos`, { params })).data,

  // ── Videos ────────────────────────────────────────────────────────────────
  videos: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/videos", { params })).data,
  videoDetail: async (id: number) =>
    (await api.get(`/admin/videos/${id}`)).data.data,
  videoStats: async () =>
    (await api.get("/admin/videos/stats")).data.data,
  removeVideo: async (id: number, reason?: string) =>
    (await api.post(`/admin/videos/${id}/remove`, { reason })).data,
  restoreVideo: async (id: number, restoreStatus?: string) =>
    (await api.post(`/admin/videos/${id}/restore`, restoreStatus ? { restore_status: restoreStatus } : {})).data,
  permanentDeleteVideo: async (id: number) =>
    (await api.delete(`/admin/videos/${id}/permanent`)).data,
  featureVideo: async (id: number, featured: boolean) =>
    (await api.post(`/admin/videos/${id}/feature`, { featured })).data,
  videoEditData: async (id: number) =>
    (await api.get(`/admin/videos/${id}/edit-data`)).data.data as { video: unknown; earnings: unknown; playlists: { id: number; title: string }[] },
  updateVideo: async (id: number, data: Record<string, unknown>) =>
    (await api.put(`/admin/videos/${id}`, data)).data.data,
  updateVideoSettings: async (id: number, data: Record<string, unknown>) =>
    (await api.patch(`/admin/videos/${id}/settings`, data)).data.data,
  updateVideoMonetization: async (id: number, data: Record<string, unknown>) =>
    (await api.patch(`/admin/videos/${id}/monetization`, data)).data.data,
  updateVideoVisibility: async (id: number, data: Record<string, unknown>) =>
    (await api.patch(`/admin/videos/${id}/visibility`, data)).data.data,
  updateVideoAdvanced: async (id: number, data: Record<string, unknown>) =>
    (await api.patch(`/admin/videos/${id}/advanced`, data)).data.data,
  unpublishVideo: async (id: number) =>
    (await api.post(`/admin/videos/${id}/unpublish`)).data,
  runVideoSafetyCheck: async (id: number) =>
    (await api.post(`/admin/videos/${id}/run-safety-check`)).data,
  reprocessVideo: async (id: number) =>
    (await api.post(`/admin/videos/${id}/reprocess`)).data,

  // ── Reports ───────────────────────────────────────────────────────────────
  reports: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/reports", { params })).data,
  reportDetail: async (id: number, type = "video") =>
    (await api.get(`/admin/reports/${id}`, { params: { type } })).data.data,
  reportStats: async () =>
    (await api.get("/admin/reports/stats")).data.data,
  reportAction: async (id: number, action: string, type = "video", reason?: string) =>
    (await api.post(`/admin/reports/${id}/action`, { action, type, reason })).data,

  // ── Verification ──────────────────────────────────────────────────────────
  verifications: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/verification", { params })).data,
  verificationDetail: async (id: number) =>
    (await api.get(`/admin/verification/${id}`)).data.data,
  /** mode "permanent" grants a badge that never expires and is never billed (staff). */
  approveVerification: async (
    id: number,
    mode: "subscription" | "permanent" = "subscription",
    notify: { app: boolean; email: boolean } = { app: true, email: true },
  ) =>
    (await api.post(`/admin/verification/${id}/approve`, {
      mode, notify_app: notify.app, notify_email: notify.email,
    })).data,

  rejectVerification: async (
    id: number,
    reason: string,
    notify: { app: boolean; email: boolean } = { app: true, email: true },
  ) =>
    (await api.post(`/admin/verification/${id}/reject`, {
      rejection_reason: reason, notify_app: notify.app, notify_email: notify.email,
    })).data,

  /** Take a granted badge back. Reason is required - the user is shown it. */
  revokeVerification: async (
    id: number,
    reason: string,
    notify: { app: boolean; email: boolean } = { app: true, email: true },
  ) =>
    (await api.post(`/admin/verification/${id}/revoke`, {
      reason, notify_app: notify.app, notify_email: notify.email,
    })).data,

  // ── Settings & feature flags ──────────────────────────────────────────────
  settings: async (group?: string) =>
    (await api.get("/admin/settings", { params: group ? { group } : {} })).data.data,
  settingsGroups: async () =>
    (await api.get("/admin/settings/groups")).data.data,
  updateSetting: async (key: string, value: string, type?: string, group?: string) =>
    (await api.post("/admin/settings", { key, value, type, group })).data,
  features: async () =>
    (await api.get("/admin/features")).data.data,
  toggleFeature: async (key: string, enabled: boolean) =>
    (await api.post(`/admin/features/${key}`, { enabled })).data,

  // ── Country Availability ────────────────────────────────────────────────
  countryAvailability: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/settings/country-availability", { params })).data,
  updateCountryAvailabilityGlobal: async (data: Record<string, unknown>) =>
    (await api.put("/admin/settings/country-availability", data)).data,
  updateCountryAvailabilityCountry: async (code: string, data: Record<string, unknown>) =>
    (await api.put(`/admin/settings/country-availability/countries/${code}`, data)).data,
  bulkUpdateCountryAvailability: async (codes: string[], action: string, expectedVersion?: number) =>
    (await api.post("/admin/settings/country-availability/bulk", {
      codes, action, ...(expectedVersion !== undefined && { expected_version: expectedVersion }),
    })).data,
  countryAvailabilityDetail: async (code: string) =>
    (await api.get(`/admin/settings/country-availability/countries/${code}`)).data,
  countryAvailabilityHistory: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/settings/country-availability/history", { params })).data,
  countryProviderHealth: async () =>
    (await api.get("/admin/settings/country-availability/provider-health")).data,

  // ── Fine-grained admin permissions ──────────────────────────────────────
  permissionsCatalog: async () =>
    (await api.get("/admin/permissions")).data.data,
  grantPermission: async (userId: number, permission: string) =>
    (await api.post(`/admin/users/${userId}/permissions`, { permission })).data,
  revokePermission: async (userId: number, permission: string) =>
    (await api.delete(`/admin/users/${userId}/permissions/${permission}`)).data,

  // ── User 360 Profile ──────────────────────────────────────────────────────
  user360: async (id: number) =>
    (await api.get(`/admin/users/${id}/360`)).data.data,
  // ── Monetization (User 360) ──
  userMonetization: async (id: number) =>
    (await api.get(`/admin/users/${id}/monetization`)).data.data,
  updateMonetizationStatus: async (id: number, action: "pause" | "ban" | "reset" | "enable") =>
    (await api.patch(`/admin/users/${id}/monetization/status`, { action })).data,
  updateMonetizationSetting: async (id: number, patch: Record<string, boolean>) =>
    (await api.patch(`/admin/users/${id}/monetization/settings`, patch)).data,
  saveMonetizationNote: async (id: number, note: string) =>
    (await api.post(`/admin/users/${id}/monetization/note`, { note })).data,
  updatePayoutRequest: async (id: number, payoutId: number, action: "approve" | "complete" | "reject", reason?: string) =>
    (await api.patch(`/admin/users/${id}/payouts/${payoutId}`, { action, reason: reason ?? null })).data,
  // ── Finance & Tax (User 360) ──
  userFinance: async (id: number) =>
    (await api.get(`/admin/users/${id}/finance`)).data.data,
  updateTaxForm: async (id: number, formId: number, status: "approved" | "rejected" | "under_review", note?: string) =>
    (await api.patch(`/admin/users/${id}/tax-forms/${formId}`, { status, note: note ?? null })).data,
  requestTaxInfo: async (id: number, action: "submit" | "update") =>
    (await api.post(`/admin/users/${id}/tax-forms/request`, { action })).data,
  addAdvanceFunds: async (id: number, amount: number, description?: string) =>
    (await api.post(`/admin/users/${id}/advance-funds`, { amount, description: description ?? null })).data,
  // ── Ads & Control (User 360) ──
  userAds: async (id: number) =>
    (await api.get(`/admin/users/${id}/ads`)).data.data,
  updateAdAccountStatus: async (id: number, status: "active" | "suspended" | "closed") =>
    (await api.patch(`/admin/users/${id}/ad-account`, { status })).data,
  adAccountControl: async (id: number, action: "suspend" | "activate" | "disable_ads" | "enable_ads" | "freeze_funds" | "unfreeze_funds") =>
    (await api.patch(`/admin/users/${id}/ad-account/control`, { action })).data,
  pauseCampaign: async (campaignId: number) =>
    (await api.post(`/admin/ads/campaigns/${campaignId}/pause`)).data,
  resumeCampaign: async (campaignId: number) =>
    (await api.post(`/admin/ads/campaigns/${campaignId}/resume`)).data,
  updateAdStatus: async (id: number, creativeId: number, action: "pause" | "resume") =>
    (await api.post(`/admin/users/${id}/ads/${creativeId}/status`, { action })).data,
  updateModeration: async (id: number, data: Record<string, unknown>) =>
    (await api.put(`/admin/users/${id}/moderation`, data)).data,
  updatePermissions: async (id: number, data: Record<string, unknown>) =>
    (await api.put(`/admin/users/${id}/permissions`, data)).data,
  updateSafety: async (id: number, data: Record<string, unknown>) =>
    (await api.put(`/admin/users/${id}/safety`, data)).data,
  addStrike: async (id: number, reason: string) =>
    (await api.post(`/admin/users/${id}/strike`, { reason })).data,
  issueWarning360: async (id: number, reason: string) =>
    (await api.post(`/admin/users/${id}/issue-warning`, { reason })).data,
  addNote: async (id: number, note: string) =>
    (await api.post(`/admin/users/${id}/notes`, { note })).data,
  updateNote: async (id: number, noteId: number, note: string) =>
    (await api.patch(`/admin/users/${id}/notes/${noteId}`, { note })).data,
  deleteNote: async (id: number, noteId: number) =>
    (await api.delete(`/admin/users/${id}/notes/${noteId}`)).data,
  messageUser: async (id: number, message: string) =>
    (await api.post(`/admin/users/${id}/message`, { message })).data,
  editUser: async (id: number, data: Record<string, unknown>) =>
    (await api.put(`/admin/users/${id}/edit`, data)).data,
  uploadUserAvatar: async (id: number, file: File) => {
    const fd = new FormData();
    fd.append("avatar", file);
    return (await api.post(`/admin/users/${id}/upload-avatar`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
  getRestrictions: async (id: number) =>
    (await api.get(`/admin/users/${id}/restrictions`)).data.data as Record<string, { is_active: boolean; expires_at: string | null; reason: string | null }>,
  updateRestrictions: async (id: number, restrictions: { type: string; is_active: boolean; expires_at: string | null; reason: string | null }[]) =>
    (await api.patch(`/admin/users/${id}/restrictions`, { restrictions })).data,
  getBlockedUsers: async (id: number) =>
    (await api.get(`/admin/users/${id}/blocked-users`)).data.data as { id: number; user_id: number; name: string; username: string; avatar: string | null; blocked_at: string }[],
  getHiddenWords: async (id: number) =>
    (await api.get(`/admin/users/${id}/hidden-words`)).data.data as { id: number; word: string; created_at: string }[],
  deleteHiddenWord: async (id: number, wid: number) =>
    (await api.delete(`/admin/users/${id}/hidden-words/${wid}`)).data,
  getDataRequests: async (id: number) =>
    (await api.get(`/admin/users/${id}/data-requests`)).data.data as { id: number; status: string; created_at: string; completed_at: string | null }[],
  updateDataRequest: async (id: number, rid: number, status: string) =>
    (await api.patch(`/admin/users/${id}/data-requests/${rid}`, { status })).data,
  getDeletionRequests: async (id: number) =>
    (await api.get(`/admin/users/${id}/deletion-requests`)).data.data as { id: number; reason: string | null; status: string; scheduled_at: string | null; created_at: string }[],
  updateDeletionRequest: async (id: number, rid: number, status: string) =>
    (await api.patch(`/admin/users/${id}/deletion-requests/${rid}`, { status })).data,
  unsuspendUser: async (id: number) =>
    (await api.post(`/admin/users/${id}/unsuspend`)).data,
  riskHealth: async (id: number) =>
    (await api.get(`/admin/users/${id}/risk-health`)).data.data,
  quickStats: async (id: number, period: string) =>
    (await api.get(`/admin/users/${id}/quick-stats`, { params: { period } })).data.data,

  // ── Action logs ───────────────────────────────────────────────────────────
  actionLogs: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/action-logs", { params })).data,

  // ── Moderation ────────────────────────────────────────────────────────────
  moderationStats:    async () => (await api.get("/admin/moderation/stats")).data.data,
  moderationPending:  async (params?: Record<string, string | number>) =>
    (await api.get("/admin/moderation/pending", { params })).data,
  moderationLogs:     async (params?: Record<string, string | number>) =>
    (await api.get("/admin/moderation/logs", { params })).data,
  moderationDecide:   async (id: number | string, decision: string, reason?: string) =>
    (await api.post(`/admin/moderation/${id}/decision`, { decision, reason })).data,
  moderationSettings: async () =>
    (await api.get("/admin/moderation/settings")).data.data,
  updateModerationSettings: async (data: Record<string, unknown>) =>
    (await api.post("/admin/moderation/settings", data)).data,
  scannerHealth: async () =>
    (await api.get("/admin/moderation/scanner-health")).data,
  sightengineTest: async () =>
    (await api.post("/admin/moderation/sightengine-test")).data,

  // ── CMS pages ─────────────────────────────────────────────────────────────
  cmsPages: async () =>
    (await api.get("/admin/cms")).data.data,
  cmsPage: async (slug: string) =>
    (await api.get(`/admin/cms/${slug}`)).data.data,
  updateCmsPage: async (slug: string, data: Record<string, unknown>) =>
    (await api.put(`/admin/cms/${slug}`, data)).data,
  createCmsPage: async (data: Record<string, unknown>) =>
    (await api.post("/admin/cms", data)).data,
  deleteCmsPage: async (slug: string) =>
    (await api.delete(`/admin/cms/${slug}`)).data,

  // ── Menu management ───────────────────────────────────────────────────────
  menus: async () =>
    (await api.get("/admin/menus")).data.data,
  updateMenu: async (id: number, data: Record<string, unknown>) =>
    (await api.put(`/admin/menus/${id}`, data)).data,
  reorderMenus: async (items: { id: number; sort_order: number }[]) =>
    (await api.post("/admin/menus/reorder", { items })).data,

  // ── Hashtags ──────────────────────────────────────────────────────────────
  hashtags: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/hashtags", { params })).data,
  /* ── Admin RBAC ─────────────────────────────────────────────────────────── */
  rbacOverview:    async () => (await api.get("/admin/rbac/overview")).data.data,
  rbacPermissions: async () => (await api.get("/admin/rbac/permissions")).data.data,
  rbacMatrix:      async () => (await api.get("/admin/rbac/matrix")).data.data,
  rbacRoles:       async (params?: Record<string, string>) => (await api.get("/admin/rbac/roles", { params })).data.data,
  rbacRole:        async (id: number) => (await api.get(`/admin/rbac/roles/${id}`)).data.data,
  rbacCreateRole:  async (body: unknown) => (await api.post("/admin/rbac/roles", body)).data,
  rbacUpdateRole:  async (id: number, body: unknown) => (await api.put(`/admin/rbac/roles/${id}`, body)).data,
  rbacDuplicateRole: async (id: number, body: unknown) => (await api.post(`/admin/rbac/roles/${id}/duplicate`, body)).data,
  rbacDeleteRole:  async (id: number, body: unknown) => (await api.delete(`/admin/rbac/roles/${id}`, { data: body })).data,
  rbacAdmins:      async (params?: Record<string, string | number>) => (await api.get("/admin/rbac/administrators", { params })).data,
  rbacAdmin:       async (id: number) => (await api.get(`/admin/rbac/administrators/${id}`)).data.data,
  rbacCreateAdmin: async (body: unknown) => (await api.post("/admin/rbac/administrators", body)).data,
  rbacUpdateAdmin: async (id: number, body: unknown) => (await api.put(`/admin/rbac/administrators/${id}`, body)).data,
  rbacRemoveAdmin: async (id: number) => (await api.delete(`/admin/rbac/administrators/${id}`)).data,
  rbacRevokeSessions: async (id: number) => (await api.post(`/admin/rbac/administrators/${id}/revoke-sessions`)).data,
  rbacSearchUsers: async (q: string) => (await api.get("/admin/rbac/search-users", { params: { q } })).data.data,
  rbacActivity:    async (params?: Record<string, string | number>) => (await api.get("/admin/rbac/activity", { params })).data,

  monetizationOverview: async (range: string) =>
    (await api.get("/admin/monetization/overview", { params: { range } })).data.data,
  hashtagAction: async (id: number, action: string, reason?: string) =>
    (await api.post(`/admin/hashtags/${id}/action`, { action, ...(reason ? { reason } : {}) })).data,
  hashtagBulk: async (ids: number[], action: string, reason?: string) =>
    (await api.post("/admin/hashtags/bulk", { ids, action, ...(reason ? { reason } : {}) })).data,

  // ── Audio Rooms (Spaces) ──────────────────────────────────────────────────
  // Rooms are hosted by users from the app, so there is no create/edit here -
  // only the listing and the two moderator levers.
  spaces: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/spaces", { params })).data,
  spaceStats: async () =>
    (await api.get("/admin/spaces/stats")).data.data,
  space: async (id: number) =>
    (await api.get(`/admin/spaces/${id}`)).data.data,
  endSpace: async (id: number, reason?: string) =>
    (await api.post(`/admin/spaces/${id}/end`, { reason: reason ?? null })).data,
  deleteSpace: async (id: number) =>
    (await api.delete(`/admin/spaces/${id}`)).data,
  // Live moderation levers (real endpoints).
  spaceControls: async (id: number, patch: Record<string, boolean | string | number>) =>
    (await api.patch(`/admin/spaces/${id}/controls`, patch)).data,
  spaceMuteAll: async (id: number) =>
    (await api.post(`/admin/spaces/${id}/mute-all`)).data,
  spaceClearRequests: async (id: number) =>
    (await api.post(`/admin/spaces/${id}/clear-requests`)).data,
  spaceRemoveListeners: async (id: number) =>
    (await api.post(`/admin/spaces/${id}/remove-listeners`)).data,
  spaceMuteParticipant: async (id: number, participantId: number) =>
    (await api.post(`/admin/spaces/${id}/participants/${participantId}/mute`)).data,
  spaceRemoveParticipant: async (id: number, participantId: number) =>
    (await api.post(`/admin/spaces/${id}/participants/${participantId}/remove`)).data,

  // ── Hashtag Challenges (full CRUD - staff-authored content) ────────────────
  challenges: async (params?: Record<string, string | number>) =>
    (await api.get("/admin/challenges", { params })).data,
  challengeStats: async () =>
    (await api.get("/admin/challenges/stats")).data.data,
  challenge: async (id: number) =>
    (await api.get(`/admin/challenges/${id}`)).data.data,
  createChallenge: async (data: Record<string, unknown>) =>
    (await api.post("/admin/challenges", data)).data,
  updateChallenge: async (id: number, data: Record<string, unknown>) =>
    (await api.patch(`/admin/challenges/${id}`, data)).data,
  endChallenge: async (id: number) =>
    (await api.post(`/admin/challenges/${id}/end`)).data,
  deleteChallenge: async (id: number) =>
    (await api.delete(`/admin/challenges/${id}`)).data,

  // ── Notifications ─────────────────────────────────────────────────────────
  broadcastNotification: async (title: string, body: string, target: string) =>
    (await api.post("/admin/notifications/broadcast", { title, body, target })).data,

  // ── Settings → Monetization Enable and Disable ─────────────────────────
  monetizationPrograms: async () =>
    (await api.get("/admin/monetization-programs")).data.data,
  updateMonetizationProgram: async (
    key: string,
    data: Record<string, unknown>,
  ) => (await api.put(`/admin/monetization-programs/${key}`, data)).data,
  setMonetizationProgramMode: async (key: string, mode: string) =>
    (await api.patch(`/admin/monetization-programs/${key}/mode`, { mode })).data,
  setMonetizationMaster: async (enabled: boolean) =>
    (await api.patch("/admin/monetization-programs/master", { enabled })).data,
  updatePlatformRequirement: async (
    key: string,
    data: Record<string, unknown>,
  ) => (await api.put(`/admin/platform-requirements/${key}`, data)).data,

  // ── Email & OTP settings ───────────────────────────────────────────────
  emailSettings: async () =>
    (await api.get("/admin/email-settings")).data.data,
  updateEmailSettings: async (data: Record<string, string>) =>
    (await api.post("/admin/email-settings/email", data)).data,
  updateOtpSettings: async (data: Record<string, number>) =>
    (await api.post("/admin/email-settings/otp", data)).data,
  testEmail: async (to: string) =>
    (await api.post("/admin/email-settings/test", { to })).data,
};
