<?php

namespace App\Services\Auth;

use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Manages the shared `.teezer.live` SSO session cookie.
 *
 * The cookie value is an opaque random secret; only its sha256 is persisted, so a
 * DB leak can't be replayed as a cookie. Cookies are attached to responses via
 * `->withCookie()` (the API middleware group has no AddQueuedCookies/EncryptCookies,
 * so `Cookie::queue()` would be dropped and encryption would be inconsistent).
 */
class SsoSessionService
{
    public function cookieName(): string
    {
        return (string) config('sso.cookie_name', 'teezer_sso');
    }

    /** Create a fresh SSO session for the user; returns the Set-Cookie to attach. */
    public function start(User $user, Request $request): Cookie
    {
        $secret = Str::random(64);

        SsoSession::create([
            'user_id'      => $user->id,
            'token_hash'   => hash('sha256', $secret),
            'user_agent'   => Str::limit((string) $request->userAgent(), 250, ''),
            'ip_address'   => $request->ip(),
            'last_used_at' => now(),
            'expires_at'   => now()->addMinutes($this->lifetime()),
        ]);

        return $this->makeCookie($secret, $this->lifetime());
    }

    /** Resolve a valid (unrevoked, unexpired) SSO session from the request cookie. */
    public function resolve(Request $request): ?SsoSession
    {
        $secret = $request->cookie($this->cookieName());
        if (! is_string($secret) || $secret === '') {
            return null;
        }

        $session = SsoSession::query()
            ->where('token_hash', hash('sha256', $secret))
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->first();

        if (! $session) {
            return null;
        }

        // Sliding window: keep the session (and cookie, refreshed by the caller) alive.
        $session->forceFill([
            'last_used_at' => now(),
            'expires_at'   => now()->addMinutes($this->lifetime()),
        ])->saveQuietly();

        return $session;
    }

    /** Issue a fresh CSRF token bound to this session; returns the plaintext token. */
    public function issueCsrf(SsoSession $session): string
    {
        $csrf = Str::random(64);
        $session->forceFill(['csrf_hash' => hash('sha256', $csrf)])->saveQuietly();

        return $csrf;
    }

    /** Constant-time verify a submitted CSRF token against the session. */
    public function verifyCsrf(SsoSession $session, ?string $token): bool
    {
        return is_string($token)
            && $token !== ''
            && is_string($session->csrf_hash)
            && hash_equals($session->csrf_hash, hash('sha256', $token));
    }

    public function revoke(SsoSession $session): void
    {
        $session->forceFill(['revoked_at' => now()])->saveQuietly();
    }

    public function revokeAllForUser(int $userId): void
    {
        SsoSession::where('user_id', $userId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    public function makeCookie(string $value, int $minutes): Cookie
    {
        return Cookie::create(
            name: $this->cookieName(),
            value: $value,
            expire: $minutes > 0 ? now()->addMinutes($minutes)->getTimestamp() : 0,
            path: '/',
            domain: config('sso.cookie_domain') ?: null,
            secure: (bool) config('sso.cookie_secure', true),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        );
    }

    public function forgetCookie(): Cookie
    {
        return Cookie::create(
            name: $this->cookieName(),
            value: '',
            expire: 1,
            path: '/',
            domain: config('sso.cookie_domain') ?: null,
            secure: (bool) config('sso.cookie_secure', true),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        );
    }

    private function lifetime(): int
    {
        return (int) config('sso.lifetime_minutes', 60 * 24 * 30);
    }
}
