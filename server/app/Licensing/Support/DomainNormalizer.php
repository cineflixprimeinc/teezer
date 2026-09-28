<?php

namespace App\Licensing\Support;

/**
 * The single definition of what a licensed domain IS.
 *
 * This class runs on BOTH sides - the licence server normalises before binding,
 * the customer installation normalises before comparing - which is the point:
 * if binding and verification used two different notions of "the same domain",
 * a licence could bind to one string and refuse to verify against an equivalent
 * one, or worse, verify against a different one.
 *
 * Comparison is EXACT EQUALITY of the normalised form, via hash_equals. There
 * is deliberately no suffix, prefix or wildcard matching anywhere in this file,
 * because that is precisely where this kind of check usually breaks:
 *
 *   str_ends_with('example.com.evil.com', 'example.com')   === true   BAD
 *   str_contains('evil-example.com', 'example.com')        === true   BAD
 *
 * Both of those are rejected here, and there is a test asserting so.
 *
 * Policy decisions baked in, per the spec:
 *   - scheme, port, path, query, fragment and userinfo are stripped
 *   - a leading "www." is equivalent to its absence
 *   - a trailing root dot is equivalent to its absence
 *   - comparison is case-insensitive (DNS is)
 *   - unicode domains are folded to punycode when ext-intl is available, so
 *     the homograph forms of a name cannot masquerade as distinct licences
 *   - a bare IP address is NOT a domain and is refused
 */
final class DomainNormalizer
{
    public const MAX_LENGTH = 253;

    /**
     * Reduce any user-supplied spelling of a domain to its canonical form.
     *
     * Returns null when the input is not a usable hostname at all. Callers MUST
     * treat null as a validation failure - never as "matches anything".
     */
    public static function normalize(?string $input): ?string
    {
        if ($input === null) {
            return null;
        }

        $value = trim($input);
        if ($value === '') {
            return null;
        }

        // Strip a scheme if present. Anything that is not http/https is
        // refused outright rather than silently stripped - a licence request
        // carrying ftp:// or javascript:// is malformed, not merely verbose.
        if (preg_match('~^([a-z][a-z0-9+.-]*)://~i', $value, $m) === 1) {
            if (! in_array(strtolower($m[1]), ['http', 'https'], true)) {
                return null;
            }
            $value = substr($value, strlen($m[0]));
        }

        // Drop userinfo (user:pass@) - "user@evil.com" style confusion.
        if (($at = strrpos($value, '@')) !== false) {
            $value = substr($value, $at + 1);
        }

        // Drop everything from the first path/query/fragment delimiter.
        foreach (['/', '?', '#'] as $delimiter) {
            if (($pos = strpos($value, $delimiter)) !== false) {
                $value = substr($value, 0, $pos);
            }
        }

        // Bracketed IPv6 literal - a valid host, but never a licensable domain.
        if (str_starts_with($value, '[')) {
            return null;
        }

        // Drop a port suffix.
        if (($colon = strrpos($value, ':')) !== false) {
            $maybePort = substr($value, $colon + 1);
            if ($maybePort === '' || ctype_digit($maybePort)) {
                $value = substr($value, 0, $colon);
            } else {
                // A colon that is not a port means this is not a hostname.
                return null;
            }
        }

        $value = rtrim(trim($value), '.');
        if ($value === '') {
            return null;
        }

        // Fold unicode to punycode where we can. Without ext-intl a non-ASCII
        // domain is refused rather than compared byte-wise, because byte-wise
        // comparison of unicode hostnames is exactly the homograph hole.
        if (preg_match('/[^\x20-\x7E]/', $value) === 1) {
            if (! function_exists('idn_to_ascii')) {
                return null;
            }
            $ascii = idn_to_ascii($value, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);
            if ($ascii === false || $ascii === '') {
                return null;
            }
            $value = $ascii;
        }

        $value = strtolower($value);

        // "www." is treated as equivalent to its absence, per the spec's own
        // example list. Stripped once and only at the very front.
        if (str_starts_with($value, 'www.')) {
            $value = substr($value, 4);
        }

        return self::isValidHostname($value) ? $value : null;
    }

    /**
     * Structural validation of an already-normalised hostname.
     *
     * Rejects a bare IPv4 address by requiring the last label to contain a
     * non-digit: 203.0.113.10 has an all-numeric final label, example.com does
     * not. No real TLD is all digits, so this costs nothing legitimate.
     */
    public static function isValidHostname(string $host): bool
    {
        if ($host === '' || strlen($host) > self::MAX_LENGTH) {
            return false;
        }
        if (! str_contains($host, '.')) {
            return false;
        }
        if (preg_match('/^[a-z0-9.-]+$/', $host) !== 1) {
            return false;
        }
        if (str_contains($host, '..')) {
            return false;
        }

        $labels = explode('.', $host);
        if (count($labels) < 2) {
            return false;
        }

        foreach ($labels as $label) {
            if ($label === '' || strlen($label) > 63) {
                return false;
            }
            if (str_starts_with($label, '-') || str_ends_with($label, '-')) {
                return false;
            }
        }

        return ! ctype_digit(end($labels));
    }

    /**
     * The comparison the licence middleware makes on every check.
     *
     * Both sides are normalised first, so "https://WWW.Example.com/" and
     * "example.com" match, while "example.com.evil.com" and "evil-example.com"
     * do not. A null on either side (unparseable input) is always a
     * non-match - never a pass.
     */
    public static function matches(?string $licensed, ?string $candidate): bool
    {
        $a = self::normalize($licensed);
        $b = self::normalize($candidate);

        if ($a === null || $b === null) {
            return false;
        }

        return hash_equals($a, $b);
    }
}
