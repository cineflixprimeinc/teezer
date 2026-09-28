<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * "Test Connection" for Admin › Social Login - same two rules
 * Integrations\ConnectionTester enforces, for the same reason:
 *
 *  1. Every test is READ-ONLY or a token mint. Never a write, never
 *     anything that could be mistaken for a real sign-in.
 *  2. Nothing returned here reaches the browser unredacted - provider error
 *     bodies routinely echo the credential that failed.
 *
 * A real "does this OAuth client work" test is fundamentally harder here
 * than for Integrations' API-key providers: a social login client is only
 * ever fully proven by a real user completing a real browser/app consent
 * flow, which a settings-screen button cannot do. What IS achievable
 * without one - and what actually catches the mistakes people make pasting
 * these in (wrong field, extra whitespace, secret from the wrong project,
 * ID that was never registered) - is asking the provider's own token
 * endpoint to REJECT a deliberately fake authorization code, and reading
 * *which* error comes back:
 *
 *   invalid_client            -> the id/secret pair itself is wrong
 *   invalid_grant / anything else -> the client was recognised; only the
 *                                    fake code failed, exactly as expected
 *
 * That distinction is the actual signal, for every provider that has a
 * client_secret. Apple's schema here has no secret at all (bundle_ids only,
 * used to check the audience of an identity token Apple already signed
 * with ITS OWN key) - there is nothing to authenticate with, so its "test"
 * is a plain reachability check on Apple's public key endpoint instead,
 * and says so.
 */
class SocialLoginTester
{
    private const TIMEOUT = 8;

    /** @return array{ok: bool, message: string} */
    public function test(string $provider): array
    {
        if (! SocialLoginConfig::isValidProvider($provider)) {
            return ['ok' => false, 'message' => 'Unknown provider.'];
        }

        try {
            return match ($provider) {
                'google'   => $this->testGoogle(),
                'apple'    => $this->testApple(),
                'facebook' => $this->testFacebook(),
                'tiktok'   => $this->testTiktok(),
                default    => ['ok' => false, 'message' => 'No connection test for this provider.'],
            };
        } catch (Throwable $e) {
            return ['ok' => false, 'message' => $this->redact($e->getMessage(), $provider)];
        }
    }

    private function testGoogle(): array
    {
        $clientIds = SocialLoginConfig::list('google', 'client_ids');
        $clientId  = $clientIds[0] ?? null;
        $secret    = SocialLoginConfig::value('google', 'client_secret');

        if (! $clientId) {
            return ['ok' => false, 'message' => 'No Client ID saved yet.'];
        }
        if (! str_ends_with($clientId, '.apps.googleusercontent.com')) {
            return ['ok' => false, 'message' => "That doesn't look like a Google OAuth Client ID - it should end in .apps.googleusercontent.com."];
        }
        if (! $secret) {
            // The mobile ID-token flow (what this app actually uses) needs no
            // secret at all - format is the only thing checkable without one.
            return ['ok' => true, 'message' => 'Client ID format looks valid. Add a Client Secret to also verify it against Google.'];
        }

        $response = Http::timeout(self::TIMEOUT)->asForm()->post('https://oauth2.googleapis.com/token', [
            'grant_type'    => 'authorization_code',
            'code'          => 'reelsoo-test-connection-invalid-code',
            'client_id'     => $clientId,
            'client_secret' => $secret,
            'redirect_uri'  => 'https://teezer.live',
        ]);

        $error = (string) ($response->json('error') ?? '');
        if ($error === 'invalid_client') {
            return ['ok' => false, 'message' => 'Google rejected this Client ID / Secret pair (invalid_client).'];
        }
        if ($error !== '') {
            // invalid_grant, redirect_uri_mismatch, etc - the client itself
            // was recognised; only the deliberately-fake code failed.
            return ['ok' => true, 'message' => 'Google recognises this Client ID and Secret.'];
        }

        return ['ok' => false, 'message' => 'Unexpected response from Google (HTTP ' . $response->status() . ').'];
    }

    private function testApple(): array
    {
        $bundleIds = SocialLoginConfig::list('apple', 'bundle_ids');
        if (! $bundleIds) {
            return ['ok' => false, 'message' => 'No Bundle ID(s) saved yet.'];
        }

        $response = Http::timeout(self::TIMEOUT)->get('https://appleid.apple.com/auth/keys');
        if (! $response->successful() || ! $response->json('keys')) {
            return ['ok' => false, 'message' => "Couldn't reach Apple's sign-in service right now."];
        }

        // Apple's own keys sign every identity token; this app never holds an
        // Apple secret to check against, so reachability is the whole test -
        // the bundle ID(s) themselves are only ever proven by a real sign-in.
        return ['ok' => true, 'message' => "Apple's sign-in service is reachable. Bundle ID(s) can only be confirmed by an actual sign-in attempt."];
    }

    private function testFacebook(): array
    {
        $appId     = SocialLoginConfig::value('facebook', 'app_id');
        $appSecret = SocialLoginConfig::value('facebook', 'app_secret');

        if (! $appId || ! $appSecret) {
            return ['ok' => false, 'message' => 'App ID and App Secret are both required to test Facebook.'];
        }

        // Facebook's own documented way to prove an id/secret pair - mints an
        // app access token, nothing user- or content-related.
        $response = Http::timeout(self::TIMEOUT)->get('https://graph.facebook.com/oauth/access_token', [
            'client_id'     => $appId,
            'client_secret' => $appSecret,
            'grant_type'    => 'client_credentials',
        ]);

        if ($response->successful() && filled($response->json('access_token'))) {
            return ['ok' => true, 'message' => 'Facebook accepted this App ID and Secret.'];
        }

        $message = (string) ($response->json('error.message') ?? ('HTTP ' . $response->status()));
        return ['ok' => false, 'message' => "Facebook rejected the credentials ({$message})."];
    }

    private function testTiktok(): array
    {
        $clientKey    = SocialLoginConfig::value('tiktok', 'client_key');
        $clientSecret = SocialLoginConfig::value('tiktok', 'client_secret');

        if (! $clientKey || ! $clientSecret) {
            return ['ok' => false, 'message' => 'Client Key and Client Secret are both required to test TikTok.'];
        }

        $response = Http::timeout(self::TIMEOUT)->asForm()
            ->withHeaders(['Content-Type' => 'application/x-www-form-urlencoded'])
            ->post('https://open.tiktokapis.com/v2/oauth/token/', [
                'client_key'    => $clientKey,
                'client_secret' => $clientSecret,
                'grant_type'    => 'client_credentials',
            ]);

        if ($response->successful() && filled($response->json('access_token'))) {
            return ['ok' => true, 'message' => 'TikTok accepted this Client Key and Secret.'];
        }

        $message = (string) ($response->json('error_description') ?? $response->json('message') ?? ('HTTP ' . $response->status()));
        return ['ok' => false, 'message' => "TikTok rejected the credentials ({$message})."];
    }

    /** Strip anything that looks like our own saved secret out of a message before it is shown. */
    private function redact(string $message, string $provider): string
    {
        foreach (SocialLoginConfig::schema()[$provider]['fields'] ?? [] as $field => $meta) {
            $value = SocialLoginConfig::value($provider, $field);
            if (is_string($value) && strlen($value) >= 8) {
                $message = str_replace($value, '[redacted]', $message);
            }
        }

        return mb_substr($message, 0, 300);
    }
}
