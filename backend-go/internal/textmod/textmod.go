// Package textmod ports App\Services\TextModerationService - the self-hosted
// text moderation behind comment creation (and, later, username/e-mail rules).
//
//	Check(text) -> a verdict tier:
//	  clean  -> publish as-is
//	  warn   -> publish, but surface a soft "may violate guidelines" notice
//	  review -> hold for review (creator/admin approves or deletes)
//	  block  -> auto-hide / reject (severe content)
//
// The seed word lists are compiled in from config/text_moderation.php rather
// than read from config at runtime: they are a curated constant, and a Go
// service that silently moderated NOTHING because a config file was missing
// would be far worse than one that cannot be tuned without a deploy. The
// optional augmentation files (the fetched LDNOOBW / disposable-domain lists)
// are still honoured when present - see NewFromFiles.
//
// The one piece of behaviour worth reading twice is the deliberate refusal to
// substring-match: see matchWords.
package textmod

import (
	"bufio"
	"os"
	"regexp"
	"strings"
	"sync"
)

// Action is the verdict tier. Values match Laravel's strings exactly - they are
// compared against, and returned to clients, on both backends.
type Action string

const (
	ActionClean  Action = "clean"
	ActionWarn   Action = "warn"
	ActionReview Action = "review"
	ActionBlock  Action = "block"
)

// Verdict mirrors the array TextModerationService::check returns.
type Verdict struct {
	Action   Action
	Severity int
	Matched  []string
	Censored string
}

// defaultReviewThreshold is config('text_moderation.review_threshold', 2): the
// number of distinct profanity hits that escalates warn -> review.
const defaultReviewThreshold = 2

// severeSeed is config('text_moderation.severe_words') - tier 3, immediate block.
var severeSeed = []string{
	"nigger", "nigga", "faggot", "fag", "retard", "kike", "chink", "spic",
	"tranny", "coon", "rape", "rapist", "molest", "pedophile", "pedo",
	"childporn", "bestiality", "kys",
}

// profanitySeed is config('text_moderation.profanity_seed') - tier 1/2.
var profanitySeed = []string{
	"fuck", "fucker", "fucking", "motherfucker", "shit", "bullshit", "bitch",
	"bastard", "asshole", "dickhead", "cunt", "cock", "dick", "pussy", "slut",
	"whore", "wanker", "jerkoff", "cum", "twat", "prick", "douchebag",
}

// disposableSeed is config('text_moderation.disposable_seed').
var disposableSeed = []string{
	"mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com",
	"tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "getnada.com",
	"dispostable.com", "sharklasers.com", "maildrop.cc", "fakeinbox.com",
	"throwawaymail.com", "mailnesia.com", "mohmal.com", "tempr.email",
	"emailondeck.com", "mintemail.com", "spamgourmet.com", "discard.email",
	"moakt.com", "tmail.ws", "tempmailo.com", "mailpoof.com", "inboxkitten.com",
}

// leet collapses the substitutions Laravel's strtr applies, so "sh1t" and
// "f.u.c.k" still match. Order is irrelevant - each is a single-rune swap.
var leet = strings.NewReplacer(
	"0", "o", "1", "i", "3", "e", "4", "a", "5", "s", "7", "t",
	"@", "a", "$", "s", "!", "i",
)

var nonAlnum = regexp.MustCompile(`[^a-z0-9\s]`)
var manySpaces = regexp.MustCompile(`\s+`)

type Service struct {
	enabled         bool
	reviewThreshold int

	severe     []string
	profanity  []string
	disposable map[string]bool

	// Compiled word-boundary patterns, built once. Laravel re-runs preg_match
	// per word per call; caching the compile is the only performance liberty
	// taken here and changes no behaviour.
	once      sync.Once
	severeRe  []*regexp.Regexp
	profanRe  []*regexp.Regexp
	severeSrc []string
	profanSrc []string
}

// New builds the service from the compiled-in seeds.
func New(enabled bool, reviewThreshold int) *Service {
	if reviewThreshold < 1 {
		reviewThreshold = defaultReviewThreshold
	}
	s := &Service{
		enabled:         enabled,
		reviewThreshold: reviewThreshold,
		severe:          dedupeLower(severeSeed),
		profanity:       dedupeLower(profanitySeed),
		disposable:      map[string]bool{},
	}
	for _, d := range disposableSeed {
		s.disposable[strings.ToLower(strings.TrimSpace(d))] = true
	}
	return s
}

// NewFromFiles is New plus the optional augmentation lists Laravel reads off the
// local disk (moderation/profanity_en.txt, moderation/disposable_domains.txt).
// A missing or unreadable file is not an error - Laravel treats it the same way,
// falling back to the seeds alone.
func NewFromFiles(enabled bool, reviewThreshold int, profanityFile, disposableFile string) *Service {
	s := New(enabled, reviewThreshold)
	if extra := readListFile(profanityFile); len(extra) > 0 {
		s.profanity = dedupeLower(append(s.profanity, extra...))
	}
	for _, d := range readListFile(disposableFile) {
		s.disposable[strings.ToLower(strings.TrimSpace(d))] = true
	}
	return s
}

func (s *Service) Enabled() bool { return s.enabled }

