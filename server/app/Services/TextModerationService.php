<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * Self-hosted text moderation - no third-party packages.
 *
 *   check($text) → verdict tier:
 *     'clean'  → publish as-is
 *     'warn'   → publish, but surface a soft "may violate guidelines" notice
 *     'review' → hold for review (creator/admin approves or deletes)
 *     'block'  → auto-hide / reject (severe content)
 *
 * Word lists come from config seeds ∪ optional files fetched by
 * `php artisan moderation:update-lists` (LDNOOBW + disposable-email-domains).
 * Lists are cached so files are parsed at most once per cache window.
 */
class TextModerationService
{
    private const CACHE_TTL = 86400; // 1 day

    public function enabled(): bool
    {
        return (bool) config('text_moderation.enabled', true);
    }

    /**
     * @return array{action:string, severity:int, matched:array<int,string>, censored:?string}
     */
    public function check(?string $text): array
    {
        $clean = ['action' => 'clean', 'severity' => 0, 'matched' => [], 'censored' => $text];

        if (!$this->enabled() || $text === null || trim($text) === '') {
            return $clean;
        }

        $normalized = $this->normalize($text);

        // Tier 3 - severe → block immediately.
        $severe = $this->matchAll($normalized, $this->severeWords());
        if ($severe) {
            return ['action' => 'block', 'severity' => 3, 'matched' => $severe, 'censored' => $this->censor($text, $severe)];
        }

        // Tier 1/2 - general profanity.
        $hits = $this->matchAll($normalized, $this->profanityWords());
        $count = count($hits);
        $reviewAt = max(1, (int) config('text_moderation.review_threshold', 2));

        if ($count >= $reviewAt) {
            return ['action' => 'review', 'severity' => 2, 'matched' => $hits, 'censored' => $this->censor($text, $hits)];
        }
        if ($count >= 1) {
            return ['action' => 'warn', 'severity' => 1, 'matched' => $hits, 'censored' => $this->censor($text, $hits)];
        }

        return $clean;
    }

    /** Stricter: usernames must be fully clean (any profanity/severe → false). */
    public function isCleanHandle(?string $username): bool
    {
        return $this->check($username)['action'] === 'clean';
    }

    /** True when the e-mail's domain is a known disposable / temp-mail provider. */
    public function isDisposableEmail(?string $email): bool
    {
        if (!$this->enabled() || !$email || !str_contains($email, '@')) {
            return false;
        }
        $domain = strtolower(trim(substr(strrchr($email, '@'), 1)));
        if ($domain === '') {
            return false;
        }
        return isset($this->disposableDomains()[$domain]);
    }

    /* ── Word lists (cached) ─────────────────────────────────────────────── */

    /** @return array<int,string> */
    private function severeWords(): array
    {
        return Cache::remember('textmod:severe', self::CACHE_TTL, function () {
            return $this->clean((array) config('text_moderation.severe_words', []));
        });
    }

    /** @return array<int,string> */
    private function profanityWords(): array
    {
        return Cache::remember('textmod:profanity', self::CACHE_TTL, function () {
            $seed = (array) config('text_moderation.profanity_seed', []);
            $file = $this->readListFile((string) config('text_moderation.profanity_file'));
            return $this->clean(array_merge($seed, $file));
        });
    }

    /** @return array<string,bool> domain => true for O(1) lookup */
    private function disposableDomains(): array
    {
        return Cache::remember('textmod:disposable', self::CACHE_TTL, function () {
            $seed = (array) config('text_moderation.disposable_seed', []);
            $file = $this->readListFile((string) config('text_moderation.disposable_file'));
            $all = [];
            foreach (array_merge($seed, $file) as $d) {
                $d = strtolower(trim((string) $d));
                if ($d !== '' && !str_starts_with($d, '#')) {
                    $all[$d] = true;
                }
            }
            return $all;
        });
    }

    /** Read a newline-delimited list file from the default disk, ignoring comments. */
    private function readListFile(string $path): array
    {
        if ($path === '') {
            return [];
        }
        try {
            $disk = Storage::disk('local');
            if (!$disk->exists($path)) {
                return [];
            }
            $raw = (string) $disk->get($path);
        } catch (\Throwable) {
            return [];
        }
        $lines = preg_split('/\r\n|\r|\n/', $raw) ?: [];
        return array_filter($lines, fn ($l) => trim($l) !== '' && !str_starts_with(trim($l), '#'));
    }

