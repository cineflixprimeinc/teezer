<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\OauthGrant;
use App\Models\SsoSession;
use App\Models\User;
use App\Services\Ads\AdAccountService;
use App\Services\Auth\SsoSessionService;
use App\Services\StorageService;
use App\Support\AuthUserResource;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Internal Reelsoo SSO — cross-subdomain recognition + OAuth-style consent.
 *
 * Auth here is the shared `.reelsoo.com` SSO cookie (NOT auth:sanctum). `session`
 * is a safe, read-only status probe; `authorize` is the single, CSRF-protected,
 * token-minting + consent-recording path (used both for first-time "Allow" and
 * for silent auto sign-in when a grant already exists). This flow NEVER creates a
 * user — it only recognizes an already-authenticated Reelsoo account.
 */
class SsoController extends Controller
{
    public function __construct(
        private SsoSessionService $sso,
        private AdAccountService $accounts,
    ) {}

    /** GET /auth/sso/session?client=ads — cookie-authed status (always HTTP 200). */
    public function session(Request $request): JsonResponse
    {
        $client = $this->clientKey($request->query('client'));

        $session = $this->sso->resolve($request);
        $user    = $session ? $session->user : null;

        if (! $session || ! $user || ! $this->usable($user)) {
            if ($session) {
                $this->sso->revoke($session);
            }
            return response()->json(['success' => true, 'authenticated' => false])
                ->withCookie($this->sso->forgetCookie());
        }

        $granted = $this->hasGrant($user->id, $client);
        $csrf    = $this->sso->issueCsrf($session);
        $config  = config("sso.clients.$client");

        return response()->json([
            'success'       => true,
            'authenticated' => true,
            'user'          => [
                'id'       => $user->id,
                'name'     => $user->name,
                'username' => $user->username,
                'email'    => $user->email,
                'avatar'   => $user->avatar ? \Illuminate\Support\Facades\Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
            ],
            'csrf_token'    => $csrf,
            'client'        => [
                'name'         => $client,
                'display_name' => $config['display_name'] ?? ucfirst($client),
                'status'       => $granted ? 'granted' : 'needs_consent',
                'scopes'       => $config['scopes'] ?? [],
            ],
        ])->withCookie($this->sso->makeCookie($this->cookieSecret($request), (int) config('sso.lifetime_minutes')));
    }

    /**
     * POST /auth/sso/authorize — record consent (idempotent) + mint a client token.
     * Requires the SSO cookie AND the double-submit CSRF token from /session.
     */
    public function authorize(Request $request): JsonResponse
    {
        $client  = $this->clientKey($request->input('client'));
        $session = $this->sso->resolve($request);
        $user    = $session ? $session->user : null;

        if (! $session || ! $user || ! $this->usable($user)) {
            return response()->json(['success' => false, 'message' => 'SSO session required.', 'code' => 'SSO_REQUIRED'], 403);
        }

        $csrfHeader = $request->header('X-Reelsoo-SSO-CSRF') ?? $request->header('X-CSRF-Token');
        if (! $this->sso->verifyCsrf($session, $csrfHeader)) {
            return response()->json(['success' => false, 'message' => 'Invalid request token.', 'code' => 'CSRF_INVALID'], 403);
        }

        $config = config("sso.clients.$client");
        if (! $config) {
            return response()->json(['success' => false, 'message' => 'Unknown client.', 'code' => 'UNKNOWN_CLIENT'], 422);
        }

        // Which permissions the user ticked (validated against the client's
        // advertised scopes). Defaults to all; 'profile' is always required.
        $allowedKeys = array_column($config['scopes'] ?? [], 'key');
        $requested   = $request->input('scopes');
        $grantedKeys = is_array($requested)
            ? array_values(array_intersect($allowedKeys, array_map('strval', $requested)))
            : $allowedKeys;
        if (in_array('profile', $allowedKeys, true) && ! in_array('profile', $grantedKeys, true)) {
            $grantedKeys[] = 'profile';
        }

        // Record the consent grant (idempotent — one row per user+client).
        OauthGrant::updateOrCreate(
            ['user_id' => $user->id, 'client' => $client],
            [
                'scopes'     => $grantedKeys,
                'granted_at' => now(),
                'revoked_at' => null,
            ],
        );

        // Provision the client's resources. For ads: ensure the ad account exists
        // (race-safe against the new ad_accounts.user_id unique constraint).
        if ($client === 'ads') {
            try {
                $this->accounts->forUser($user->id);
            } catch (QueryException $e) {
                // Concurrent create hit the unique constraint — the row now exists.
                $this->accounts->forUser($user->id);
            }
        }

        // Mint a least-privilege Bearer token for this origin, mirroring the login
        // token cap (keep 9 newest, then create the 10th).
        $abilities = $config['token_abilities'] ?? ['*'];
        $expiresAt = now()->addMinutes((int) config('sanctum.expiration', 60 * 24 * 30) ?: 60 * 24 * 30);

        $keepIds = $user->tokens()->orderByDesc('created_at')->take(9)->pluck('id');
        if ($keepIds->isNotEmpty()) {
            $user->tokens()->whereNotIn('id', $keepIds)->delete();
        }
        $token = $user->createToken("sso:$client", $abilities, $expiresAt)->plainTextToken;

        return response()->json([
            'success' => true,
            'data'    => [
                'token'      => $token,
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt->toIso8601String(),
                'user'       => AuthUserResource::make($user->loadMissing('profile')),
            ],
            'client'  => ['name' => $client, 'status' => 'granted'],
        ])->withCookie($this->sso->makeCookie($this->cookieSecret($request), (int) config('sso.lifetime_minutes')));
    }

