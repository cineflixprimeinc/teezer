package storage

import (
	"regexp"
	"testing"
	"time"
)

// The key must match Laravel's StorageService::put exactly -
// {directory}/YYYY/MM/uuid.ext - so an object written by either backend lands in
// the same folder and reads back through the same URL.
func TestPutKeyFormat(t *testing.T) {
	s := &Service{now: func() time.Time { return time.Date(2026, 7, 17, 9, 0, 0, 0, time.UTC) }}

	got := s.buildKey("avatars", "PNG")
	re := regexp.MustCompile(`^avatars/2026/07/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$`)
	if !re.MatchString(got) {
		t.Errorf("key = %q, want avatars/2026/07/<uuid>.png", got)
	}
}

func TestPutKeyLowercasesAndDefaultsExtension(t *testing.T) {
	s := &Service{now: func() time.Time { return time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC) }}

	cases := map[string]string{
		"JPG":  "jpg",
		".WEBP": "webp",
		"":     "bin", // Laravel falls back to 'bin' when no extension is known
	}
	for in, wantExt := range cases {
		got := s.buildKey("images", in)
		if !regexp.MustCompile(`^images/2026/01/[0-9a-f-]{36}\.` + wantExt + `$`).MatchString(got) {
			t.Errorf("buildKey(images, %q) = %q, want extension .%s under images/2026/01", in, got, wantExt)
		}
	}
}

func TestConfiguredGate(t *testing.T) {
	if New(Config{}).Configured() {
		t.Error("an empty config must not be Configured()")
	}
	full := Config{
		AccessKeyID:     "k",
		SecretAccessKey: "s",
		Bucket:          "b",
		Endpoint:        "https://s3.us-west-004.backblazeb2.com",
		Region:          "us-west-004",
	}
	if !New(full).Configured() {
		t.Error("a full config must be Configured()")
	}
	// Any one missing field disqualifies it. Region is in this list because B2,
	// unlike R2's "auto", signs against a real region - an empty one yields a
	// signature rejected on every request, so it must gate configuration rather
	// than fall through to a default.
	for _, drop := range []func(*Config){
		func(c *Config) { c.AccessKeyID = "" },
		func(c *Config) { c.SecretAccessKey = "" },
		func(c *Config) { c.Bucket = "" },
		func(c *Config) { c.Endpoint = "" },
		func(c *Config) { c.Region = "" },
	} {
		c := full
		drop(&c)
		if New(c).Configured() {
			t.Errorf("config missing a field must not be Configured(): %+v", c)
		}
	}
}
