package handlers

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// Expected strings taken verbatim from NotificationService::displayMessage's
// docblock so the Go port stays sentence-for-sentence identical.
func TestDisplayMessage(t *testing.T) {
	cases := []struct {
		name  string
		typ   string
		names []string
		count int
		want  string
	}{
		{"one", "like", []string{"Rahul"}, 1, "Rahul liked your video"},
		{"two", "like", []string{"Rahul", "Sita"}, 2, "Rahul and Sita liked your video"},
		{"three", "like", []string{"Rahul", "Sita", "Ram"}, 3, "Rahul, Sita and Ram liked your video"},
		{"many", "like", []string{"Rahul", "Sita", "Ram"}, 18, "Rahul and 17 others liked your video"},
		{"no-names", "like", nil, 20, "20 people liked your video"},
		{"no-names-one", "like", nil, 1, "1 person liked your video"},
		{"count-below-names", "like", []string{"A", "B"}, 1, "A and B liked your video"}, // count = max(count,len)
		{"other-verb", "follow", []string{"Rahul"}, 1, "Rahul started following you"},
		{"four-others-one", "like", []string{"A"}, 2, "A and 1 other liked your video"},
		{"non-aggregatable", "gift", []string{"A"}, 1, ""},
		{"empty-name-filtered", "like", []string{"", "Sita"}, 2, "Sita and 1 other liked your video"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := displayMessage(tc.typ, tc.names, tc.count); got != tc.want {
				t.Errorf("displayMessage(%q,%v,%d) = %q, want %q", tc.typ, tc.names, tc.count, got, tc.want)
			}
		})
	}
}

func TestActorDisplayName(t *testing.T) {
	cases := []struct{ name, username, want string }{
		{"Rahul", "rahul99", "Rahul"},
		{"", "rahul99", "@rahul99"},
		{"", "", "Someone"},
	}
	for _, tc := range cases {
		if got := actorDisplayName(tc.name, tc.username); got != tc.want {
			t.Errorf("actorDisplayName(%q,%q) = %q, want %q", tc.name, tc.username, got, tc.want)
		}
	}
}

func TestMediaURL(t *testing.T) {
	h := &NotificationsHandler{mediaBaseURL: "https://cdn.teezer.live"}
	if got := h.mediaURL(""); got != nil {
		t.Errorf("empty path => %v, want nil", got)
	}
	if got := h.mediaURL("avatars/1.jpg"); got != "https://cdn.teezer.live/avatars/1.jpg" {
		t.Errorf("join => %v", got)
	}
	if got := h.mediaURL("/avatars/1.jpg"); got != "https://cdn.teezer.live/avatars/1.jpg" {
		t.Errorf("leading-slash join => %v", got)
	}
	empty := &NotificationsHandler{}
	if got := empty.mediaURL("avatars/1.jpg"); got != "avatars/1.jpg" {
		t.Errorf("no-base fallback => %v", got)
	}
}

func TestToIso8601(t *testing.T) {
	ts := pgtype.Timestamp{Time: time.Date(2026, 7, 11, 9, 8, 7, 0, time.UTC), Valid: true}
	if got := toIso8601(ts); got != "2026-07-11T09:08:07+00:00" {
		t.Errorf("toIso8601 = %v, want 2026-07-11T09:08:07+00:00", got)
	}
	if got := toIso8601(pgtype.Timestamp{}); got != nil {
		t.Errorf("invalid ts => %v, want nil", got)
	}
}
