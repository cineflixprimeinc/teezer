<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use App\Models\RateLimit;
use App\Models\User;
use App\Rules\CleanUsername;
use App\Rules\NotDisposableEmail;
use App\Services\Auth\SsoSessionService;
use App\Services\AuthTokenService;
use App\Services\CountryAvailabilityService;
use App\Services\CountryService;
use App\Services\IsoCountries;
use App\Services\SecurityRateLimiter;
use App\Models\AppSetting;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Cookie;

class ApiAuthController extends Controller
{
    /** See adminSessionCookie()'s docblock for what this carries and why. */
    public const ADMIN_SESSION_COOKIE = 'teezer_admin_session';

    public function __construct(
        private ?CountryService $countries = null,
        private ?SecurityRateLimiter $securityLimiter = null,
        private ?AuthTokenService $tokens = null,
        private ?CountryAvailabilityService $countryAvailability = null,
        private ?\App\Services\GlobalControls\GlobalControlService $globalControls = null,
    )
    {
        // Resolved via container; null guard keeps unit tests that mock the
        // controller from blowing up.
        $this->countries ??= app(CountryService::class);
        $this->securityLimiter ??= app(SecurityRateLimiter::class);
        $this->tokens ??= app(AuthTokenService::class);
        $this->countryAvailability ??= app(CountryAvailabilityService::class);
        $this->globalControls ??= app(\App\Services\GlobalControls\GlobalControlService::class);
    }

    /**
     * Global Teezer Control's standard denial body (spec §32) - routed
     * through the real registry key so the response carries the same
     * message and expiresAt every other gated endpoint returns, rather
     * than a hand-typed pair that can drift from it.
     */
    private function globalControlDeniedResponse(string $key): JsonResponse
    {
        return response()->json($this->globalControls->deniedResponse($key), 403);
    }

    /** Shared by register()/completeSocial()/login() - one place builds the
     *  structured denial body every enforcement point returns. */
    private function countryDeniedResponse(array $check): JsonResponse
    {
        return response()->json([
            'success' => false,
            'code'    => $check['action'] === 'SIGNUP' ? 'COUNTRY_NOT_AVAILABLE' : 'COUNTRY_LOGIN_RESTRICTED',
            'country' => $check['country'],
            'action'  => $check['action'],
            'message' => $check['reason'],
        ], 403);
    }