    /**
     * POST /auth/sso/login — mint this origin's Bearer token for an authenticated
     * SSO session WITHOUT recording consent. The consent grant is a separate,
     * full-page authorization step (see grant()). Cookie + CSRF.
     */
    public function login(Request $request): JsonResponse
    {
        $client  = $this->clientKey($request->input('client'));
        $session = $this->sso->resolve($request);
        $user    = $session ? $session->user : null;

        if (! $session || ! $user || ! $this->usable($user)) {
            return response()->json(['success' => false, 'message' => 'SSO session required.', 'code' => 'SSO_REQUIRED'], 403);
        }
        $csrfHeader = $request->header('X-Reelsoo-SSO-CSRF') ?? $request->header('X-CSRF-Token');
        if (! $this->sso->verifyCsrf($session, $csrfHeader)) {
            return response()->json(['success' => false, 'message' => 'Invalid request token.', 'code' => 'CSRF_INVALID'], 403);
        }

        $config    = config("sso.clients.$client");
        $abilities = $config['token_abilities'] ?? ['*'];
        $expiresAt = now()->addMinutes((int) config('sanctum.expiration', 60 * 24 * 30) ?: 60 * 24 * 30);

        $keepIds = $user->tokens()->orderByDesc('created_at')->take(9)->pluck('id');
        if ($keepIds->isNotEmpty()) {
            $user->tokens()->whereNotIn('id', $keepIds)->delete();
        }
        $token = $user->createToken("sso:$client", $abilities, $expiresAt)->plainTextToken;

        return response()->json([
            'success' => true,
            'data'    => [
                'token'      => $token,
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt->toIso8601String(),
                'user'       => AuthUserResource::make($user->loadMissing('profile')),
            ],
        ])->withCookie($this->sso->makeCookie($this->cookieSecret($request), (int) config('sso.lifetime_minutes')));
    }

    /**
     * GET /auth/sso/grant-status?client=ads — Bearer-authed. Whether the current
     * user has authorized the client yet, plus the info the full-page authorization
     * screen needs to render.
     */
    public function grantStatus(Request $request): JsonResponse
    {
        $client = $this->clientKey($request->query('client'));
        $user   = $request->user();
        $config = config("sso.clients.$client");

        return response()->json([
            'success' => true,
            'granted' => $this->hasGrant($user->id, $client),
            'user'    => [
                'id'       => $user->id,
                'name'     => $user->name,
                'username' => $user->username,
                'email'    => $user->email,
                'avatar'   => $user->avatar ? \Illuminate\Support\Facades\Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
            ],
            'client'  => [
                'name'         => $client,
                'display_name' => $config['display_name'] ?? ucfirst($client),
                'scopes'       => $config['scopes'] ?? [],
            ],
        ]);
    }

    /**
     * POST /auth/sso/grant {client, scopes} — Bearer-authed. Record the consent
     * grant (selected scopes) + provision the client (ad account for 'ads').
     */
    public function grant(Request $request): JsonResponse
    {
        $client = $this->clientKey($request->input('client'));
        $user   = $request->user();
        $config = config("sso.clients.$client");
        if (! $config) {
            return response()->json(['success' => false, 'message' => 'Unknown client.', 'code' => 'UNKNOWN_CLIENT'], 422);
        }

        $allowedKeys = array_column($config['scopes'] ?? [], 'key');
        $requested   = $request->input('scopes');
        $grantedKeys = is_array($requested)
            ? array_values(array_intersect($allowedKeys, array_map('strval', $requested)))
            : $allowedKeys;
        if (in_array('profile', $allowedKeys, true) && ! in_array('profile', $grantedKeys, true)) {
            $grantedKeys[] = 'profile';
        }

        OauthGrant::updateOrCreate(
            ['user_id' => $user->id, 'client' => $client],
            ['scopes' => $grantedKeys, 'granted_at' => now(), 'revoked_at' => null],
        );

        if ($client === 'ads') {
            try {
                $this->accounts->forUser($user->id);
            } catch (QueryException $e) {
                $this->accounts->forUser($user->id);
            }
        }

        return response()->json(['success' => true, 'granted' => true, 'scopes' => $grantedKeys]);
    }

    /**
     * POST /auth/sso/promote — establish the shared SSO cookie for a Bearer-
     * authenticated session that predates it (e.g. an existing reelsoo.com login
     * hitting /connect). auth:sanctum protected.
     */
    public function promote(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json(['success' => true])
            ->withCookie($this->sso->start($user, $request));
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    private function clientKey(mixed $raw): string
    {
        $key = is_string($raw) ? strtolower(trim($raw)) : '';
        return $key !== '' && config("sso.clients.$key") ? $key : 'ads';
    }

    private function usable(User $user): bool
    {
        return (bool) $user->is_active && ! $user->is_banned;
    }

    private function hasGrant(int $userId, string $client): bool
    {
        return OauthGrant::where('user_id', $userId)
            ->where('client', $client)
            ->whereNull('revoked_at')
            ->exists();
    }

    private function cookieSecret(Request $request): string
    {
        return (string) $request->cookie($this->sso->cookieName());
    }
}
