<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin client for Centrifugo's server HTTP API + JWT minting.
 *
 * - broadcast()/publish() are the fan-out primitives that replace the Redis
 *   pub/sub → chat-server path (see RealtimeBus). Fire-and-forget: a Centrifugo
 *   hiccup never breaks the originating request.
 * - connectionToken()/subscriptionToken() mint HS256 JWTs signed with the shared
 *   token_hmac_secret_key so Centrifugo can authenticate connections and gate
 *   private channels - issued to clients via RealtimeController.
 *
 * Targets the Centrifugo v5 HTTP API (/api/publish, /api/broadcast, X-API-Key).
 */
class CentrifugoClient
{
    /** Publish one payload to many channels in a single call. */
    public static function broadcast(array $channels, array $data): void
    {
        $channels = array_values(array_filter($channels, static fn ($c) => is_string($c) && $c !== ''));
        if (empty($channels)) {
            return;
        }
        self::apiCall('/api/broadcast', ['channels' => $channels, 'data' => $data]);
    }

    /** Publish one payload to a single channel. */
    public static function publish(string $channel, array $data): void
    {
        if ($channel === '') {
            return;
        }
        self::apiCall('/api/publish', ['channel' => $channel, 'data' => $data]);
    }

    private static function apiCall(string $path, array $body): void
    {
        $base = rtrim((string) config('services.centrifugo.api_url'), '/');
        try {
            Http::withHeaders(['X-API-Key' => (string) config('services.centrifugo.api_key')])
                ->connectTimeout(1)
                ->timeout(2)
                ->post($base . $path, $body);
        } catch (\Throwable $e) {
            Log::warning('Centrifugo API call failed', ['path' => $path, 'err' => $e->getMessage()]);
        }
    }

    /** Number of distinct users currently present on a channel (0 if none / on error). */
    public static function presenceStats(string $channel): int
    {
        $base = rtrim((string) config('services.centrifugo.api_url'), '/');
        try {
            $resp = Http::withHeaders(['X-API-Key' => (string) config('services.centrifugo.api_key')])
                ->connectTimeout(1)
                ->timeout(2)
                ->post($base . '/api/presence_stats', ['channel' => $channel]);

            return (int) ($resp->json('result.num_users') ?? 0);
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /** Short-lived connection JWT for the authenticated user (sub = user id). */
    public static function connectionToken(int $userId, ?int $ttl = null): string
    {
        $ttl = $ttl ?? (int) config('services.centrifugo.token_ttl', 3600);
        return self::jwt([
            'sub' => (string) $userId,
            'iat' => time(),
            'exp' => time() + $ttl,
        ]);
    }

    /** Subscription JWT authorizing one private channel for the user. */
    public static function subscriptionToken(int $userId, string $channel, ?int $ttl = null): string
    {
        $ttl = $ttl ?? (int) config('services.centrifugo.token_ttl', 3600);
        return self::jwt([
            'sub'     => (string) $userId,
            'channel' => $channel,
            'iat'     => time(),
            'exp'     => time() + $ttl,
        ]);
    }

    /** Minimal dependency-free HS256 JWT (matches Centrifugo's expected format). */
    private static function jwt(array $claims): string
    {
        $secret  = (string) config('services.centrifugo.token_secret');
        $b64url  = static fn ($d) => rtrim(strtr(base64_encode((string) json_encode($d)), '+/', '-_'), '=');
        $signing = $b64url(['alg' => 'HS256', 'typ' => 'JWT']) . '.' . $b64url($claims);
        $sig     = hash_hmac('sha256', $signing, $secret, true);

        return $signing . '.' . rtrim(strtr(base64_encode($sig), '+/', '-_'), '=');
    }
}
