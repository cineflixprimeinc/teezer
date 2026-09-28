package clickhouse

import "testing"

// Verifies decodeProcessingEvent against JSON shaped EXACTLY like what
// ProcessingEventStream::push (server/app/Services/Video/ProcessingEventStream.php)
// actually produces - field names are the wire contract between the two
// services, and a mismatch there fails silently (the event just decodes to
// zero values) rather than as a compile error. The previous session's real
// GET /videos/{id}/status nesting bug is exactly the class of mistake this
// guards against, one layer over.
func TestDecodeProcessingEvent_MatchesPHPWireShape(t *testing.T) {
	raw := `{"type":"video_transcoding_fallback_started","video_id":42,"user_id":7,"provider":"ffmpeg","attempt":2,"duration_ms":1500,"error_code":"primary_failed","payload":"{\"reason\":\"429\"}","ts":"2026-09-01 12:00:00.000"}`

	ev, err := decodeProcessingEvent(raw)
	if err != nil {
		t.Fatalf("decodeProcessingEvent returned an error: %v", err)
	}

	if ev.Type != "video_transcoding_fallback_started" {
		t.Errorf("Type = %q, want video_transcoding_fallback_started", ev.Type)
	}
	if ev.VideoID != 42 {
		t.Errorf("VideoID = %d, want 42", ev.VideoID)
	}
	if ev.UserID != 7 {
		t.Errorf("UserID = %d, want 7", ev.UserID)
	}
	if ev.Provider != "ffmpeg" {
		t.Errorf("Provider = %q, want ffmpeg", ev.Provider)
	}
	if ev.Attempt != 2 {
		t.Errorf("Attempt = %d, want 2", ev.Attempt)
	}
	if ev.DurationMs != 1500 {
		t.Errorf("DurationMs = %d, want 1500", ev.DurationMs)
	}
	if ev.ErrorCode != "primary_failed" {
		t.Errorf("ErrorCode = %q, want primary_failed", ev.ErrorCode)
	}
	if ev.Payload != `{"reason":"429"}` {
		t.Errorf("Payload = %q, want {\"reason\":\"429\"}", ev.Payload)
	}
	if ev.Time.IsZero() {
		t.Error("Time should have parsed from ts, got zero value")
	}
}

// A minimal event (only the fields ProcessingEventStream::push guarantees -
// type and video_id, everything else optional/omitted) must still decode,
// with the omitted fields at their zero values.
func TestDecodeProcessingEvent_MinimalEvent(t *testing.T) {
	raw := `{"type":"video_upload_started","video_id":0,"user_id":1,"ts":"2026-09-01 12:00:00.000"}`

	ev, err := decodeProcessingEvent(raw)
	if err != nil {
		t.Fatalf("decodeProcessingEvent returned an error: %v", err)
	}
	if ev.Type != "video_upload_started" {
		t.Errorf("Type = %q, want video_upload_started", ev.Type)
	}
	if ev.Provider != "" {
		t.Errorf("Provider = %q, want empty string for an omitted field", ev.Provider)
	}
	if ev.Attempt != 0 {
		t.Errorf("Attempt = %d, want 0 (default applied later, in ProcessingWriter.Enqueue, not here)", ev.Attempt)
	}
}

func TestDecodeProcessingEvent_MissingType(t *testing.T) {
	if _, err := decodeProcessingEvent(`{"video_id":1}`); err == nil {
		t.Error("expected an error for an event with no type, got nil")
	}
}

func TestDecodeProcessingEvent_InvalidJSON(t *testing.T) {
	if _, err := decodeProcessingEvent(`not json`); err == nil {
		t.Error("expected an error for invalid JSON, got nil")
	}
}
