package textmod

import "testing"

func svc() *Service { return New(true, 2) }

func TestTiers(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want Action
	}{
		{"empty", "", ActionClean},
		{"whitespace only", "   ", ActionClean},
		{"ordinary text", "great video, loved the edit", ActionClean},

		// One profanity hit -> warn; two distinct -> review (review_threshold=2).
		{"single profanity warns", "this is shit", ActionWarn},
		{"two distinct profanities review", "this shit is a bitch", ActionReview},

		// Severe short-circuits before profanity is counted, so a severe word
		// alone still blocks even though it is a single hit.
		{"severe blocks", "kys", ActionBlock},
		{"severe wins over profanity", "shit bitch rapist", ActionBlock},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := svc().Check(c.in).Action; got != c.want {
				t.Fatalf("Check(%q) = %s, want %s", c.in, got, c.want)
			}
		})
	}
}

// The repeated-word case is the one an "optimisation" is most likely to break:
// the threshold counts DISTINCT words, so saying the same one twice is still a
// warn, not a review.
func TestRepeatedWordIsStillOneHit(t *testing.T) {
	v := svc().Check("shit shit shit")
	if v.Action != ActionWarn {
		t.Fatalf("action = %s, want warn", v.Action)
	}
	if len(v.Matched) != 1 {
		t.Fatalf("matched = %v, want exactly 1 distinct word", v.Matched)
	}
}

// Scunthorpe: the Laravel original documents this explicitly as the reason it
// refuses to substring-match. These MUST stay clean.
func TestNoSubstringMatching(t *testing.T) {
	for _, s := range []string{
		"my therapist is great",        // contains "rapist"
		"I ate a grape",                // contains "rape"
		"assassin's creed",             // contains "ass"
		"he is a classic cocktail fan", // contains "cock"
		"Scunthorpe United",
	} {
		if got := svc().Check(s).Action; got != ActionClean {
			t.Errorf("Check(%q) = %s, want clean (Scunthorpe problem)", s, got)
		}
	}
}

// Leet substitutions ARE caught: normalize maps them back before matching.
func TestLeetEvasionIsCaught(t *testing.T) {
	for _, s := range []string{"sh1t", "$hit", "b!tch"} {
		if got := svc().Check(s).Action; got == ActionClean {
			t.Errorf("Check(%q) = clean, want it to be caught", s)
		}
	}
}

// Separator evasion IS caught, via matchAll's letter-run collapse. This used to
// pass moderation on both backends; fixed in Laravel and here together.
func TestSeparatorEvasionIsCaught(t *testing.T) {
	for _, s := range []string{"f.u.c.k", "f-u-c-k", "s h i t", "k.y.s", "f*u*c*k"} {
		if got := svc().Check(s).Action; got == ActionClean {
			t.Errorf("Check(%q) = clean, want it to be caught", s)
		}
	}
	// The severe list goes through the same path, so evasion cannot downgrade a
	// block to a warn either.
	if got := svc().Check("k.y.s").Action; got != ActionBlock {
		t.Errorf(`Check("k.y.s") = %s, want block`, got)
	}
}

// The collapse must not resurrect the Scunthorpe problem: only runs of 2+
// single characters are joined, so ordinary prose is untouched.
func TestCollapseDoesNotCreateFalsePositives(t *testing.T) {
	for _, s := range []string{
		"my therapist is great",
		"I ate a grape",
		"a b",                     // a 2-run that spells nothing
		"I am a big fan of R E M", // initialisms stay harmless
		"u s a highway",
	} {
		if got := svc().Check(s).Action; got != ActionClean {
			t.Errorf("Check(%q) = %s, want clean", s, got)
		}
	}
}

func TestCensorMasksOriginalCasing(t *testing.T) {
	v := svc().Check("This SHIT is bad")
	if v.Censored != "This **** is bad" {
		t.Fatalf("censored = %q, want %q", v.Censored, "This **** is bad")
	}
}

func TestDisabledServiceAlwaysClean(t *testing.T) {
	s := New(false, 2)
	if got := s.Check("kys you piece of shit").Action; got != ActionClean {
		t.Fatalf("disabled service returned %s, want clean", got)
	}
	if s.IsDisposableEmail("a@mailinator.com") {
		t.Fatal("disabled service must not flag disposable e-mail")
	}
}

func TestIsCleanHandle(t *testing.T) {
	s := svc()
	if !s.IsCleanHandle("ankit_dev") {
		t.Fatal("ordinary handle should be clean")
	}
	// A handle only has to be WARN-worthy to be rejected - stricter than a comment.
	if s.IsCleanHandle("shitlord") == true && s.Check("shitlord").Action != ActionClean {
		t.Fatal("IsCleanHandle must reject anything not clean")
	}
	if s.IsCleanHandle("kys") {
		t.Fatal("severe handle must be rejected")
	}
}

func TestIsDisposableEmail(t *testing.T) {
	s := svc()
	cases := map[string]bool{
		"a@mailinator.com":    true,
		"a@MAILINATOR.COM":    true, // case-insensitive
		"a@b@sharklasers.com": true, // last @ wins
		"real@gmail.com":      false,
		"no-at-sign":          false,
		"":                    false,
	}
	for in, want := range cases {
		if got := s.IsDisposableEmail(in); got != want {
			t.Errorf("IsDisposableEmail(%q) = %v, want %v", in, got, want)
		}
	}
}