// Check is TextModerationService::check.
func (s *Service) Check(text string) Verdict {
	clean := Verdict{Action: ActionClean, Severity: 0, Matched: []string{}, Censored: text}
	if !s.enabled || strings.TrimSpace(text) == "" {
		return clean
	}
	s.compile()

	normalized := normalize(text)

	// Tier 3 - severe -> block immediately, before profanity is even counted.
	if hits := matchAll(normalized, s.severeRe, s.severeSrc); len(hits) > 0 {
		return Verdict{ActionBlock, 3, hits, censor(text, hits)}
	}

	hits := matchAll(normalized, s.profanRe, s.profanSrc)
	switch {
	case len(hits) >= s.reviewThreshold:
		return Verdict{ActionReview, 2, hits, censor(text, hits)}
	case len(hits) >= 1:
		return Verdict{ActionWarn, 1, hits, censor(text, hits)}
	}
	return clean
}

// IsCleanHandle is the stricter username rule: anything but clean fails.
func (s *Service) IsCleanHandle(username string) bool {
	return s.Check(username).Action == ActionClean
}

// IsDisposableEmail reports whether the address's domain is a known temp-mail
// provider.
func (s *Service) IsDisposableEmail(email string) bool {
	if !s.enabled || !strings.Contains(email, "@") {
		return false
	}
	at := strings.LastIndex(email, "@")
	domain := strings.ToLower(strings.TrimSpace(email[at+1:]))
	if domain == "" {
		return false
	}
	return s.disposable[domain]
}

func (s *Service) compile() {
	s.once.Do(func() {
		s.severeRe, s.severeSrc = compileWords(s.severe)
		s.profanRe, s.profanSrc = compileWords(s.profanity)
	})
}

func compileWords(words []string) ([]*regexp.Regexp, []string) {
	res := make([]*regexp.Regexp, 0, len(words))
	src := make([]string, 0, len(words))
	for _, w := range words {
		re, err := regexp.Compile(`\b` + regexp.QuoteMeta(w) + `\b`)
		if err != nil {
			continue
		}
		res = append(res, re)
		src = append(src, w)
	}
	return res, src
}

// normalize lower-cases, collapses leet substitutions, drops separators so
// "f.u.c.k" becomes "f u c k", squeezes whitespace and pads with spaces.
func normalize(text string) string {
	t := strings.ToLower(text)
	t = leet.Replace(t)
	t = nonAlnum.ReplaceAllString(t, " ")
	t = manySpaces.ReplaceAllString(t, " ")
	return " " + strings.TrimSpace(t) + " "
}

// matchAll matches the normalized text AND its letter-run-collapsed variant.
//
// normalize() turns "f.u.c.k" into " f u c k " - separators become spaces rather
// than vanishing - so a word-boundary match on the normalized text alone can
// never fire on it, and separator evasion passed moderation entirely. Mirrors
// TextModerationService::matchAll; the two MUST stay in step or the backends
// will moderate the same comment differently.
func matchAll(normalized string, res []*regexp.Regexp, src []string) []string {
	hits := matchWords(normalized, res, src)

	if collapsed := collapseLetterRuns(normalized); collapsed != normalized {
		seen := make(map[string]bool, len(hits))
		for _, h := range hits {
			seen[h] = true
		}
		for _, h := range matchWords(collapsed, res, src) {
			if !seen[h] {
				seen[h] = true
				hits = append(hits, h)
			}
		}
	}
	return hits
}

// collapseLetterRuns joins runs of SINGLE-character tokens back into one word,
// so "f u c k" becomes "fuck" and can be word-boundary matched.
//
// Only runs of 2+ single characters are joined, which is what keeps it safe:
// ordinary words are never merged with their neighbours, so the Scunthorpe
// problem does not come back. "my therapist is great" has no single-letter run;
// "I ate a grape" has only isolated single letters, each a run of one.
func collapseLetterRuns(normalized string) string {
	tokens := strings.Fields(normalized)
	out := make([]string, 0, len(tokens))
	run := make([]string, 0, 8)

	flush := func() {
		if len(run) >= 2 {
			out = append(out, strings.Join(run, ""))
		} else {
			out = append(out, run...)
		}
		run = run[:0]
	}

	for _, tok := range tokens {
		if len([]rune(tok)) == 1 {
			run = append(run, tok)
			continue
		}
		flush()
		out = append(out, tok)
	}
	flush()

	return " " + strings.Join(out, " ") + " "
}

// matchWords is a word-boundary match on one already-normalized string.
//
// It deliberately does NOT substring-match. That would trigger the Scunthorpe
// problem - "therapist" contains "rapist", "grape" contains "rape" - and
// auto-block legitimate words. Separator evasion is handled by matchAll
// instead, which is precise about what it joins.
func matchWords(normalized string, res []*regexp.Regexp, src []string) []string {
	if len(res) == 0 {
		return []string{}
	}
	seen := map[string]bool{}
	hits := make([]string, 0, 4)
	for i, re := range res {
		if re.MatchString(normalized) && !seen[src[i]] {
			seen[src[i]] = true
			hits = append(hits, src[i])
		}
	}
	return hits
}

// censor replaces each matched word with asterisks, case-insensitively, in the
// ORIGINAL text (not the normalized copy).
func censor(text string, words []string) string {
	for _, w := range words {
		re, err := regexp.Compile(`(?i)` + regexp.QuoteMeta(w))
		if err != nil {
			continue
		}
		text = re.ReplaceAllStringFunc(text, func(m string) string {
			return strings.Repeat("*", len([]rune(m)))
		})
	}
	return text
}

func dedupeLower(words []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(words))
	for _, w := range words {
		w = strings.TrimSpace(strings.ToLower(w))
		if w == "" || seen[w] {
			continue
		}
		seen[w] = true
		out = append(out, w)
	}
	return out
}

// readListFile reads a newline-delimited list, skipping blanks and # comments.
func readListFile(path string) []string {
	if path == "" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var out []string
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		out = append(out, line)
	}
	return out
}
