package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/sqlc"
)

func TestSignedCdnURL(t *testing.T) {
	base, secret, key := "https://cdn.teezer.live", "s3cr3t", "videos/original/abc.mp4"
	got := signedCdnURL(base, secret, key, 1440)

	u, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if u.Scheme+"://"+u.Host+u.Path != base+"/"+key {
		t.Errorf("url base/path = %q", u.Scheme+"://"+u.Host+u.Path)
	}
	expires := u.Query().Get("expires")
	if _, err := strconv.ParseInt(expires, 10, 64); err != nil {
		t.Fatalf("expires not int: %q", expires)
	}
	// Recompute the token exactly as VideoResource::signedCdnUrl does.
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "/%s|%s", key, expires)
	want := hex.EncodeToString(mac.Sum(nil))
	if got := u.Query().Get("token"); got != want {
		t.Errorf("token = %q, want %q", got, want)
	}
}

func TestParseQualityUrls(t *testing.T) {
	base, secret := "https://cdn.teezer.live", "s"

	// Object with canonical-integer keys → label re-derived from the R2 path.
	obj := []byte(`{"360":"videos/quality/360/f.m3u8","480":"videos/quality/hi/f.m3u8"}`)
	got := parseQualityUrls(obj, base, secret, 1440)
	if got == nil {
		t.Fatal("object form returned nil")
	}
	if _, ok := got["360"]; !ok {
		t.Errorf("missing label 360: %v keys", got)
	}
	if _, ok := got["hi"]; !ok { // key "480" but path says /quality/hi/
		t.Errorf("expected path-derived label 'hi': %v", got)
	}

	// Array form → labels from path, fallback qN.
	arr := []byte(`["videos/quality/720/f.m3u8","videos/plain/f.m3u8"]`)
	got = parseQualityUrls(arr, base, secret, 1440)
	if _, ok := got["720"]; !ok {
		t.Errorf("array: missing 720: %v", got)
	}
	if _, ok := got["q1"]; !ok {
		t.Errorf("array: missing fallback q1: %v", got)
	}

	// Non-integer object key used verbatim.
	got = parseQualityUrls([]byte(`{"hd":"videos/quality/999/f.m3u8"}`), base, secret, 1440)
	if _, ok := got["hd"]; !ok {
		t.Errorf("non-int key should be verbatim: %v", got)
	}

	// Empty / null → nil (key omitted).
	for _, raw := range [][]byte{nil, []byte(""), []byte("null"), []byte("{}"), []byte("[]")} {
		if parseQualityUrls(raw, base, secret, 1440) != nil {
			t.Errorf("empty %q should be nil", raw)
		}
	}
}

func TestParseMediaItems(t *testing.T) {
	base := "https://cdn.teezer.live"
	items, ok := parseMediaItems([]byte(`[{"object_key":"images/a.jpg","order":2,"mime_type":"image/jpeg"}]`), base)
	if !ok || len(items) != 1 {
		t.Fatalf("expected 1 item, got %v (%d)", ok, len(items))
	}
	it := items[0]
	if it["url"] != base+"/images/a.jpg" {
		t.Errorf("url = %v", it["url"])
	}
	if it["order"] != 2 {
		t.Errorf("order = %v", it["order"])
	}
	if it["mime_type"] != "image/jpeg" {
		t.Errorf("mime = %v", it["mime_type"])
	}

	if _, ok := parseMediaItems(nil, base); ok {
		t.Error("nil media should be empty")
	}
	if _, ok := parseMediaItems([]byte(`[]`), base); ok {
		t.Error("[] media should be empty")
	}
}

func TestMediaType(t *testing.T) {
	if got := mediaType(true, pgtype.Text{String: "video/mp4", Valid: true}); got != "image_carousel" {
		t.Errorf("carousel = %q", got)
	}
	if got := mediaType(false, pgtype.Text{String: "image/png", Valid: true}); got != "image" {
		t.Errorf("image = %q", got)
	}
	if got := mediaType(false, pgtype.Text{String: "video/mp4", Valid: true}); got != "video" {
		t.Errorf("video = %q", got)
	}
	if got := mediaType(false, pgtype.Text{}); got != "video" {
		t.Errorf("null mime = %q", got)
	}
}

func TestRoundAndEngagement(t *testing.T) {
	if got := round(1.77777, 4); got != 1.7778 {
		t.Errorf("round = %v", got)
	}
	v := sqlc.GetVideoForShowRow{ViewsCount: 0}
	if got := engagementRate(v, 0); got != 0.0 {
		t.Errorf("zero views => %v", got)
	}
	// (10 likes + 5 comments + 3 shares + 2 saves) / 100 views * 100 = 20.0
	v = sqlc.GetVideoForShowRow{ViewsCount: 100, LikesCount: 10, SharesCount: 3, SavesCount: 2}
	if got := engagementRate(v, 5); got != 20.0 {
		t.Errorf("engagement = %v, want 20.0", got)
	}
}

func TestMusicCoverURL(t *testing.T) {
	base := "https://cdn.teezer.live"
	// Original + R2 key → joined.
	mt := &sqlc.MusicTrack{CoverUrl: pgtype.Text{String: "covers/x.jpg", Valid: true}}
	if got := musicCoverURL(mt, true, base); got != base+"/covers/x.jpg" {
		t.Errorf("original key => %v", got)
	}
	// Original but already absolute → verbatim.
	mt = &sqlc.MusicTrack{CoverUrl: pgtype.Text{String: "https://cdn/x.jpg", Valid: true}}
	if got := musicCoverURL(mt, true, base); got != "https://cdn/x.jpg" {
		t.Errorf("original http => %v", got)
	}
	// Library → verbatim even if it looks like a key.
	mt = &sqlc.MusicTrack{CoverUrl: pgtype.Text{String: "covers/y.jpg", Valid: true}}
	if got := musicCoverURL(mt, false, base); got != "covers/y.jpg" {
		t.Errorf("library => %v", got)
	}
	// Empty → nil.
	if got := musicCoverURL(&sqlc.MusicTrack{}, true, base); got != nil {
		t.Errorf("empty => %v", got)
	}
}
