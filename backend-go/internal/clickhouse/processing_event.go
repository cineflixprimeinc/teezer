package clickhouse

import "time"

// ProcessingEvent is one row of reelsoo.video_processing_events - see
// deploy/clickhouse/schema/03-video-processing-events.sql for the DDL this
// must stay in step with (the batch append in processing_writer.go is
// positional). A deliberately separate shape from Event (event.go): that
// struct's fields are fixed to engagement analytics and don't fit an
// operational pipeline transition without bending badly.
type ProcessingEvent struct {
	Time       time.Time
	Type       string // see the event_type comment in the DDL for the vocabulary
	VideoID    uint64
	UserID     uint64 // video owner, 0 if not yet known
	Provider   string // apivideo / ffmpeg / ""
	Attempt    uint8
	DurationMs uint32 // how long THIS step took, 0 if not meaningful for this event
	ErrorCode  string
	Payload    string // raw JSON escape hatch
}

// Processing pipeline event type vocabulary - kept as constants for the same
// reason Event's TypeView etc. are (event.go): a typo here is a compile
// error, not a metric that silently reads zero forever.
const (
	ProcTypeUploadStarted    = "video_upload_started"
	ProcTypeUploadCompleted  = "video_upload_completed"
	ProcTypeTranscodeStarted = "video_transcoding_started"
	ProcTypePrimarySuccess   = "video_transcoding_primary_success"
	ProcTypePrimaryFailed    = "video_transcoding_primary_failed"
	ProcTypeFallbackStarted  = "video_transcoding_fallback_started"
	ProcTypeFallbackSuccess  = "video_transcoding_fallback_success"
	ProcTypeFailed           = "video_transcoding_failed"
	ProcTypeReady            = "video_ready"
)
