package handlers

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	"reelsoo/backend-go/internal/sqlc"
)

// row builds the users-row shape defaultsFrom reads, with one preference column
// populated from raw JSON.
func prefRow(column string, saved string) sqlc.GetUserPreferenceGroupsRow {
	r := sqlc.GetUserPreferenceGroupsRow{Language: "en"}
	switch column {
	case "notification_preferences":
		r.NotificationPreferences = []byte(saved)
	case "accessibility_preferences":
		r.AccessibilityPreferences = []byte(saved)
	case "content_preferences":
		r.ContentPreferences = []byte(saved)
	case "family_preferences":
		r.FamilyPreferences = []byte(saved)
	case "wellbeing_preferences":
		r.WellbeingPreferences = []byte(saved)
	}
	return r
}

func TestDefaultsFromUnsavedColumnIsAllDefaults(t *testing.T) {
	got := appearancePrefs.defaultsFrom(sqlc.GetUserPreferenceGroupsRow{})
	want := map[string]any{
		"theme": "system", "app_icon": "default",
		"bold_text": false, "in_app_browser": true,
	}
	if len(got) != len(want) {
		t.Fatalf("got %d keys, want %d: %v", len(got), len(want), got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
}

func TestDefaultsFromOverlaysSavedAndDropsRetiredKeys(t *testing.T) {
	// larger_text overrides a default; "removed_setting" is no longer in the
	// defaults array, so Laravel's array_key_exists gate drops it.
	row := prefRow("accessibility_preferences", `{"larger_text":true,"text_size":"large","removed_setting":"x"}`)
	got := accessibilityPrefs.defaultsFrom(row)

	if got["larger_text"] != true {
		t.Errorf("larger_text = %v, want true", got["larger_text"])
	}
	if got["text_size"] != "large" {
		t.Errorf("text_size = %v, want large", got["text_size"])
	}
	if got["screen_reader"] != false {
		t.Errorf("screen_reader = %v, want false (untouched default)", got["screen_reader"])
	}
	if _, ok := got["removed_setting"]; ok {
		t.Errorf("retired key survived into the payload: %v", got)
	}
}

// A bool-defaulted key stored as 1/"0"/etc. must read back as a real bool -
// xxxDefaults() casts it with (bool), so the API never leaks the stored type.
func TestDefaultsFromCastsSavedBools(t *testing.T) {
	row := prefRow("accessibility_preferences", `{"larger_text":1,"high_contrast":"0","reduce_motion":"yes","screen_reader":0}`)
	got := accessibilityPrefs.defaultsFrom(row)

	cases := map[string]bool{
		"larger_text":   true,
		"high_contrast": false, // PHP: (bool)"0" === false
		"reduce_motion": true,  // any other non-empty string is true
		"screen_reader": false,
	}
	for k, want := range cases {
		if got[k] != want {
			t.Errorf("%s = %#v, want %v", k, got[k], want)
		}
	}
}

func TestDefaultsFromCorruptColumnFallsBackToDefaults(t *testing.T) {
	row := prefRow("accessibility_preferences", `not json`)
	if got := accessibilityPrefs.defaultsFrom(row); got["text_size"] != "small" {
		t.Errorf("text_size = %v, want the default (small)", got["text_size"])
	}
}

func TestContentPrefsDynamicCountryFallback(t *testing.T) {
	cases := []struct {
		name     string
		selected pgtype.Text
		detected pgtype.Text
		want     string
	}{
		{"selected wins", pgtype.Text{String: "IN", Valid: true}, pgtype.Text{String: "NP", Valid: true}, "IN"},
		{"detected when unselected", pgtype.Text{}, pgtype.Text{String: "NP", Valid: true}, "NP"},
		{"US when neither", pgtype.Text{}, pgtype.Text{}, "US"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			row := sqlc.GetUserPreferenceGroupsRow{
				Language: "en", SelectedCountryCode: tc.selected, DetectedCountryCode: tc.detected,
			}
			if got := contentPrefs.defaultsFrom(row)["preferred_country"]; got != tc.want {
				t.Errorf("preferred_country = %v, want %v", got, tc.want)
			}
		})
	}
}

// The saved column still wins over the dynamic default.
func TestContentPrefsSavedOverridesDynamic(t *testing.T) {
	row := prefRow("content_preferences", `{"preferred_country":"FR"}`)
	row.SelectedCountryCode = pgtype.Text{String: "IN", Valid: true}
	if got := contentPrefs.defaultsFrom(row)["preferred_country"]; got != "FR" {
		t.Errorf("preferred_country = %v, want FR", got)
	}
}

func TestPrefFieldValidate(t *testing.T) {
	cases := []struct {
		name    string
		field   prefField
		input   string
		want    any
		wantErr bool
	}{
		// the value returned is the raw request value, not a coerced one
		{"bool true", boolPref("x", false), `true`, true, false},
		{"bool from 1", boolPref("x", false), `1`, float64(1), false},
		{"bool from \"0\"", boolPref("x", true), `"0"`, "0", false},
		{"bool rejects null", boolPref("x", false), `null`, nil, true},
		{"bool rejects string", boolPref("x", false), `"nope"`, nil, true},

		{"enum ok", enumPref("theme", "light", "light", "dark"), `"dark"`, "dark", false},
		{"enum rejects other", enumPref("theme", "light", "light", "dark"), `"purple"`, nil, true},
		{"string ok", stringPref("text_size", "small", 30), `"medium"`, "medium", false},
		{"string over max", stringPref("preferred_country", "US", 3), `"NPL1"`, nil, true},
		{"string rejects null", stringPref("text_size", "small", 30), `null`, nil, true},

		{"int ok", intPref("daily_limit_minutes", 0, 0, 1440), `60`, float64(60), false},
		{"int from string", intPref("daily_limit_minutes", 0, 0, 1440), `"60"`, "60", false},
		{"int below min", intPref("break_interval_minutes", 30, 5, 240), `4`, nil, true},
		{"int above max", intPref("daily_limit_minutes", 0, 0, 1440), `1441`, nil, true},
		{"int rejects fraction", intPref("daily_limit_minutes", 0, 0, 1440), `1.5`, nil, true},
		{"int rejects junk string", intPref("daily_limit_minutes", 0, 0, 1440), `"60abc"`, nil, true},

		{"speed ok", prefFieldByName(t, contentPrefs, "playback_speed"), `1.5`, 1.5, false},
		{"speed whole", prefFieldByName(t, contentPrefs, "playback_speed"), `2`, float64(2), false},
		{"speed rejects other", prefFieldByName(t, contentPrefs, "playback_speed"), `1.75`, nil, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.field.validate(json.RawMessage(tc.input))
			if tc.wantErr {
				if err == nil {
					t.Fatalf("validate(%s) = %v, want an error", tc.input, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("validate(%s) errored: %v", tc.input, err)
			}
			if got != tc.want {
				t.Errorf("validate(%s) = %#v, want %#v", tc.input, got, tc.want)
			}
		})
	}
}

// prefFieldByName locates a field by name so the tests reference it by identity,
// not by a positional index that silently shifts when a field is inserted.
func prefFieldByName(t *testing.T, g prefGroup, name string) prefField {
	t.Helper()
	for _, f := range g.fields {
		if f.name == name {
			return f
		}
	}
	t.Fatalf("no %q field in the %s group", name, g.column)
	return prefField{}
}

// playback_speed must actually be the number-enum the speed cases above exercise.
func TestPlaybackSpeedFieldSpec(t *testing.T) {
	f := prefFieldByName(t, contentPrefs, "playback_speed")
	if f.kind != prefNumberEnum {
		t.Fatalf("playback_speed kind = %v, want prefNumberEnum", f.kind)
	}
}

func mustBody(t *testing.T, raw string) map[string]json.RawMessage {
	t.Helper()
	var body map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &body); err != nil {
		t.Fatalf("bad test body %s: %v", raw, err)
	}
	return body
}

// merge writes only the keys the request actually sent; everything else keeps
// the value it had (Laravel's array_merge over $request->only()).
func TestMergeOverlaysOnlySentKeys(t *testing.T) {
	current := appearancePrefs.defaultsFrom(sqlc.GetUserPreferenceGroupsRow{})
	merged, perr := appearancePrefs.merge(mustBody(t, `{"theme":"dark"}`), current)
	if perr != nil {
		t.Fatalf("unexpected failure: %+v", perr)
	}
	if merged["theme"] != "dark" {
		t.Errorf("theme = %v, want dark", merged["theme"])
	}
	if merged["app_icon"] != "default" || merged["in_app_browser"] != true {
		t.Errorf("unsent keys were disturbed: %v", merged)
	}
	// merge must not mutate the caller's map.
	if current["theme"] != "system" {
		t.Errorf("merge mutated current: theme = %v", current["theme"])
	}
	// An unknown key is ignored, not stored - it is not in the defaults array.
	merged, _ = appearancePrefs.merge(mustBody(t, `{"bogus_key":"x"}`), current)
	if _, ok := merged["bogus_key"]; ok {
		t.Errorf("unknown key leaked into the column: %v", merged)
	}
}

// A rejected field must come back as a *prefError with a nil map - never as a
// nil error carrying a nil map, which is what a "response already written"
// signal degrades into (c.JSON returns nil on success). The handlers assign
// into the returned map, so getting this wrong panics on a nil map.
func TestMergeReportsFailureAsData(t *testing.T) {
	current := familyPrefs.defaultsFrom(sqlc.GetUserPreferenceGroupsRow{})
	merged, perr := familyPrefs.merge(mustBody(t, `{"child_age_group":"99"}`), current)

	if perr == nil {
		t.Fatal("invalid enum was accepted")
	}
	if merged != nil {
		t.Errorf("merged = %v, want nil on failure", merged)
	}
	want := []string{"The selected child age group is invalid."}
	if got := perr.errors["child_age_group"]; len(got) != 1 || got[0] != want[0] {
		t.Errorf("errors[child_age_group] = %v, want %v", got, want)
	}
	if perr.server {
		t.Error("a validation failure must not report as a 500")
	}
}

// Laravel validates every field before throwing, so both bad fields report.
func TestMergeReportsAllFailingFields(t *testing.T) {
	current := wellbeingPrefs.defaultsFrom(sqlc.GetUserPreferenceGroupsRow{})
	_, perr := wellbeingPrefs.merge(
		mustBody(t, `{"daily_limit_minutes":1441,"break_interval_minutes":4,"bedtime_enabled":true}`), current)

	if perr == nil {
		t.Fatal("invalid request was accepted")
	}
	if len(perr.errors) != 2 {
		t.Fatalf("errors = %v, want exactly the 2 bad fields", perr.errors)
	}
	if perr.errors["daily_limit_minutes"][0] != "The daily limit minutes field must not be greater than 1440." {
		t.Errorf("daily_limit_minutes: %v", perr.errors["daily_limit_minutes"])
	}
	if perr.errors["break_interval_minutes"][0] != "The break interval minutes field must be at least 5." {
		t.Errorf("break_interval_minutes: %v", perr.errors["break_interval_minutes"])
	}
	if _, ok := perr.errors["bedtime_enabled"]; ok {
		t.Error("the valid field must not be reported")
	}
}

// Laravel merges $request->only() - the RAW input - over the defaults, so the
// stored value (and the PATCH echo) keeps the client's type. The (bool) cast
// only happens on the way back out, in defaultsFrom.
func TestMergeStoresRawRequestValues(t *testing.T) {
	current := notificationPrefs.defaultsFrom(sqlc.GetUserPreferenceGroupsRow{})
	merged, perr := notificationPrefs.merge(mustBody(t, `{"push_likes":1,"sms_updates":"0","push_live":true}`), current)
	if perr != nil {
		t.Fatalf("unexpected failure: %+v", perr)
	}

	// 1 and "0" are valid booleans to Laravel, and are stored verbatim.
	if got := merged["push_likes"]; got != float64(1) {
		t.Errorf("push_likes = %#v, want the raw 1", got)
	}
	if got := merged["sms_updates"]; got != "0" {
		t.Errorf("sms_updates = %#v, want the raw \"0\"", got)
	}
	if got := merged["push_live"]; got != true {
		t.Errorf("push_live = %#v, want true", got)
	}

	// ...and reading them back casts to real bools, so the API surface is clean.
	encoded, err := json.Marshal(merged)
	if err != nil {
		t.Fatal(err)
	}
	readBack := notificationPrefs.defaultsFrom(prefRow("notification_preferences", string(encoded)))
	if readBack["push_likes"] != true || readBack["sms_updates"] != false || readBack["push_live"] != true {
		t.Errorf("round trip did not cast to bools: %v", readBack)
	}
}

func TestPhpBool(t *testing.T) {
	cases := []struct {
		in   any
		want bool
	}{
		{nil, false},
		{true, true},
		{false, false},
		{float64(0), false},
		{float64(1), true},
		{float64(-1), true},
		{"", false},
		{"0", false},
		{"false", true}, // PHP: any non-empty string other than "0" is true
		{"1", true},
		{[]any{}, false},
		{[]any{1}, true},
		{map[string]any{}, false},
	}
	for _, tc := range cases {
		if got := phpBool(tc.in); got != tc.want {
			t.Errorf("phpBool(%#v) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

// phpBcryptOf5678 was produced by this project's PHP:
//   password_hash("5678", PASSWORD_BCRYPT, ["cost" => 12])
// It pins the cross-stack contract: Go must read what Laravel wrote.
const phpBcryptOf5678 = "$2y$12$HSy0UPpnXutjXlup2s2F2e07XHlLsVNmcrdhCIMwl3jfx1P154sSu"

func TestGoReadsLaravelBcryptHash(t *testing.T) {
	if err := bcrypt.CompareHashAndPassword([]byte(phpBcryptOf5678), []byte("5678")); err != nil {
		t.Fatalf("Go rejected a PHP-written $2y$ hash: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(phpBcryptOf5678), []byte("1234")); err == nil {
		t.Fatal("a wrong PIN verified against the PHP hash")
	}
}

// Go's bcrypt emits $2a$, which PHP reports as algoName "unknown" - Laravel's
// verify guard then THROWS on it instead of returning false, 500ing every PHP
// read of a Go-written PIN. The hash must go to the DB tagged $2y$.
func TestLaravelBcryptIsTaggedForPHP(t *testing.T) {
	hash, err := laravelBcrypt("4821", bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$2y$") {
		t.Errorf("hash = %q, want a $2y$ tag (PHP reads $2a$ as unknown)", hash)
	}
	// Retagging must not disturb the digest: Go still verifies it.
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte("4821")); err != nil {
		t.Errorf("retagged hash no longer verifies in Go: %v", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte("9999")); err == nil {
		t.Error("a wrong PIN verified")
	}
	// The cost must survive into the hash, since Laravel re-reads it.
	if cost, err := bcrypt.Cost([]byte(hash)); err != nil || cost != bcrypt.MinCost {
		t.Errorf("cost = %d (err %v), want %d", cost, err, bcrypt.MinCost)
	}
}

func TestHasFamilyPin(t *testing.T) {
	if hasFamilyPin(pgtype.Text{}) {
		t.Error("NULL family_pin must read as unset")
	}
	if hasFamilyPin(pgtype.Text{String: "", Valid: true}) {
		t.Error(`empty family_pin must read as unset (!empty(""))`)
	}
	if !hasFamilyPin(pgtype.Text{String: "$2y$12$hash", Valid: true}) {
		t.Error("a stored hash must read as set")
	}
}
