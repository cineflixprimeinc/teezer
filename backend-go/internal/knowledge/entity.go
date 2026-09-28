package knowledge

import (
	"regexp"
	"strings"
	"unicode"
)

// This file answers one question: "is this query plausibly a real-world topic
// worth asking Wikipedia about?" It runs before any cache lookup and before
// any network call, and it is the main reason Wikimedia traffic stays low.
//
// It is deliberately a cheap heuristic gate, not a classifier. The honest
// framing: we cannot know whether "Vixen" is a username, a band or a rabbit
// without asking. So the gate's job is only to reject what is *obviously* not
// a topic - the overwhelming bulk of social-app search traffic - and let the
// rest through to a lookup whose miss is cached permanently. Wikipedia's own
// 404 is the real classifier; this just keeps the obvious noise away from it.
//
// Erring toward rejection is the correct bias. A false reject costs one card
// nobody sees; a false accept costs one Wikimedia call, cached forever after.

var (
	// A handle, an email, a URL, a hex/id blob - all things users search for
	// on a social app and none of them encyclopedia topics.
	handlePattern = regexp.MustCompile(`^@`)
	emailPattern  = regexp.MustCompile(`@[a-z0-9.-]+\.[a-z]{2,}`)
	urlPattern    = regexp.MustCompile(`(?i)^(https?://|www\.)`)
	// Username-shaped: contains digits AND underscores/dots, e.g. "john_doe22",
	// "x.ae.a12". Real topics essentially never look like this.
	usernameShape = regexp.MustCompile(`^[a-z0-9]+([._][a-z0-9]+)+$`)
	// Runs of digits long enough to be an id, a phone number or a timestamp.
	longDigitRun = regexp.MustCompile(`\d{5,}`)
)

// hasRepeatedRun reports whether s contains the same character five or more
// times in a row ("aaaaaa", "!!!!!!") - keyboard mashing, not a topic.
//
// Written out rather than as a regex because Go's RE2 engine has no
// backreferences, so the obvious `(.)\1{4,}` does not compile.
func hasRepeatedRun(s string) bool {
	const limit = 5
	run := 1
	var prev rune
	for i, r := range s {
		if i > 0 && r == prev {
			run++
			if run >= limit {
				return true
			}
		} else {
			run = 1
		}
		prev = r
	}
	return false
}

// stopWords are words that are grammatical rather than topical. A query made
// only of these ("how to", "the best") describes an intent, not an entity.
var stopWords = map[string]bool{
	"a": true, "an": true, "the": true, "and": true, "or": true, "but": true,
	"if": true, "then": true, "than": true, "that": true, "this": true,
	"these": true, "those": true, "is": true, "are": true, "was": true,
	"were": true, "be": true, "been": true, "being": true, "am": true,
	"do": true, "does": true, "did": true, "have": true, "has": true,
	"had": true, "will": true, "would": true, "can": true, "could": true,
	"should": true, "may": true, "might": true, "must": true, "shall": true,
	"i": true, "you": true, "he": true, "she": true, "it": true, "we": true,
	"they": true, "me": true, "him": true, "her": true, "us": true,
	"them": true, "my": true, "your": true, "his": true, "its": true,
	"our": true, "their": true, "to": true, "of": true, "in": true,
	"on": true, "at": true, "by": true, "for": true, "with": true,
	"from": true, "as": true, "how": true, "what": true, "when": true,
	"where": true, "why": true, "who": true, "which": true, "not": true,
	"no": true, "yes": true, "so": true, "very": true, "just": true,
	"now": true, "new": true, "get": true, "got": true, "make": true,
}

// intentWords mark a query as a request for content rather than a topic.
// "funny cat videos" is a browsing intent; "cat" is a topic. Searching a
// social app is overwhelmingly the former.
var intentWords = map[string]bool{
	"video": true, "videos": true, "vid": true, "vids": true,
	"reel": true, "reels": true, "clip": true, "clips": true,
	"live": true, "stream": true, "streams": true, "streaming": true,
	"funny": true, "meme": true, "memes": true, "viral": true,
	"trending": true, "fyp": true, "foryou": true, "follow": true,
	"followers": true, "following": true, "sub": true, "subs": true,
	"like": true, "likes": true, "comment": true, "comments": true,
	"tutorial": true, "hack": true, "hacks": true, "tips": true,
	"challenge": true, "trend": true, "sound": true, "song": true,
	"remix": true, "edit": true, "edits": true, "compilation": true,
	"free": true, "download": true, "online": true, "near": true,
	"best": true, "top": true, "vs": true, "review": true,
}

// isRealWorldTopic reports whether query is worth a Wikipedia lookup.
//
// Returns the normalised lookup key alongside the verdict so callers use the
// exact same string for the cache key that the gate approved - a mismatch
// there would silently split the cache into two entries per topic.
func isRealWorldTopic(query string) (string, bool) {
	key := normaliseQuery(query)
	if key == "" {
		return "", false
	}

	// Length. Under 3 characters carries no signal ("hi", "ok"); over 60 is a
	// sentence or pasted text, not an entity.
	if len(key) < 3 || len(key) > 60 {
		return key, false
	}

	// Structural rejects: handles, emails, URLs, ids, spam.
	if handlePattern.MatchString(key) ||
		emailPattern.MatchString(key) ||
		urlPattern.MatchString(key) ||
		usernameShape.MatchString(key) ||
		longDigitRun.MatchString(key) ||
		hasRepeatedRun(key) {
		return key, false
	}

	// Pure numbers, or no letters at all (emoji-only, punctuation-only).
	if !strings.ContainsFunc(key, unicode.IsLetter) {
		return key, false
	}

	words := strings.Fields(key)

	// More than five words is a phrase or a question, not an entity name.
	if len(words) > 5 {
		return key, false
	}

	// A query containing an explicit content-intent word is a browse, not a
	// lookup. Checked before the stop-word rule so "best pizza" is rejected.
	for _, w := range words {
		if intentWords[w] {
			return key, false
		}
	}

	// Made entirely of grammatical filler.
	allStop := true
	for _, w := range words {
		if !stopWords[w] {
			allStop = false
			break
		}
	}
	if allStop {
		return key, false
	}

	// A single stop word on its own ("the", "how") is already covered above;
	// what remains is a plausible entity. Let the lookup decide, and let the
	// negative cache remember if Wikipedia says no.
	return key, true
}

// normaliseQuery produces the cache key: lowercase, trimmed, internal
// whitespace collapsed. Case-folding is what makes "Taylor Swift" and
// "taylor swift" one cache entry rather than two.
func normaliseQuery(q string) string {
	q = strings.ToLower(strings.TrimSpace(q))
	// Strip a leading '#' so a hashtag page and a search for the same word
	// share one cache entry. Handles ("@name") keep their marker, because the
	// gate needs to see it in order to reject them.
	q = strings.TrimPrefix(q, "#")
	return strings.Join(strings.Fields(q), " ")
}
