<?php

namespace App\Licensing\Server;

/**
 * Generates and hashes the two customer-facing secrets: purchase codes and
 * licence keys.
 *
 * The spec is explicit about what must NOT go into a licence key - timestamps,
 * incremental ids, usernames, domain names, MD5, SHA1, or any predictable
 * hash - and every one of those shares the same flaw: the key becomes a
 * FUNCTION of public information, so anyone who knows the inputs can produce
 * valid keys without ever seeing ours. The rule that avoids all of them at
 * once is that the key must be a function of nothing except the CSPRNG.
 *
 * So: random_bytes() only. No hashing of anything meaningful, no seeding, no
 * derivation from a record. The database row is created AFTER the key exists,
 * never the other way around.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class LicenseKeyFactory
{
    /**
     * Crockford base32 without I, L, O and U: no character in this alphabet can
     * be confused with another when a customer reads a key off a screen and
     * types it into an SSH session, and none of them can accidentally spell a
     * word.
     */
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    public const LICENSE_KEY_PREFIX = 'RL-';

    /**
     * A licence key: RL- plus 24 random base32 characters.
     *
     * 24 characters over a 32-symbol alphabet is 120 bits of entropy. Guessing
     * one is not a thing that happens; and because validation is a hash lookup
     * plus a rate limit, an online attack gets nowhere either.
     */
    public function generateLicenseKey(): string
    {
        return self::LICENSE_KEY_PREFIX . $this->randomString(24);
    }

    /**
     * A purchase code in the familiar marketplace shape:
     *   8-4-4-4-12 hex, e.g. 3f2b91c4-7a1e-4d0b-9c33-51ab77de2210
     *
     * Shaped like a UUID because that is what buyers expect from a marketplace
     * receipt, but it is NOT a UUID: it carries no version nibble, no MAC
     * address, no timestamp and no counter. It is 128 CSPRNG bits formatted to
     * look familiar.
     */
    public function generatePurchaseCode(): string
    {
        $hex = bin2hex(random_bytes(16));

        return implode('-', [
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        ]);
    }

    /**
     * Canonical form used for BOTH hashing and comparison.
     *
     * Without this, a customer who pastes their code with a stray space or in
     * the wrong case gets "invalid purchase code" for a code that is perfectly
     * valid - and support ends up telling people to retype things. Normalising
     * on both the write and the read path makes that class of complaint
     * impossible.
     */
    public function normalize(string $value): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', trim($value)) ?? '');
    }

    /**
     * SHA-256 of the normalised value.
     *
     * Deliberately a plain fast hash rather than bcrypt/argon2, and that IS the
     * right call here even though it would be wrong for a password: these are
     * 120+ bit CSPRNG secrets, not human-chosen ones, so there is no dictionary
     * to attack and no offline guessing advantage to remove. What a slow hash
     * would buy is nothing; what it would cost is a KDF on every licence
     * verification and, worse, the inability to do a single indexed lookup by
     * hash - forcing a table scan comparing every row.
     */
    public function hash(string $value): string
    {
        return hash('sha256', $this->normalize($value));
    }

    /** Last 4 characters, for masked display. Never enough to reconstruct. */
    public function last4(string $value): string
    {
        $normalized = $this->normalize($value);

        return substr($normalized, -4);
    }

    /** The non-secret leading fragment of a licence key, for masked display. */
    public function keyPrefix(string $licenseKey): string
    {
        return substr($this->normalize($licenseKey), 0, 5);
    }

    /**
     * Public, opaque licence identifier. Safe to display, log and put in a URL:
     * it is an identifier, not a credential, and nothing authorises on it.
     */
    public function generateLicenseId(): string
    {
        return 'lic_' . strtolower(bin2hex(random_bytes(10)));
    }

    private function randomString(int $length): string
    {
        $alphabetSize = strlen(self::ALPHABET);
        $out = '';

        for ($i = 0; $i < $length; $i++) {
            // random_int, not rand/mt_rand/array_rand - the only one of those
            // that is cryptographically secure.
            $out .= self::ALPHABET[random_int(0, $alphabetSize - 1)];
        }

        return $out;
    }
}
