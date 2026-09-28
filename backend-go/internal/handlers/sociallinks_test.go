package handlers

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func linksBody(t *testing.T, raw string) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal([]byte(raw), &body); err != nil {
		t.Fatalf("bad test body %s: %v", raw, err)
	}
	return body
}

func TestParseSocialLinksAccepts(t *testing.T) {
	links, perr := parseSocialLinks(linksBody(t, `{"links":[
		{"platform":"instagram","url":"https://instagram.com/ank6784"},
		{"platform":"youtube","url":"https://youtube.com/@ank"}
	]}`))
	if perr != nil {
		t.Fatalf("unexpected failure: %v", perr.errors)
	}
	if len(links) != 2 || links[0].platform != "instagram" || links[1].url != "https://youtube.com/@ank" {
		t.Errorf("parsed = %+v", links)
	}
}

// 'links' is 'present', so an empty array is a valid request - it clears them.
func TestParseSocialLinksEmptyArrayClears(t *testing.T) {
	links, perr := parseSocialLinks(linksBody(t, `{"links":[]}`))
	if perr != nil {
		t.Fatalf("unexpected failure: %v", perr.errors)
	}
	if len(links) != 0 {
		t.Errorf("links = %+v, want empty", links)
	}
}

func TestParseSocialLinksRejects(t *testing.T) {
	cases := []struct {
		name  string
		body  string
		field string
		msg   string
	}{
		{"missing key", `{}`, "links", "The links field must be present."},
		{"not an array", `{"links":"nope"}`, "links", "The links field must be an array."},
		{"null", `{"links":null}`, "links", "The links field must be an array."},
		{"bad platform", `{"links":[{"platform":"myspace","url":"https://myspace.com/x"}]}`,
			"links.0.platform", "The selected links.0.platform is invalid."},
		{"missing platform", `{"links":[{"url":"https://a.com"}]}`,
			"links.0.platform", "The links.0.platform field is required."},
		{"missing url", `{"links":[{"platform":"website"}]}`,
			"links.0.url", "The links.0.url field is required."},
		{"bad url", `{"links":[{"platform":"website","url":"not-a-url"}]}`,
			"links.0.url", "Each social link must be a valid URL (e.g. https://example.com/yourname)."},
		// the controller's own regex is http(s)-only, unlike the generic url rule
		{"ftp url", `{"links":[{"platform":"website","url":"ftp://example.com"}]}`,
			"links.0.url", "Each social link must be a valid URL (e.g. https://example.com/yourname)."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, perr := parseSocialLinks(linksBody(t, tc.body))
			if perr == nil {
				t.Fatal("accepted an invalid payload")
			}
			got := perr.errors[tc.field]
			if len(got) != 1 || got[0] != tc.msg {
				t.Errorf("errors[%s] = %v, want [%q]", tc.field, got, tc.msg)
			}
		})
	}
}

func TestParseSocialLinksTooMany(t *testing.T) {
	body := `{"links":[`
	for i := 0; i < 21; i++ {
		if i > 0 {
			body += ","
		}
		body += `{"platform":"other","url":"https://e.com"}`
	}
	body += `]}`
	_, perr := parseSocialLinks(linksBody(t, body))
	if perr == nil || len(perr.errors["links"]) == 0 {
		t.Fatal("21 links must be rejected (max:20)")
	}
	if perr.errors["links"][0] != "The links field must not have more than 20 items." {
		t.Errorf("message = %q", perr.errors["links"][0])
	}
}

// Laravel validates every row, so two bad rows report under both keys.
func TestParseSocialLinksReportsEveryBadRow(t *testing.T) {
	_, perr := parseSocialLinks(linksBody(t, `{"links":[
		{"platform":"myspace","url":"https://a.com"},
		{"platform":"website","url":"bad"}
	]}`))
	if perr == nil {
		t.Fatal("accepted an invalid payload")
	}
	if len(perr.errors) != 2 {
		t.Fatalf("errors = %v, want both rows", perr.errors)
	}
	if _, ok := perr.errors["links.0.platform"]; !ok {
		t.Error("row 0 platform not reported")
	}
	if _, ok := perr.errors["links.1.url"]; !ok {
		t.Error("row 1 url not reported")
	}
}

// The controller's regex, not the generic 'url' rule: http(s) only, a real
// domain, '@' allowed in the path for handles.
func TestSocialLinkURLPattern(t *testing.T) {
	cases := map[string]bool{
		"https://instagram.com/ank6784": true,
		"https://youtube.com/@ank":      true,
		"http://example.com":            true,
		"https://a.b.co.uk/x/y?z=1":     true,
		"HTTPS://EXAMPLE.COM":           true,
		"ftp://example.com":             false, // the generic url rule WOULD allow this
		"https://localhost":             false, // no TLD
		"not-a-url":                     false,
		"example.com":                   false,
		"https://example":               false,
		"":                              false,
	}
	for in, want := range cases {
		if got := socialLinkURLPattern.MatchString(in); got != want {
			t.Errorf("socialLinkURLPattern(%q) = %v, want %v", in, got, want)
		}
	}
}

// A raw model's dates are Carbon::toJSON() - UTC, six decimals, Z - not the
// +00:00 that toIso8601 renders for the hand-mapped resources.
func TestToEloquentJSON(t *testing.T) {
	ts := pgtype.Timestamp{Time: time.Date(2026, 7, 17, 10, 46, 48, 0, time.UTC), Valid: true}
	if got := toEloquentJSON(ts); got != "2026-07-17T10:46:48.000000Z" {
		t.Errorf("toEloquentJSON = %v, want 2026-07-17T10:46:48.000000Z", got)
	}
	if got := toIso8601(ts); got != "2026-07-17T10:46:48+00:00" {
		t.Errorf("toIso8601 = %v (the two formats must stay distinct)", got)
	}
	if got := toEloquentJSON(pgtype.Timestamp{}); got != nil {
		t.Errorf("NULL = %v, want nil", got)
	}
	// a non-UTC instant is converted, not relabelled
	berlin := time.FixedZone("CEST", 2*60*60)
	ts2 := pgtype.Timestamp{Time: time.Date(2026, 7, 17, 13, 46, 48, 0, berlin), Valid: true}
	if got := toEloquentJSON(ts2); got != "2026-07-17T11:46:48.000000Z" {
		t.Errorf("toEloquentJSON(CEST) = %v, want the UTC instant", got)
	}
}