    /** @return array<int,string> */
    private function clean(array $words): array
    {
        $out = [];
        foreach ($words as $w) {
            $w = trim(mb_strtolower((string) $w));
            if ($w !== '') {
                $out[$w] = true;
            }
        }
        return array_keys($out);
    }

    /* ── Matching ────────────────────────────────────────────────────────── */

    /** Lower-case + collapse common leet substitutions so "f.u.c.k" / "sh1t" still match. */
    private function normalize(string $text): string
    {
        $t = mb_strtolower($text);
        $t = strtr($t, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's', '!' => 'i']);
        $t = preg_replace('/[^a-z0-9\s]/u', ' ', $t) ?? $t;     // drop separators (f.u.c.k → f u c k)
        $t = preg_replace('/\s+/', ' ', $t) ?? $t;
        return ' ' . trim($t) . ' ';
    }

    /**
     * Match against the normalized text AND its letter-run-collapsed variant.
     *
     * normalize() turns "f.u.c.k" into " f u c k " - separators become spaces
     * rather than vanishing - so a word-boundary match on the normalized text
     * alone can never fire on it. Separator evasion therefore passed moderation
     * entirely, despite normalize()'s comment implying it was handled.
     *
     * @param array<int,string> $words @return array<int,string> matched words
     */
    private function matchAll(string $normalized, array $words): array
    {
        $hits = $this->matchWords($normalized, $words);

        $collapsed = $this->collapseLetterRuns($normalized);
        if ($collapsed !== $normalized) {
            $hits = array_merge($hits, $this->matchWords($collapsed, $words));
        }

        return array_values(array_unique($hits));
    }

    /**
     * Join runs of SINGLE-character tokens back into one word, so "f u c k"
     * (from "f.u.c.k" or "f-u-c-k") becomes "fuck" and can be word-boundary
     * matched.
     *
     * Only runs of 2+ single characters are joined, which is what keeps this
     * safe: ordinary words are never merged with their neighbours, so the
     * Scunthorpe problem the matchWords() note warns about does not come back.
     * "my therapist is great" has no single-letter run at all; "I ate a grape"
     * has only isolated single letters ("i", "a"), each a run of one, so both
     * stay exactly as they were.
     */
    private function collapseLetterRuns(string $normalized): string
    {
        $tokens = preg_split('/\s+/', trim($normalized)) ?: [];
        $out    = [];
        $run    = [];

        foreach ($tokens as $token) {
            if ($token === '') {
                continue;
            }
            if (mb_strlen($token) === 1) {
                $run[] = $token;
                continue;
            }
            $out = array_merge($out, $this->flushRun($run));
            $run = [];
            $out[] = $token;
        }
        $out = array_merge($out, $this->flushRun($run));

        return ' ' . implode(' ', $out) . ' ';
    }

    /** A run of 2+ single characters becomes one word; anything shorter is left alone. */
    private function flushRun(array $run): array
    {
        return count($run) >= 2 ? [implode('', $run)] : $run;
    }

    /**
     * Word-boundary match on one already-normalized string. We deliberately do
     * NOT do a substring match - that triggers the "Scunthorpe problem"
     * (e.g. "therapist" → "rapist", "grape" → "rape") and would wrongly
     * auto-block legitimate words. Separator evasion is handled by matchAll()
     * instead, which is precise about what it joins.
     *
     * @param array<int,string> $words @return array<int,string> matched words
     */
    private function matchWords(string $normalized, array $words): array
    {
        if (!$words) {
            return [];
        }
        $hits = [];
        foreach ($words as $w) {
            if (preg_match('/\b' . preg_quote($w, '/') . '\b/', $normalized)) {
                $hits[] = $w;
            }
        }
        return array_values(array_unique($hits));
    }

    /** Replace matched words with asterisks for the "censored" copy. */
    private function censor(string $text, array $words): string
    {
        foreach ($words as $w) {
            $text = preg_replace_callback('/' . preg_quote($w, '/') . '/i', fn ($m) => str_repeat('*', mb_strlen($m[0])), $text) ?? $text;
        }
        return $text;
    }
}
