/**
 * Everything reportable in the app, in one place: which endpoint a report
 * for it posts to, and exactly which reasons it accepts. The reason VALUES
 * here are not decorative - they must match each backend endpoint's own
 * `validate(['reason' => ['in:...']])` list exactly, or every submission
 * 422s. Reused by both the web ReportModal and (conceptually) mobile's
 * matching ReportSheet, so a category can never drift between platforms.
 *
 * Video/comment/story keep their own existing, already-shipped reason
 * spellings (e.g. video's `hate`, comment's `hate_speech`) rather than
 * being harmonized - those are live production enums with real data
 * behind them; renaming values would be a breaking migration for zero
 * user-facing benefit. User/conversation/live-stream/space are new (see
 * ContentReport) and use one consistent modern spelling throughout.
 */

export type ReportEntityType =
  | "video" | "comment" | "story" | "user"
  | "conversation" | "message_request" | "live_stream" | "space";

export interface ReportReasonOption {
  value: string;
  label: string;
  /** Shown under the label once selected - a little guidance on what belongs in this bucket. */
  hint?: string;
}

export interface ReportEntityConfig {
  /** What shows in the modal's title/intro, e.g. "Report this video". */
  noun: string;
  reasons: ReportReasonOption[];
  /** Whether a free-text details field is offered (story's backend has none - omitting it there avoids collecting text that would just be dropped). */
  allowDetails: boolean;
  /** Builds the POST path for a given entity id. */
  endpoint: (id: number | string) => string;
}

const NUDITY: ReportReasonOption = { value: "nudity", label: "Nudity or sexual content" };
const HATE_SPEECH_HS: ReportReasonOption = { value: "hate_speech", label: "Hate speech" };
const HARASSMENT: ReportReasonOption = { value: "harassment", label: "Harassment or bullying" };
const VIOLENCE: ReportReasonOption = { value: "violence", label: "Violence or dangerous acts" };
const MISINFORMATION: ReportReasonOption = { value: "misinformation", label: "False information" };
const SPAM: ReportReasonOption = { value: "spam", label: "Spam" };
const OTHER: ReportReasonOption = { value: "other", label: "Something else", hint: "Tell us more below." };

const CONVERSATION_REASONS: ReportReasonOption[] = [
  SPAM, HARASSMENT, HATE_SPEECH_HS, NUDITY, { value: "scam_fraud", label: "Scam or fraud" }, OTHER,
];

export const REPORT_CONFIG: Record<ReportEntityType, ReportEntityConfig> = {
  video: {
    noun: "this video",
    allowDetails: true,
    endpoint: (id) => `/videos/${id}/report`,
    reasons: [
      SPAM,
      NUDITY,
      { value: "hate", label: "Hate speech or symbols" },
      MISINFORMATION,
      VIOLENCE,
      { value: "copyright", label: "Copyright infringement" },
      HARASSMENT,
      OTHER,
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
    reasons: [
      SPAM,
      { value: "inappropriate", label: "Inappropriate content" },
      VIOLENCE,
      HATE_SPEECH_HS,
      MISINFORMATION,
      OTHER,
    ],
  },
  user: {
    noun: "this account",
    allowDetails: true,
    endpoint: (username) => `/users/${username}/report`,
    reasons: [
      SPAM,
      { value: "fake_impersonation", label: "Fake account or impersonation" },
      HARASSMENT,
      HATE_SPEECH_HS,
      NUDITY,
      { value: "underage", label: "Under the minimum age" },
      { value: "scam_fraud", label: "Scam or fraud" },
      OTHER,
    ],
  },
  conversation: {
    noun: "this conversation",
    allowDetails: true,
    endpoint: (userId) => `/messages/conversations/${userId}/report`,
    reasons: CONVERSATION_REASONS,
  },
  // A still-pending message request, reported before it's ever been
  // accepted - a different backend endpoint (MessageController::
  // reportRequest, keyed by the conversation's own id) that also declines
  // the request as part of reporting it, unlike the general `conversation`
  // entry above which only reports an already-accepted one.
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
    reasons: [
      SPAM, NUDITY, HATE_SPEECH_HS, HARASSMENT, VIOLENCE,
      { value: "self_harm", label: "Suicide or self-harm" },
      { value: "scam_fraud", label: "Scam or fraud" },
      OTHER,
    ],
  },
  space: {
    noun: "this Space",
    allowDetails: true,
    endpoint: (id) => `/spaces/${id}/report`,
    reasons: [
      SPAM, NUDITY, HATE_SPEECH_HS, HARASSMENT, VIOLENCE,
      { value: "self_harm", label: "Suicide or self-harm" },
      { value: "scam_fraud", label: "Scam or fraud" },
      OTHER,
    ],
  },
};
