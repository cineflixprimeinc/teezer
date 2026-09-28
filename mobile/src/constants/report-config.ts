/**
 * Everything reportable in the app, in one place - the mobile twin of
 * frontend/src/lib/report-config.ts. Same entity types, same reason
 * VALUES (they must match each backend endpoint's own
 * validate(['reason' => ['in:...']]) list exactly), so a category can
 * never drift between web and app even though the two config files are
 * necessarily separate (RN can't import from the Next.js app).
 */

export type ReportEntityType =
  | "video" | "comment" | "story" | "user"
  | "conversation" | "message_request" | "live_stream" | "space";

export interface ReportReasonOption {
  value: string;
  label: string;
}

export interface ReportEntityConfig {
  noun: string;
  reasons: ReportReasonOption[];
  allowDetails: boolean;
  endpoint: (id: number | string) => string;
}

const NUDITY: ReportReasonOption = { value: "nudity", label: "Nudity or sexual content" };
const HATE_SPEECH_HS: ReportReasonOption = { value: "hate_speech", label: "Hate speech" };
const HARASSMENT: ReportReasonOption = { value: "harassment", label: "Harassment or bullying" };
const VIOLENCE: ReportReasonOption = { value: "violence", label: "Violence or dangerous acts" };
const MISINFORMATION: ReportReasonOption = { value: "misinformation", label: "False information" };
const SPAM: ReportReasonOption = { value: "spam", label: "Spam" };
const OTHER: ReportReasonOption = { value: "other", label: "Something else" };
const SCAM: ReportReasonOption = { value: "scam_fraud", label: "Scam or fraud" };
const SELF_HARM: ReportReasonOption = { value: "self_harm", label: "Suicide or self-harm" };

const CONVERSATION_REASONS: ReportReasonOption[] = [SPAM, HARASSMENT, HATE_SPEECH_HS, NUDITY, SCAM, OTHER];

export const REPORT_CONFIG: Record<ReportEntityType, ReportEntityConfig> = {
  video: {
    noun: "this video",
    allowDetails: true,
    endpoint: (id) => `/videos/${id}/report`,
    reasons: [
      SPAM, NUDITY,
      { value: "hate", label: "Hate speech or symbols" },
      MISINFORMATION, VIOLENCE,
      { value: "copyright", label: "Copyright infringement" },
      HARASSMENT, OTHER,
    ],
  },
  comment: {
    noun: "this comment",
    allowDetails: true,
    endpoint: (id) => `/comments/${id}/report`,
    reasons: [SPAM, HARASSMENT, HATE_SPEECH_HS, NUDITY, VIOLENCE, MISINFORMATION, OTHER],
  },
  story: {
    noun: "this story",
    allowDetails: false,
    endpoint: (id) => `/stories/${id}/report`,
    reasons: [SPAM, { value: "inappropriate", label: "Inappropriate content" }, VIOLENCE, HATE_SPEECH_HS, MISINFORMATION, OTHER],
  },
  user: {
    noun: "this account",
    allowDetails: true,
    endpoint: (username) => `/users/${username}/report`,
    reasons: [
      SPAM,
      { value: "fake_impersonation", label: "Fake account or impersonation" },
      HARASSMENT, HATE_SPEECH_HS, NUDITY,
      { value: "underage", label: "Under the minimum age" },
      SCAM, OTHER,
    ],
  },
  conversation: {
    noun: "this conversation",
    allowDetails: true,
    endpoint: (userId) => `/messages/conversations/${userId}/report`,
    reasons: CONVERSATION_REASONS,
  },
  message_request: {
    noun: "this message request",
    allowDetails: true,
    endpoint: (conversationId) => `/messages/requests/${conversationId}/report`,
    reasons: CONVERSATION_REASONS,
  },
  live_stream: {
    noun: "this live stream",
    allowDetails: true,
    endpoint: (id) => `/live-streams/${id}/report`,
    reasons: [SPAM, NUDITY, HATE_SPEECH_HS, HARASSMENT, VIOLENCE, SELF_HARM, SCAM, OTHER],
  },
  space: {
    noun: "this Space",
    allowDetails: true,
    endpoint: (id) => `/spaces/${id}/report`,
    reasons: [SPAM, NUDITY, HATE_SPEECH_HS, HARASSMENT, VIOLENCE, SELF_HARM, SCAM, OTHER],
  },
};
