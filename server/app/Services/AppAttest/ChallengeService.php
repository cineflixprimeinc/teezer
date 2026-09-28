<?php

namespace App\Services\AppAttest;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Single-use, short-lived, server-generated challenges.
 *
 * The challenge is what stops a captured attestation or assertion from being
 * replayed: the device signs over something only this server could have chosen,
 * and the server refuses to accept the same one twice. Everything below exists
 * to make those two properties true.
 *
 * Stored in the cache rather than Postgres deliberately - these are
 * high-volume, live for minutes, and are worthless the moment they are used;
 * writing them to a table would be a lot of churn for rows nobody ever reads
 * twice. Note that on this project the cache store IS Redis in production
 * (docs/redis-caching-layer.md) but `array` in local dev, where a challenge
 * simply will not survive between two requests - App Attest cannot be
 * end-to-end tested locally without pointing CACHE_STORE at a real Redis.
 *
 * `purpose` binds a challenge to what it was issued for, so one minted for the
 * cheap attestation endpoint cannot be spent on a withdrawal.
 */
class ChallengeService
{
    private const PREFIX = 'appattest:challenge:';

    /**
     * Mint a challenge and remember it.
     *
     * 32 bytes from the CSPRNG. Returned base64 because it travels as JSON and
     * the client feeds it straight back; the stored copy is the same string, so
     * comparison never depends on re-encoding it the same way twice.
     */
    public function issue(string $purpose, ?int $userId = null): string
    {
        $challenge = base64_encode(random_bytes(32));

        Cache::put(
            self::PREFIX . hash('sha256', $challenge),
            ['purpose' => $purpose, 'user_id' => $userId],
            (int) config('appattest.challenge_ttl', 300),
        );

        return $challenge;
    }

    /**
     * Spend a challenge. Returns false if it never existed, already expired,
     * was issued for something else, or belongs to another user.
     *
     * The forget() is what makes it single-use, and it happens BEFORE any of
     * the expensive signature verification the caller goes on to do - so two
     * concurrent replays cannot both get past this point while the first is
     * still verifying. Cache::pull is the atomic get-and-delete that makes that
     * true; a get() followed by a forget() would leave exactly the window this
     * is meant to close.
     */
    public function consume(string $challenge, string $purpose, ?int $userId = null): bool
    {
        $record = Cache::pull(self::PREFIX . hash('sha256', $challenge));

        if (! is_array($record)) {
            return false;
        }

        if (($record['purpose'] ?? null) !== $purpose) {
            return false;
        }

        // A challenge issued to a signed-in user is only valid for that user.
        // Issued anonymously (user_id null, e.g. pre-login), it is not pinned.
        if (($record['user_id'] ?? null) !== null && $record['user_id'] !== $userId) {
            return false;
        }

        return true;
    }

    /**
     * The digest Apple expects the device to have signed.
     *
     * For attestation this is SHA-256 of the raw challenge. For an assertion it
     * is SHA-256 over the challenge PLUS whatever else binds the signature to
     * this one request - see AssertionVerifier for how the client data is
     * composed. Kept here so both sides derive it identically.
     */
    public static function digest(string $clientData): string
    {
        return hash('sha256', $clientData, true);
    }

    /** Constant-time compare, for anything derived from a secret. */
    public static function equals(string $a, string $b): bool
    {
        return hash_equals($a, $b);
    }
}
