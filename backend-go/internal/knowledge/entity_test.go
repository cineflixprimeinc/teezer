package knowledge

import "testing"

// The gate is what keeps Wikimedia traffic low, so both directions matter:
// letting obvious junk through wastes external calls, and rejecting real
// topics silently removes the feature.
func TestIsRealWorldTopic(t *testing.T) {
	accept := []string{
		// The entity classes named in the spec.
		"nepal",             // country
		"pokhara",           // city
		"taylor swift",      // celebrity
		"spacex",            // company
		"inception",         // movie
		"the beatles",       // artist
		"real madrid",       // sports team
		"world war ii",      // historical event
		"quantum computing", // technology
		"snow leopard",      // animal
		"mount everest",     // landmark
		"iphone",            // lowercase brand must survive
		"machine learning",  // multi-word concept
		"albert einstein",   // person
	}
	for _, q := range accept {
		if _, ok := isRealWorldTopic(q); !ok {
			t.Errorf("isRealWorldTopic(%q) = false, want true", q)
		}
	}

	reject := []string{
		"",                      // empty
		"  ",                    // whitespace only
		"hi",                    // too short to carry signal
		"@taylorswift",          // handle
		"john_doe22",            // username shape
		"x.ae.a12",              // username shape
		"someone@example.com",   // email
		"https://teezer.live/x", // URL
		"www.google.com",        // URL
		"123456789",             // id / phone
		"user1234567",           // long digit run
		"aaaaaaaa",              // repeated-char spam
		"!!!!!!!",               // punctuation only
		"the",                   // single stop word
		"how to",                // pure intent, all stop words
		"funny cat videos",      // browse intent
		"best pizza",            // browse intent
		"taylor swift edit",     // browse intent
		"trending sounds",       // browse intent
		"how do i get more followers on this app today", // too many words
	}
	for _, q := range reject {
		if _, ok := isRealWorldTopic(q); ok {
			t.Errorf("isRealWorldTopic(%q) = true, want false", q)
		}
	}
}

// Case and spacing must collapse to one cache key, or the same topic is
// fetched and stored several times over.
func TestNormalisationCollapsesCacheKeys(t *testing.T) {
	variants := []string{
		"Taylor Swift", "taylor swift", "  Taylor   Swift  ", "TAYLOR SWIFT",
	}
	want, ok := isRealWorldTopic(variants[0])
	if !ok {
		t.Fatal("expected the base variant to be accepted")
	}
	for _, v := range variants[1:] {
		got, ok := isRealWorldTopic(v)
		if !ok {
			t.Errorf("isRealWorldTopic(%q) = false", v)
			continue
		}
		if got != want {
			t.Errorf("key for %q = %q, want %q", v, got, want)
		}
	}
}

// A hashtag page and a search for the same word must share one cache entry.
func TestHashtagSharesKeyWithPlainQuery(t *testing.T) {
	withHash, ok1 := isRealWorldTopic("#MountEverest")
	plain, ok2 := isRealWorldTopic("mounteverest")
	if !ok1 || !ok2 {
		t.Fatalf("both should be accepted: %v %v", ok1, ok2)
	}
	if withHash != plain {
		t.Errorf("keys differ: %q vs %q", withHash, plain)
	}
}

// Over-length input must be rejected before it can become a cache key.
func TestOverlongQueryRejected(t *testing.T) {
	long := ""
	for i := 0; i < 20; i++ {
		long += "everest "
	}
	if _, ok := isRealWorldTopic(long); ok {
		t.Error("an over-length query should be rejected")
	}
}