    public function register(Request $request): JsonResponse
    {
        if ($request->isJson() && !empty($request->getContent())) {
            $request->merge((array) json_decode($request->getContent(), true));
        }

        $registerIds = array_filter([
            'ip' => $request->ip(),
            'device' => $this->securityLimiter->device($request),
        ]);
        $this->securityLimiter->hitOrFail($request, 'register_hour', $registerIds, 5, 3600, [3600, 86400]);
        $this->securityLimiter->hitOrFail($request, 'register_day', $registerIds, 10, 86400, [86400]);

        $request->validate([
            'name'          => ['required', 'string', 'max:100'],
            'username'      => ['required', 'string', 'max:50', 'unique:users,username', 'regex:/^[a-zA-Z0-9_\.]+$/', new CleanUsername],
            'email'         => ['required', 'email', 'max:191', 'unique:users,email', new NotDisposableEmail],
            'password'      => ['required', 'string', 'min:8', 'confirmed'],
            'date_of_birth' => ['nullable', 'date'],
            'country'       => ['nullable', 'string', 'max:100'],
            'country_code'  => ['nullable', 'string', 'size:2'],
            'draft_token'   => ['required', 'string'],
        ]);

        // Country availability - the server-DETECTED country decides this,
        // never the country/country_code fields above (those are a user
        // preference for the separate CountryService lock/verification
        // system, consulted further down - see CountryAvailabilityService's
        // own docblock). Checked before anything else has a side effect.
        $signupCheck = $this->countryAvailability->evaluateSignupAccess($request);
        if (!$signupCheck['allowed']) {
            return $this->countryDeniedResponse($signupCheck);
        }

        // Require verified email via signup draft
        $draft = DB::table('signup_drafts')
            ->where('draft_token', $request->draft_token)
            ->where('email', $request->email)
            ->where('email_verified', true)
            ->where('expires_at', '>', now())
            ->first();

        if (!$draft) {
            return response()->json([
                'success' => false,
                'message' => 'Please verify your email before creating your account.',
                'code'    => 'EMAIL_NOT_VERIFIED',
            ], 403);
        }

        // is_active is a PRIVILEGED field: User::fill() throws on it by design,
        // so that a crafted request body can never flip an account's role, ban
        // state or activation. Signup legitimately needs to set it, which is
        // what forceFill is for - the guard's own documented escape hatch.
        //
        // Passing it to create() threw MassAssignmentException and returned a
        // 500, so email signup could not complete at all. Every account created
        // is active anyway, so the column default carries the same meaning
        // without asking the guard to make an exception.
        $user = new User();
        $user->fill([
            'name'              => $request->name,
            'username'          => strtolower(trim($request->username)),
            'email'             => $request->email,
            'password'          => $request->password,
            'date_of_birth'     => $request->date_of_birth,
            'country'           => $request->country,
            'email_verified_at' => now(),
        ]);
        $user->forceFill(['is_active' => true])->save();

        // Clean up signup draft
        DB::table('signup_drafts')->where('draft_token', $request->draft_token)->delete();

        // Bootstrap profile row
        Profile::create(['user_id' => $user->id]);

        // Country module: record user-selected country, run detection,
        // and start the 60-day lock. Never blocks signup if detection fails.
        try {
            $code = $request->input('country_code')
                ?: $this->countryNameToCode((string) $request->input('country'));
            $this->countries->onSignup($user, $request, $code ?: 'NP');
        } catch (\Throwable $e) {
            report($e);
        }

        $expiresAt = $this->tokenExpiresAt();
        $token = $user->createToken('flutter-app', ['*'], $expiresAt)->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Account created successfully.',
            'data'    => [
                'token'      => $token,
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt->toIso8601String(),
                'user'       => $this->userResource($user),
            ],
        ], 201)->withCookie(app(SsoSessionService::class)->start($user, $request));
    }

    public function login(Request $request): JsonResponse
    {
        if ($request->isJson() && !empty($request->getContent())) {
            $request->merge((array) json_decode($request->getContent(), true));
        }

        $request->validate([
            'login'    => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        // Cloudflare Turnstile - block bots before any credential work. No-op
        // unless TURNSTILE_SECRET_KEY is set; config/network errors fail open.
        // The native mobile client can't render the web widget, so it's exempt
        // (decision D3) - it's still covered by the rate-limiter + device
        // fingerprint below.
        if (! $this->isMobileClient($request)) {
            $turnstile = app(\App\Services\TurnstileService::class)
                ->verify($request->input('turnstile_token'), $request->ip());
            if (! $turnstile['ok'] && ! $turnstile['config_error']) {
                throw ValidationException::withMessages([
                    'login' => ['Please complete the verification challenge and try again.'],
                ]);
            }
        }

        $account = $this->securityLimiter->normalizeAccount($request->login);
        $device = $this->securityLimiter->device($request);
        $loginIds = array_filter(['ip' => $request->ip(), 'account' => $account]);
        $wrongPasswordIds = array_filter(['ip' => $request->ip(), 'account' => $account, 'device' => $device]);
        $loginLockMessage = $this->loginLockedMessage(900);

        $this->securityLimiter->hitOrFail($request, 'login_api_minute', ['ip' => $request->ip()], 10, 60, [60, 300]);
        $this->securityLimiter->hitOrFail($request, 'login_api_hour', $loginIds, 30, 3600, [900, 3600]);
        $this->securityLimiter->ensureNotBlocked($request, 'wrong_password', $wrongPasswordIds, $loginLockMessage);

        $field = filter_var($request->login, FILTER_VALIDATE_EMAIL) ? 'email' : 'username';
        $user  = User::where($field, $request->login)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            $this->securityLimiter->hitOrFail(
                $request,
                'wrong_password',
                $wrongPasswordIds,
                5,
                900,
                [900, 3600, 86400],
                $loginLockMessage,
            );
            $this->securityLimiter->log('failed_login', $request, null, 'Failed login attempt', [
                'account' => $account,
                'has_user' => (bool) $user,
            ]);

            throw ValidationException::withMessages([
                'login' => ['The credentials do not match our records.'],
            ]);
        }

        if ($user->is_banned) {
            return response()->json([
                'success' => false,
                'message' => 'Your account has been suspended. Contact support@teezer.live.',
                'code'    => 'ACCOUNT_BANNED',
            ], 403);
        }

        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'This account has been deactivated.',
                'code'    => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        // Country availability - password already verified, so this IS an
        // existing account; evaluateLoginAccess() applies the configured
        // Existing Users policy rather than a flat block. Checked before any
        // 2FA challenge/token is ever issued.
        $loginCheck = $this->countryAvailability->evaluateLoginAccess($request, true);
        if (!$loginCheck['allowed']) {
            return $this->countryDeniedResponse($loginCheck);
        }

        $hadFailures = RateLimit::where('action_type', 'wrong_password')
            ->where('identifier_type', 'account')
            ->where('identifier', $account)
            ->where(fn ($q) => $q->where('attempt_count', '>', 0)->orWhere('block_level', '>', 0))
            ->exists();
        $this->securityLimiter->reset('wrong_password', $wrongPasswordIds);
        if ($hadFailures) {
            $this->securityLimiter->log('successful_login_after_failures', $request, null, 'Successful login after failed attempts', [
                'account' => $account,
                'user_id' => $user->id,
            ]);
        }

        // ── Two-factor gate ──────────────────────────────────────────
        // The password is correct, but when 2FA is active we issue NO
        // session token here. Instead we return a short-lived challenge
        // that the client exchanges - together with a TOTP or recovery
        // code - at POST /auth/two-factor-challenge.
        //
        // Only the admin panel is challenged. The website and the app take the
        // password alone, by product decision - the panel is where bans,
        // payouts and coin balances live, and it is the surface worth the extra
        // step.
        //
        // That is safe only because the tokens differ. A login that skips this
        // gate is minted WITHOUT AuthTokenService::TWO_FACTOR_ABILITY, and
        // ApiAdminMiddleware rejects such tokens for any account with 2FA on.
        // Otherwise this would be theatre: a stolen password could take the
        // website's unchallenged token straight to the admin API, and the
        // panel's prompt would guard the UI while the API behind it stayed
        // open.
        if (config('auth.admin_two_factor_enforced', true) && $user->hasTwoFactorEnabled() && $this->isAdminClient($request)) {
            $challenge = Str::random(64);
            \Illuminate\Support\Facades\Cache::put(
                '2fa:challenge:' . hash('sha256', $challenge),
                $user->id,
                now()->addMinutes(5),
            );

            return response()->json([
                'success'             => true,
                'two_factor_required' => true,
                'message'             => 'Enter the 6-digit code from your authenticator app.',
                'data'                => ['challenge' => $challenge],
            ]);
        }

        return $this->issueLoginToken($user, $request);
    }

    /* ── Social sign-in (mobile): Google + Apple ─────────────────────────── */

    public function socialGoogle(Request $request): JsonResponse
    {
        if ($resp = $this->ensureProviderEnabled('google')) return $resp;
        // The mobile app sends an id_token (needs only the Client ID allow-list).
        // A `code` is also accepted for the server-side auth-code flow, which is
        // the path that uses the Client Secret.
        $request->validate([
            'id_token'     => ['nullable', 'string'],
            'code'         => ['nullable', 'string'],
            'redirect_uri' => ['nullable', 'string'],
        ]);
        if (!$request->filled('id_token') && !$request->filled('code')) {
            throw ValidationException::withMessages([
                'id_token' => ['A Google ID token or authorization code is required.'],
            ]);
        }
        $verifier = app(\App\Services\SocialAuthVerifier::class);
        $info = $request->filled('id_token')
            ? $verifier->google($request->input('id_token'))
            : $verifier->googleCode($request->input('code'), $request->input('redirect_uri'));
        return $this->completeSocial('google', $info, $request);
    }

    public function socialApple(Request $request): JsonResponse
    {
        if ($resp = $this->ensureProviderEnabled('apple')) return $resp;
        $request->validate([
            'identity_token' => ['required', 'string'],
            'name'           => ['nullable', 'string', 'max:100'],
        ]);
        $info = app(\App\Services\SocialAuthVerifier::class)->apple($request->input('identity_token'));
        // Apple only returns the name on first sign-in, sent separately by the client.
        if ($info && $request->filled('name')) {
            $info['name'] = $request->input('name');
        }
        return $this->completeSocial('apple', $info, $request);
    }

    public function socialFacebook(Request $request): JsonResponse
    {
        if ($resp = $this->ensureProviderEnabled('facebook')) return $resp;
        $request->validate(['access_token' => ['required', 'string']]);
        $info = app(\App\Services\SocialAuthVerifier::class)->facebook($request->input('access_token'));
        return $this->completeSocial('facebook', $info, $request);
    }

    public function socialTiktok(Request $request): JsonResponse
    {
        if ($resp = $this->ensureProviderEnabled('tiktok')) return $resp;
        // Accept an OAuth authorization code (exchanged server-side) or, if the
        // client already holds one, a raw access_token. TikTok returns no email,
        // so completeSocial() resolves the user by the provider subject only.
        $request->validate([
            'code'         => ['nullable', 'string'],
            'access_token' => ['nullable', 'string'],
            'redirect_uri' => ['nullable', 'string'],
        ]);
        if (!$request->filled('code') && !$request->filled('access_token')) {
            throw ValidationException::withMessages([
                'code' => ['A TikTok authorization code or access token is required.'],
            ]);
        }
        $info = app(\App\Services\SocialAuthVerifier::class)->tiktok($request->only(['code', 'access_token', 'redirect_uri']));
        return $this->completeSocial('tiktok', $info, $request);
    }

    /**
     * 422 when a provider has been switched off in Admin › Social Login, so a
     * disabled provider never verifies or creates accounts. Null = enabled.
     */
    private function ensureProviderEnabled(string $provider): ?JsonResponse
    {
        if (\App\Services\SocialLoginConfig::isEnabled($provider)) {
            return null;
        }
        return response()->json([
            'success' => false,
            'message' => ucfirst($provider) . ' sign-in is not enabled.',
            'code'    => 'PROVIDER_DISABLED',
        ], 422);
    }

    /**
     * Find-or-create a user from a verified provider profile, then issue the
     * same Sanctum token the password login path returns.
     *
     * @param array{sub:string,email:?string,name:?string,email_verified:bool}|null $info
     */
    private function completeSocial(string $provider, ?array $info, Request $request): JsonResponse
    {
        $sub = isset($info['sub']) ? (string) $info['sub'] : '';

        // Need at least one durable identifier. Some providers (TikTok) never
        // return an email, so a verified subject alone is enough to proceed.
        if (!$info || (empty($info['email']) && $sub === '')) {
            return response()->json([
                'success' => false,
                'message' => 'Could not verify your ' . ucfirst($provider) . ' sign-in. Please try again.',
            ], 422);
        }

        $email         = strtolower(trim((string) ($info['email'] ?? '')));
        $hasEmail      = $email !== '';
        $emailVerified = $hasEmail && (bool) ($info['email_verified'] ?? false);

        // ── Account resolution (industry-standard order) ──────────────────
        // Resolve exactly one user for this sign-in, without ever creating a
        // duplicate and without merging on an unverified email.
        //
        //   1. By the provider's immutable subject (provider + provider_id).
        //      Authoritative for a returning user - survives an email change
        //      on either side and Apple's Hide-My-Email relay address.
        //   2. By VERIFIED email. Links this provider to the pre-existing
        //      account (password signup or another provider) - same user_id.
        //   3. Neither matched -> create a new user and link the provider.
        //
        // An UNVERIFIED provider email is never used to match an existing
        // account (that would be an account-takeover vector) - see below.
        $user = null;

        if ($sub !== '') {
            $user = \App\Models\SocialAccount::where('provider', $provider)
                ->where('provider_id', $sub)
                ->first()?->user;
        }

        if (!$user && $emailVerified) {
            $user = User::where('email', $email)->first();
        }

        if (!$user) {
            // No provider match. An account already owns this email but the
            // provider did NOT verify it - refuse to merge (never link on an
            // unverified email) rather than hijack or duplicate the address.
            if ($hasEmail && !$emailVerified && User::where('email', $email)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'This email is already registered but ' . ucfirst($provider)
                        . " couldn't confirm it belongs to you. Please sign in with your password, "
                        . 'then link ' . ucfirst($provider) . ' from Settings › Connected Accounts.',
                    'code'    => 'EMAIL_NOT_VERIFIED_BY_PROVIDER',
                ], 422);
            }

            // Global Teezer Control - this branch is where social login
            // CREATES a new account, and no route-level split exists between
            // that and the login branch below (both share /auth/social/*),
            // so the gate has to live here rather than as route middleware.
            // Checked before the country gate for the same reason the country
            // gate is checked before User::create(): this is the signup path.
            if (! $this->globalControls->isEnabledWithEmergencyPair('signup_enabled')
                || ! $this->globalControls->isEnabled('social_signup_enabled')) {
                return $this->globalControlDeniedResponse('signup_enabled');
            }

            // Country availability - checked here (this is the SIGNUP path:
            // no matching account was found above) before User::create()
            // runs, not after - see the file's own "IMPORTANT SOCIAL LOGIN"
            // requirement. The `else` branch below covers the opposite case
            // (an existing account matched - that's a LOGIN, not a signup).
            $signupCheck = $this->countryAvailability->evaluateSignupAccess($request);
            if (!$signupCheck['allowed']) {
                return $this->countryDeniedResponse($signupCheck);
            }

            // users.email is NOT NULL + unique. When a provider gives no email
            // (TikTok), synthesize a stable, non-deliverable placeholder so the
            // account exists; the user can add a real email later in Settings.
            $createEmail   = $hasEmail ? $email : $this->placeholderEmail($provider, $sub);
            $usernameSeed  = $hasEmail ? $email : ((string) ($info['name'] ?? '') ?: $createEmail);

            $user = User::create([
                'name'              => $info['name'] ?: ($hasEmail ? Str::before($email, '@') : ucfirst($provider) . ' User'),
                'username'          => $this->generateUniqueUsername($usernameSeed),
                'email'             => $createEmail,
                'password'          => Hash::make(Str::random(40)), // unusable; provider is the factor
                // is_active is NOT passed: it is a privileged field and the column already
                // defaults to true. Sign-up must not be able to name its own privilege
                // level, even to say "the normal one".
                // Only vouch for the email if the provider actually verified it.
                'email_verified_at' => $emailVerified ? now() : null,
            ]);
            Profile::create(['user_id' => $user->id]);

            // Laravel does not re-read the row after an INSERT, so every column
            // filled by a database DEFAULT is still NULL on this instance -
            // is_active among them, precisely because it is deliberately not
            // passed above. The guard further down negates it, and `!null` is
            // true, so a first-time social signup was told its brand-new
            // account had been deactivated while the row itself was active.
            // Reload so the defaults are actually present on the model.
            $user->refresh();

            // This account has no birthday and a username the line above
            // invented from the provider's email, so the app collects both
            // (plus a real name) before letting it into the feed. Flagged here,
            // in the branch that only runs when social sign-in CREATES a user -
            // a returning social login never reaches this code, and so is never
            // asked again. See User::needsSocialOnboarding().
            $user->markSocialOnboardingPending();
            $user->saveQuietly();

            try {
                $code = $this->countryNameToCode((string) $request->input('country'));
                $this->countries->onSignup($user, $request, $code ?: 'NP');
            } catch (\Throwable $e) {
                report($e);
            }
        } else {
            // An existing account matched (provider sub or verified email) -
            // this is a LOGIN, not a signup, so the Existing Users policy
            // applies rather than a flat block. Checked before the
            // socialAccounts() link-record update below, so a restricted
            // country never touches it.
            if (! $this->globalControls->isEnabled('login_enabled')) {
                return $this->globalControlDeniedResponse('login_enabled');
            }

            $loginCheck = $this->countryAvailability->evaluateLoginAccess($request, true);
            if (!$loginCheck['allowed']) {
                return $this->countryDeniedResponse($loginCheck);
            }
        }

        if ($user->is_banned) {
            return response()->json(['success' => false, 'message' => 'Your account has been suspended. Contact support@teezer.live.', 'code' => 'ACCOUNT_BANNED'], 403);
        }
        if (!$user->is_active) {
            return response()->json(['success' => false, 'message' => 'This account has been deactivated.', 'code' => 'ACCOUNT_INACTIVE'], 403);
        }

        // Remember the linked provider so the user can see & disconnect it in
        // Settings › Connected Accounts. Idempotent per (user, provider).
        $user->socialAccounts()->updateOrCreate(
            ['provider' => $provider],
            [
                'provider_id' => $info['sub'] ?? null,
                'email'       => $email ?: null,
                'name'        => $info['name'] ?? null,
                'linked_at'   => now(),
            ]
        );

        // SECURITY: the provider is only ONE factor. If the account has 2FA
        // enabled it must still clear the second factor - exactly like the
        // password login path - otherwise social sign-in silently bypasses 2FA.
        //
        // Challenged for the admin panel only, matching the password path
        // above. The same reasoning applies and matters more here: without the
        // token marker, "Continue with Google" on the website would be a way to
        // reach the admin API with no second factor at all.
        if (config('auth.admin_two_factor_enforced', true) && $user->hasTwoFactorEnabled() && $this->isAdminClient($request)) {
            $challenge = Str::random(64);
            \Illuminate\Support\Facades\Cache::put(
                '2fa:challenge:' . hash('sha256', $challenge),
                $user->id,
                now()->addMinutes(5),
            );

            return response()->json([
                'success'             => true,
                'two_factor_required' => true,
                'message'             => 'Enter the 6-digit code from your authenticator app.',
                'data'                => ['challenge' => $challenge],
            ]);
        }

        return $this->issueLoginToken($user, $request);
    }

    /**
     * A stable, non-deliverable placeholder address for a provider that returns
     * no email (TikTok). The `.invalid` TLD is reserved by RFC 2606 so it can
     * never collide with a real inbox, and it is derived from the provider
     * subject so a retried first sign-in maps to the same synthetic address.
     */
    private function placeholderEmail(string $provider, string $sub): string
    {
        $hash = substr(hash('sha256', $provider . '|' . $sub), 0, 32);
        return "{$provider}_{$hash}@social.teezer.invalid";
    }

    private function generateUniqueUsername(string $email): string
    {
        $base = preg_replace('/[^a-z0-9_\.]/', '', strtolower(Str::before($email, '@'))) ?: 'user';
        $base = substr($base, 0, 20);
        $candidate = $base;
        $i = 0;
        while (User::where('username', $candidate)->exists()) {
            $candidate = $base . (++$i);
            if ($i > 9999) { $candidate = $base . Str::lower(Str::random(6)); break; }
        }
        return $candidate;
    }

    private function isMobileClient(Request $request): bool
    {
        return strtolower((string) $request->header('X-Client')) === 'teezer-mobile';
    }

    /**
     * Whether this sign-in came from the admin panel, which is the only client
     * that challenges for 2FA.
     *
     * A UX switch, deliberately NOT a security boundary - a header is trivially
     * forged, and nothing here is load-bearing if it is. Sending this header
     * only asks to be challenged, which cannot help an attacker; omitting it
     * yields a token WITHOUT AuthTokenService::TWO_FACTOR_ABILITY, and
     * ApiAdminMiddleware refuses those on a 2FA-enabled account. So the worst a
     * forged header achieves is a login that is harder than it needed to be.
     *
     * The guarantee lives on the token, not here.
     */
    private function isAdminClient(Request $request): bool
    {
        return strtolower((string) $request->header('X-Client')) === 'teezer-admin';
    }

    /**
     * Finalize a successful authentication: prune old tokens, mint a fresh
     * Sanctum token, stamp activity, and record country detection. Shared by
     * the direct login path and the post-2FA challenge path.
     *
     * The actual minting is AuthTokenService::mint() - extracted so
     * QrLoginController's confirm() (the phone approving a website login)
     * produces this exact same payload instead of a second, drifting copy
     * of this security-relevant logic. Everything below this line is
     * unchanged: same response shape, same cookies.
     */
    private function issueLoginToken(User $user, Request $request, bool $twoFactorVerified = false): JsonResponse
    {
        $minted    = $this->tokens->mint($user, $request, $twoFactorVerified);
        $token     = $minted['token'];
        $expiresAt = $minted['expires_at'];

        return response()->json([
            'success' => true,
            'message' => 'Login successful.',
            'data'    => [
                'token'      => $token,
                'token_type' => $minted['token_type'],
                'expires_at' => $expiresAt->toIso8601String(),
                'user'       => $minted['user'],
            ],
        ])->withCookie(app(SsoSessionService::class)->start($user, $request))
          ->withCookie($this->adminSessionCookie($token, $expiresAt));
    }

    /**
     * The SAME Sanctum token issued above, also carried as an httpOnly,
     * Secure, SameSite=Lax cookie - never read by anything client-side.
     *
     * Only the Teezer Admin Panel (backend.teezer.live) actually
     * relies on this: it used to store the plaintext bearer token in
     * localStorage and manually attach it as an Authorization header, which
     * meant a single XSS bug anywhere in that app could hand over full admin
     * access with nothing to stop it. Every other client (mobile, the main
     * website) keeps using the `token` field in the JSON body exactly as
     * before - mobile already stores it in the platform Keychain/Keystore via
     * expo-secure-store, not a cookie, so this is inert weight for them, not
     * a behavior change. See CookieToBearerHeader middleware for the other
     * half: how a request carrying only this cookie (no Authorization header)
     * still authenticates against the unchanged Sanctum guard.
     *
     * Domain reuses SSO_COOKIE_DOMAIN (already `.teezer.live` in production,
     * which is what makes the cookie visible to the admin subdomain when it's
     * set from this API's own subdomain) rather than introducing a second env
     * var for the same fact. SameSite=Lax - not a separate CSRF token scheme -
     * is the chosen CSRF defense: this is a JSON API consumed by fetch/axios,
     * not HTML forms, so the only thing that matters is that the cookie is
     * withheld from cross-site POST/PUT/PATCH/DELETE, which Lax already
     * guarantees.
     */
    private function adminSessionCookie(string $token, \Illuminate\Support\Carbon $expiresAt): Cookie
    {
        return Cookie::create(
            name: self::ADMIN_SESSION_COOKIE,
            value: $token,
            expire: $expiresAt->getTimestamp(),
            path: '/',
            domain: config('sso.cookie_domain') ?: null,
            secure: (bool) config('sso.cookie_secure', true),
            httpOnly: true,
            raw: false,
            sameSite: Cookie::SAMESITE_LAX,
        );
    }

    private function forgetAdminSessionCookie(): Cookie
    {
        return Cookie::create(
            name: self::ADMIN_SESSION_COOKIE,
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

    /**
     * Step 2 of a 2FA login: exchange the challenge + a TOTP code (or a
     * single-use recovery code) for a real session token.
     */
    public function twoFactorChallenge(Request $request): JsonResponse
    {
        $request->validate([
            'challenge'     => ['required', 'string'],
            'code'          => ['nullable', 'string'],
            'recovery_code' => ['nullable', 'string'],
        ]);

        if (! $request->filled('code') && ! $request->filled('recovery_code')) {
            throw ValidationException::withMessages([
                'code' => ['Enter your authentication code.'],
            ]);
        }

        $cacheKey = '2fa:challenge:' . hash('sha256', (string) $request->input('challenge'));
        $userId   = \Illuminate\Support\Facades\Cache::get($cacheKey);
        if (! $userId) {
            throw ValidationException::withMessages([
                'challenge' => ['This sign-in attempt expired. Please log in again.'],
            ]);
        }

        // Throttle attempts per challenge so the 6 digits can't be brute-forced.
        $attemptsKey = $cacheKey . ':attempts';
        $attempts    = (int) \Illuminate\Support\Facades\Cache::get($attemptsKey, 0);
        if ($attempts >= 5) {
            \Illuminate\Support\Facades\Cache::forget($cacheKey);
            throw ValidationException::withMessages([
                'code' => ['Too many incorrect codes. Please log in again.'],
            ]);
        }

        $user = User::find($userId);
        if (! $user || ! $user->hasTwoFactorEnabled()) {
            \Illuminate\Support\Facades\Cache::forget($cacheKey);
            throw ValidationException::withMessages([
                'challenge' => ['This sign-in attempt is no longer valid. Please log in again.'],
            ]);
        }

        $twoFactor = app(\App\Services\TwoFactorService::class);
        $verified  = false;

        if ($request->filled('code')) {
            // decryptString() throws (DecryptException) if two_factor_secret
            // was ever encrypted under a different APP_KEY than the one this
            // request is running with - unlike consumeRecoveryCode() just
            // below, which already catches exactly this. Left unguarded,
            // that throw skipped straight past the "code is incorrect"
            // response into a raw 500, indistinguishable from any other
            // unhandled server error and giving no signal that a genuinely
            // correct code could never have succeeded. Treated the same as
            // any other failed verification (rejected, attempt counted) so
            // the admin gets the normal "code is incorrect" flow instead of
            // a 500 - but logged separately, since unlike an ordinary wrong
            // code this indicates the stored secret is now unrecoverable and
            // the account needs 2FA reset, not another attempt.
            try {
                $secret   = \Illuminate\Support\Facades\Crypt::decryptString($user->two_factor_secret);
                $verified = $twoFactor->verify($secret, (string) $request->input('code'));
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('2fa.secret_undecryptable', [
                    'user_id' => $user->id,
                    'error'   => $e->getMessage(),
                ]);
                $verified = false;
            }
        } elseif ($request->filled('recovery_code')) {
            $verified = $this->consumeRecoveryCode($user, (string) $request->input('recovery_code'));
        }

        if (! $verified) {
            \Illuminate\Support\Facades\Cache::put($attemptsKey, $attempts + 1, now()->addMinutes(5));
            $this->securityLimiter->log('failed_2fa', $request, $user->id, 'Failed 2FA code', []);
            throw ValidationException::withMessages([
                'code' => ['The code is incorrect or has expired.'],
            ]);
        }

        \Illuminate\Support\Facades\Cache::forget($cacheKey);
        \Illuminate\Support\Facades\Cache::forget($attemptsKey);

        // The one path that produces a 2FA-verified session. ApiAdminMiddleware
        // requires that marker on the token for an account with 2FA enabled, so
        // reaching the admin API means clearing a challenge here - a token
        // obtained anywhere else cannot substitute for one.
        return $this->issueLoginToken($user, $request, true);
    }

    /**
     * Check a recovery code against the user's stored codes; on a match,
     * remove it (single use) and persist. Returns true on success.
     */
    private function consumeRecoveryCode(User $user, string $input): bool
    {
        $input = strtoupper(trim($input));
        try {
            $codes = json_decode(
                \Illuminate\Support\Facades\Crypt::decryptString($user->two_factor_recovery_codes ?? ''),
                true,
            ) ?: [];
        } catch (\Throwable) {
            return false;
        }

        $remaining = array_values(array_filter($codes, fn ($c) => ! hash_equals(strtoupper((string) $c), $input)));
        if (count($remaining) === count($codes)) {
            return false; // no match
        }

        $user->two_factor_recovery_codes = \Illuminate\Support\Facades\Crypt::encryptString(json_encode($remaining));
        $user->saveQuietly();
        return true;
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->userResource($request->user()->load('profile')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        try {
            $request->user()->currentAccessToken()->delete();
        } catch (\Throwable) {
            // Token may already be deleted - not an error
        }

        // Tear down the shared SSO session (if the cookie was sent) so this device
        // can't silently re-auth on other subdomains, and clear the cookie.
        $sso = app(SsoSessionService::class);
        if ($session = $sso->resolve($request)) {
            $sso->revoke($session);
        }

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully.',
        ])->withCookie($sso->forgetCookie())
          ->withCookie($this->forgetAdminSessionCookie());
    }

    public function logoutAll(Request $request): JsonResponse
    {
        $request->user()->tokens()->delete();

        // "Sign out everywhere": revoke every SSO session for the user + clear cookie.
        $sso = app(SsoSessionService::class);
        $sso->revokeAllForUser($request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'All sessions have been revoked.',
        ])->withCookie($sso->forgetCookie())
          ->withCookie($this->forgetAdminSessionCookie());
    }

    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => $request->password, 'password_changed_at' => now()]);
        $user->tokens()->delete(); // Revoke all sessions for security

        return response()->json([
            'success' => true,
            'message' => 'Password changed successfully. Please log in again.',
        ]);
    }

    public function verifyEmail(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'User not found.'], 404);
        }

        if ($user->email_verified_at) {
            return response()->json(['success' => true, 'message' => 'Email already verified.']);
        }

        $record = DB::table('email_verification_tokens')
            ->where('email', $user->email)
            ->where('expires_at', '>', now())
            ->first();

        if (!$record || !hash_equals($record->token_hash, hash('sha256', $request->token))) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or expired verification token.',
            ], 422);
        }

        $user->update(['email_verified_at' => now()]);
        DB::table('email_verification_tokens')->where('email', $user->email)->delete();

        return response()->json(['success' => true, 'message' => 'Email verified successfully.']);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $user = $request->user();

        $otpIds = array_filter([
            'ip' => $request->ip(),
            'account' => $this->securityLimiter->normalizeAccount($user->email),
            'device' => $this->securityLimiter->device($request),
        ]);
        $otpMessage = 'Too many verification code requests. Please try again later.';
        $this->securityLimiter->hitOrFail($request, 'otp_10m', $otpIds, 3, 600, [600, 3600], $otpMessage);
        $this->securityLimiter->hitOrFail($request, 'otp_hour', $otpIds, 5, 3600, [3600, 86400], $otpMessage);
        $this->securityLimiter->hitOrFail($request, 'otp_day', $otpIds, 10, 86400, [86400], $otpMessage);

        if ($user->email_verified_at) {
            return response()->json(['success' => true, 'message' => 'Email is already verified.']);
        }

        $plain = Str::random(64);
        DB::table('email_verification_tokens')->where('email', $user->email)->delete();
        DB::table('email_verification_tokens')->insert([
            'email'       => $user->email,
            'token_hash'  => hash('sha256', $plain),
            'expires_at'  => now()->addHours(24),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        // Phase 5: queue email with $plain token
        return response()->json([
            'success' => true,
            'message' => 'Verification email sent.',
        ]);
    }

    /* ── Signup OTP / Draft flow ─────────────────────────────────────────── */

    /** Public username availability check (no auth required, used during signup). */
    public function checkUsernamePublic(Request $request): JsonResponse
    {
        $request->validate(['username' => ['required', 'string', 'max:50']]);

        $username = strtolower(trim((string) $request->input('username')));

        if (!preg_match('/^[a-zA-Z0-9_\.]+$/', $username)) {
            return response()->json([
                'available' => false,
                'message'   => 'Username can only contain letters, numbers, underscore, and dot.',
            ]);
        }

        if (strlen($username) < 3) {
            return response()->json(['available' => false, 'message' => 'Username must be at least 3 characters.']);
        }

        if (strlen($username) > 30) {
            return response()->json(['available' => false, 'message' => 'Username cannot exceed 30 characters.']);
        }

        $taken = User::whereRaw('LOWER(username) = ?', [$username])->exists();

        return response()->json([
            'available' => !$taken,
            'message'   => $taken ? 'Username already taken.' : 'Username available.',
        ]);
    }

    /** Send a 6-digit OTP to the given email and persist a signup draft. */
    public function sendSignupOtp(Request $request): JsonResponse
    {
        $otpMsg = 'Too many OTP requests. Please try again later.';

        // Coarse IP/device flood guard - high limits because Cloudflare proxies share IPs
        $ipIds = array_filter([
            'ip'     => $request->ip(),
            'device' => $this->securityLimiter->device($request),
        ]);
        $this->securityLimiter->hitOrFail($request, 'signup_otp_10m',  $ipIds, 30,  600,   [600],   $otpMsg);
        $this->securityLimiter->hitOrFail($request, 'signup_otp_day',  $ipIds, 200, 86400, [86400], $otpMsg);

        $request->validate([
            'email'         => ['required', 'email', 'max:191', new NotDisposableEmail],
            'name'          => ['nullable', 'string', 'max:100'],
            'username'      => ['nullable', 'string', 'max:50', new CleanUsername],
            'date_of_birth' => ['nullable', 'date'],
            'country'       => ['nullable', 'string', 'max:100'],
            'country_code'  => ['nullable', 'string', 'size:2'],
        ]);

        // Per-email rate limit - primary protection (each address has its own bucket)
        $max10m  = (int) AppSetting::get('otp_max_per_10min', 5);
        $maxHour = (int) AppSetting::get('otp_max_per_hour',  10);
        $maxDay  = (int) AppSetting::get('otp_max_per_day',   20);
        $emailId = ['email' => $this->securityLimiter->normalizeAccount($request->email)];
        $this->securityLimiter->hitOrFail($request, 'signup_otp_10m',  $emailId, $max10m,  600,   [600,  3600],  $otpMsg);
        $this->securityLimiter->hitOrFail($request, 'signup_otp_hour', $emailId, $maxHour, 3600,  [3600, 86400], $otpMsg);
        $this->securityLimiter->hitOrFail($request, 'signup_otp_day',  $emailId, $maxDay,  86400, [86400],       $otpMsg);

        if (User::where('email', $request->email)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'This email address is already registered. Please log in.',
                'code'    => 'EMAIL_TAKEN',
            ], 422);
        }

        $otp        = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $draftToken = Str::random(64);
        $linkToken  = Str::random(64);

        // Replace any previous draft for this email
        DB::table('signup_drafts')->where('email', $request->email)->delete();
        DB::table('signup_drafts')->insert([
            'draft_token'      => $draftToken,
            'email'            => $request->email,
            'name'             => $request->name,
            'username'         => $request->username ? strtolower(trim($request->username)) : null,
            'date_of_birth'    => $request->date_of_birth,
            'country'          => $request->country,
            'country_code'     => $request->country_code,
            'otp_hash'         => hash('sha256', $otp),
            'link_token_hash'  => hash('sha256', $linkToken),
            'email_verified'   => false,
            'expires_at'       => now()->addMinutes((int) AppSetting::get('otp_expiry_minutes', 30)),
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        try {
            $firstName = $request->name ? explode(' ', trim($request->name))[0] : 'there';
            Mail::to($request->email)->send(new \App\Mail\SignupOtpMail($otp, $linkToken, $firstName));
        } catch (\Throwable $e) {
            report($e);
            // Email failure is non-fatal - user can still use OTP boxes
        }

        return response()->json([
            'success'     => true,
            'draft_token' => $draftToken,
            'message'     => 'Verification code sent to your email.',
        ]);
    }

    /** Verify the 6-digit OTP submitted by the user from the signup form. */
    public function verifySignupOtp(Request $request): JsonResponse
    {
        $request->validate([
            'email'       => ['required', 'email'],
            'otp'         => ['required', 'string', 'size:6'],
            'draft_token' => ['nullable', 'string'],
        ]);

        $query = DB::table('signup_drafts')
            ->where('email', $request->email)
            ->where('expires_at', '>', now());

        if ($request->draft_token) {
            $query->where('draft_token', $request->draft_token);
        }

        $draft = $query->first();

        if (!$draft) {
            return response()->json([
                'success' => false,
                'message' => 'OTP has expired. Please click Send OTP again.',
            ], 422);
        }

        // SECURITY: cap wrong guesses per draft so the 6-digit (1M) space can't
        // be brute-forced (the per-IP route throttle alone is bypassable with
        // rotated IPs). After 5 wrong tries the draft is burned - the user must
        // request a fresh code (sent only to the address they're proving).
        $attemptsKey = 'signup:otp:attempts:' . $draft->id;
        if ((int) \Illuminate\Support\Facades\Cache::get($attemptsKey, 0) >= 5) {
            DB::table('signup_drafts')->where('id', $draft->id)->delete();
            \Illuminate\Support\Facades\Cache::forget($attemptsKey);
            return response()->json([
                'success' => false,
                'message' => 'Too many incorrect attempts. Please request a new code.',
            ], 429);
        }

        if (!hash_equals((string) $draft->otp_hash, hash('sha256', $request->otp))) {
            \Illuminate\Support\Facades\Cache::put($attemptsKey, (int) \Illuminate\Support\Facades\Cache::get($attemptsKey, 0) + 1, now()->addMinutes(30));
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code. Please try again.',
            ], 422);
        }

        \Illuminate\Support\Facades\Cache::forget($attemptsKey);

        DB::table('signup_drafts')->where('id', $draft->id)->update([
            'email_verified'    => true,
            'email_verified_at' => now(),
            'updated_at'        => now(),
        ]);

        return response()->json([
            'success'     => true,
            'verified'    => true,
            'draft_token' => $draft->draft_token,
            'message'     => 'Email verified successfully.',
        ]);
    }

    /** Verify email via the one-click link sent in the OTP email. */
    public function verifyEmailLink(Request $request): JsonResponse
    {
        $request->validate(['token' => ['required', 'string']]);

        $hash  = hash('sha256', $request->token);
        $draft = DB::table('signup_drafts')
            ->where('link_token_hash', $hash)
            ->where('expires_at', '>', now())
            ->first();

        if (!$draft) {
            // Check if this token existed but expired - user may have already completed signup
            $expiredDraft = DB::table('signup_drafts')->where('link_token_hash', $hash)->first();
            if ($expiredDraft) {
                $registered = User::where('email', $expiredDraft->email)->first();
                if ($registered) {
                    return response()->json([
                        'success' => true,
                        'flow'    => 'already_verified',
                        'email'   => $expiredDraft->email,
                        'message' => 'Your email is already verified. Please log in.',
                    ]);
                }
            }
            return response()->json([
                'success' => false,
                'message' => 'Verification link is invalid or has expired. Please request a new code.',
            ], 422);
        }

        DB::table('signup_drafts')->where('id', $draft->id)->update([
            'email_verified'    => true,
            'email_verified_at' => now(),
            'updated_at'        => now(),
        ]);

        // If account already exists (rare edge case), direct to login
        $user = User::where('email', $draft->email)->first();
        if ($user) {
            if (!$user->email_verified_at) {
                $user->update(['email_verified_at' => now()]);
            }
            return response()->json([
                'success' => true,
                'flow'    => 'login',
                'email'   => $draft->email,
                'message' => 'Email verified. You can now log in.',
            ]);
        }

        return response()->json([
            'success'     => true,
            'flow'        => 'signup',
            'draft_token' => $draft->draft_token,
            'email'       => $draft->email,
            'message'     => 'Email verified. Continue to complete your signup.',
        ]);
    }

    /** Return public (non-sensitive) fields from a signup draft so the
     *  frontend can restore the form after the user returns via email link. */
    public function getSignupDraft(Request $request, string $token): JsonResponse
    {
        $draft = DB::table('signup_drafts')
            ->where('draft_token', $token)
            ->where('expires_at', '>', now())
            ->first();

        if (!$draft) {
            return response()->json(['success' => false, 'message' => 'Draft not found or expired.'], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'email'          => $draft->email,
                'name'           => $draft->name,
                'username'       => $draft->username,
                'date_of_birth'  => $draft->date_of_birth,
                'country'        => $draft->country,
                'country_code'   => $draft->country_code,
                'email_verified' => (bool) $draft->email_verified,
            ],
        ]);
    }

    /**
     * Reverse-lookup a free-text country name (used by the legacy signup
     * payload) to its ISO 3166-1 alpha-2 code. Returns null if no match.
     */
    private function countryNameToCode(string $name): ?string
    {
        $name = trim($name);
        if ($name === '') return null;
        foreach (IsoCountries::map() as $code => $label) {
            if (strcasecmp($label, $name) === 0) return $code;
        }
        return null;
    }

    private function tokenExpiresAt(): \Illuminate\Support\Carbon
    {
        $minutes = (int) config('sanctum.expiration', 60 * 24 * 30);

        return now()->addMinutes($minutes > 0 ? $minutes : 60 * 24 * 30);
    }

    private function loginLockedMessage(int $seconds): string
    {
        $minutes = max(1, (int) ceil($seconds / 60));

        return "Too many attempts\nFor your account safety, login has been temporarily locked.\nPlease try again in {$minutes} minutes.";
    }

    private function userResource(User $user): array
    {
        return \App\Support\AuthUserResource::make($user);
    }

    private function describeSession(\Illuminate\Http\Request $request): string
    {
        $ua = $request->userAgent() ?? '';
        $ip = $request->ip() ?? '';

        // Detect browser
        $browser = 'Unknown Browser';
        if (str_contains($ua, 'Edg/'))           $browser = 'Edge';
        elseif (str_contains($ua, 'OPR/'))       $browser = 'Opera';
        elseif (str_contains($ua, 'Chrome/'))    $browser = 'Chrome';
        elseif (str_contains($ua, 'Firefox/'))   $browser = 'Firefox';
        elseif (str_contains($ua, 'Safari/'))    $browser = 'Safari';

        // Detect platform
        $platform = 'Unknown Device';
        if (str_contains($ua, 'iPhone'))         $platform = 'iPhone';
        elseif (str_contains($ua, 'iPad'))       $platform = 'iPad';
        elseif (str_contains($ua, 'Android'))    $platform = 'Android';
        elseif (str_contains($ua, 'Windows'))    $platform = 'Windows';
        elseif (str_contains($ua, 'Macintosh'))  $platform = 'Mac';
        elseif (str_contains($ua, 'Linux'))      $platform = 'Linux';

        // Device type
        $mobile = str_contains($ua, 'Mobile') || str_contains($ua, 'Android') || str_contains($ua, 'iPhone') || str_contains($ua, 'iPad');
        $type   = $mobile ? 'mobile' : 'desktop';

        return json_encode([
            'label'    => "{$browser} on {$platform}",
            'browser'  => $browser,
            'platform' => $platform,
            'type'     => $type,
            'ip'       => $ip,
        ], JSON_UNESCAPED_SLASHES);
    }
}
