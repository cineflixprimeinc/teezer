package handlers

import "testing"

// Every expectation below is what THIS PROJECT'S PHP actually returned for
// Str::isUrl($case), captured by running the corpus through the live Laravel
// install rather than reasoned about. It pins the RE2 port of the rule's PCRE:
// if the two ever disagree, the port is wrong, not the corpus.
//
// Several are deliberately unintuitive - "https://example." and
// "https://-example.com" really do pass in Laravel, and "https://.com" really
// does not - which is exactly why they are here.
func TestLaravelIsURL(t *testing.T) {
	cases := map[string]bool{
		"https://example.com":                    true,
		"http://example.com":                     true,
		"https://example.com/path":               true,
		"https://example.com/@handle":            true,
		"https://sub.example.co.uk/a/b?x=1#frag": true,
		"ftp://example.com":                      true,
		"s3://bucket/key":                        true,
		"ws://example.com":                       true,
		"https://localhost":                      true, // single-level domain
		"https://127.0.0.1:8080/x":               true,
		"https://[::1]/x":                        true, // IPv6 literal
		"https://xn--80ak6aa92e.com":             true, // punycode tld
		"https://exämple.com":                    true, // \pL
		"http://例え.jp":                           true,
		"https://example.com:99999":              true,
		"HTTPS://EXAMPLE.COM":                    true, // /i
		"https://user:pass@example.com":          true, // basic auth
		"https://example.":                       true, // trailing dot is allowed
		"https://example.com.":                   true,
		"http://a.b":                             true,
		"https://-example.com":                   true,
		"https://exa_mple.com":                   true,
		"https://ex--ample.com":                  true,
		"https://example.com/path%20enc":         true,
		"https://example.com?q=1":                true,
		"https://example.com#f":                  true,

		"mailto:someone@example.com": false, // in the scheme list, but needs ://
		"javascript:alert(1)":        false,
		"example.com":                false,
		"https://":                   false,
		"":                           false,
		"not a url":                  false,
		"https://example.com/ space": false,
		"https://.com":               false,
		"https://ex ample.com":       false,
		"https://example.com:/x":     false, // empty port
		"htp://example.com":          false, // unknown scheme
		"://example.com":             false,
		"https:/example.com":         false,
	}
	for in, want := range cases {
		if got := laravelIsURL(in); got != want {
			t.Errorf("laravelIsURL(%q) = %v, want %v (PHP's answer)", in, got, want)
		}
	}
}

// PCRE's $ matches before a single trailing newline and Go's does not, so the
// port carries an explicit \n?. Without it a Go-side reject would 422 a value
// Laravel accepts.
func TestLaravelIsURLTrailingNewline(t *testing.T) {
	if !laravelIsURL("https://example.com\n") {
		t.Error(`"https://example.com\n" must pass, as it does in PCRE`)
	}
	if laravelIsURL("https://example.com\n\n") {
		t.Error("only ONE trailing newline is allowed")
	}
	if laravelIsURL("https://exa\nmple.com") {
		t.Error("an interior newline must not pass")
	}
	if laravelIsURL("https://example.com\r") {
		t.Error("a trailing CR must not pass (PCRE's $ allows only \\n)")
	}
}
