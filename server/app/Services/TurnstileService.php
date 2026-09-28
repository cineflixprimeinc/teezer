<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Cloudflare Turnstile verification.
 *
 * Verification is enabled only when TURNSTILE_SECRET_KEY is configured. To avoid
 * ever locking users out because of OUR misconfiguration (wrong secret) or a
 * Cloudflare outage, config/network errors "fail open" (allow); only a genuinely
 * missing/invalid challenge response from the client "fails closed" (reject).
 */
class TurnstileService
{
    private const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    public function enabled(): bool
    {
        return $this->secret() !== '';
    }

    private function secret(): string
    {
        return trim((string) config('services.turnstile.secret', ''));
    }

    /**
     * @return array{ok: bool, config_error: bool}
     *   ok           - challenge passed (or verification disabled)
     *   config_error - our secret is wrong / Cloudflare unreachable (treat as pass)
     */
    public function verify(?string $token, ?string $ip = null): array
    {
        if (! $this->enabled()) {
            return ['ok' => true, 'config_error' => false]; // disabled → allow
        }

        if (empty($token)) {
            return ['ok' => false, 'config_error' => false]; // user/bot skipped the challenge
        }

        try {
            $resp = Http::asForm()->timeout(8)->post(self::VERIFY_URL, array_filter([
                'secret'   => $this->secret(),
                'response' => $token,
                'remoteip' => $ip,
            ]));

            $json = $resp->json() ?: [];
            if (($json['success'] ?? false) === true) {
                return ['ok' => true, 'config_error' => false];
            }

            $errors = (array) ($json['error-codes'] ?? []);
            // These mean WE are misconfigured / the call was malformed - don't punish the user.
            $configError = (bool) array_intersect($errors, [
                'invalid-input-secret',
                'missing-input-secret',
                'bad-request',
                'internal-error',
            ]);
            if ($configError) {
                Log::warning('Turnstile config error, failing open', ['errors' => $errors]);
            }
            return ['ok' => false, 'config_error' => $configError];
        } catch (\Throwable $e) {
            // Network error reaching Cloudflare → fail open so logins keep working.
            Log::warning('Turnstile verify request failed, failing open: ' . $e->getMessage());
            return ['ok' => false, 'config_error' => true];
        }
    }
}
