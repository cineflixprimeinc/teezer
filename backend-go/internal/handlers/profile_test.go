package handlers

import (
	"encoding/json"
	"testing"
)

func TestNormalizeWebsite(t *testing.T) {
	cases := map[string]string{
		"example.com":          "https://example.com",
		"//example.com":        "https://example.com",
		" example.com ":        "https://example.com",
		"http://example.com":   "http://example.com",
		"HTTPS://Example.com":  "HTTPS://Example.com", // scheme check is case-insensitive; the value is stored verbatim
		"https://a.co/@handle": "https://a.co/@handle",
		"":                     "",
	}
	for in, want := range cases {
		if got := normalizeWebsite(in); got != want {
			t.Errorf("normalizeWebsite(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestEffectiveViewPrivacy(t *testing.T) {
	cases := []struct {
		privacy string
		history bool
		want    string
	}{
		{"everyone", true, "everyone"},
		{"followers", true, "followers"},
		{"private", true, "private"}, // the enum wins over the legacy boolean
		{"", true, "everyone"},       // unknown enum → fall back to the boolean
		{"", false, "private"},
		{"bogus", false, "private"},
	}
	for _, tc := range cases {
		if got := effectiveViewPrivacy(tc.privacy, tc.history); got != tc.want {
			t.Errorf("effectiveViewPrivacy(%q, %v) = %q, want %q", tc.privacy, tc.history, got, tc.want)
		}
	}
}

func TestJSONNullableBool(t *testing.T) {
	cases := []struct {
		raw     string
		want    bool
		isNull  bool
		wantErr bool
	}{
		{raw: `true`, want: true},
		{raw: `false`, want: false},
		{raw: `"1"`, want: true}, // Laravel's 'boolean' rule accepts these
		{raw: `"0"`, want: false},
		{raw: `"true"`, want: true},
		{raw: `1`, want: true},
		{raw: `0`, want: false},
		{raw: `null`, isNull: true},
		{raw: `"yes"`, wantErr: true},
		{raw: `2`, wantErr: true},
	}
	for _, tc := range cases {
		got, isNull, err := jsonNullableBool(json.RawMessage(tc.raw))
		if (err != nil) != tc.wantErr {
			t.Errorf("jsonNullableBool(%s) err = %v, wantErr %v", tc.raw, err, tc.wantErr)
			continue
		}
		if err != nil {
			continue
		}
		if isNull != tc.isNull || got != tc.want {
			t.Errorf("jsonNullableBool(%s) = (%v, null=%v), want (%v, null=%v)", tc.raw, got, isNull, tc.want, tc.isNull)
		}
	}
}

func TestJSONStringArrayLimits(t *testing.T) {
	if _, isNull, err := jsonStringArray(json.RawMessage(`null`), 3, 60); err != nil || !isNull {
		t.Errorf("null array: got (null=%v, err=%v), want (null=true, err=nil)", isNull, err)
	}
	items, _, err := jsonStringArray(json.RawMessage(`["a","b"]`), 3, 60)
	if err != nil || len(items) != 2 {
		t.Errorf("valid array: got (%v, %v), want 2 items", items, err)
	}
	if _, _, err := jsonStringArray(json.RawMessage(`["a","b","c","d"]`), 3, 60); err == nil {
		t.Error("categories over max:3 should fail")
	}
	if _, _, err := jsonStringArray(json.RawMessage(`["aaaa"]`), 3, 3); err == nil {
		t.Error("item over the per-item max should fail")
	}
	if _, _, err := jsonStringArray(json.RawMessage(`[1,2]`), 3, 60); err == nil {
		t.Error("non-string items should fail")
	}
}

func TestDecodeJSONArray(t *testing.T) {
	if got := decodeJSONArray(nil); len(got) != 0 {
		t.Errorf("NULL column → %v, want []", got)
	}
	if got := decodeJSONArray([]byte(`["music","art"]`)); len(got) != 2 || got[0] != "music" {
		t.Errorf("decodeJSONArray = %v, want [music art]", got)
	}
	if got := decodeJSONArray([]byte(`{"not":"an array"}`)); len(got) != 0 {
		t.Errorf("malformed column → %v, want []", got)
	}
}

func TestRolePermissions(t *testing.T) {
	if len(rolePermissions("admin")) != 18 {
		t.Errorf("admin permissions = %d, want 18", len(rolePermissions("admin")))
	}
	if got := rolePermissions("banned-role"); len(got) != 0 {
		t.Errorf("unknown role = %v, want []", got)
	}
	if !contains(rolePermissions("user"), "manage_own_profile") {
		t.Error("user role should carry manage_own_profile")
	}
}
