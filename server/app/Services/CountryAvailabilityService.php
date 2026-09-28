<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\CountryAvailability;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * The ONE authoritative policy engine for country-based signup/login access
 * control - every enforcement point (ApiAuthController::register/login/
 * completeSocial, Web\AuthController::register) calls this instead of
 * re-implementing the rule set.
 *
 * Deliberately separate from CountryService (the 60-day country-lock +
 * continuous-verification system for currency/content-region integrity) and
 * CountryCurrencyMap (pricing) - this class is only ever about whether an
 * account may be created or signed into FROM a given country, nothing else.
 * It shares IpCountryService/IsoCountries with those (detection + the
 * dataset), never their tables.
 *
 * Detected country (server-side, IP-based, via IpCountryService) is the ONLY
 * input to every decision below - a client-sent country/country_code is
 * never consulted here, which is what makes a dropdown change or a crafted
 * request body unable to bypass anything.
 */
class CountryAvailabilityService
{
    public const POLICY_ALLOW_EXISTING              = 'allow_existing';
    public const POLICY_RESTRICT_EXISTING            = 'restrict_existing';
    public const POLICY_ALLOW_LOGIN_DISABLE_SIGNUP   = 'allow_login_disable_signup';
    public const POLICY_REQUIRE_ADMIN_REVIEW         = 'require_admin_review';

    public const DEFAULT_MESSAGE = 'Teezer is currently unavailable in your country.';
    public const UNDETERMINED_MESSAGE = 'Unable to verify your country right now. Please try again later.';

    public function __construct(private IpCountryService $ips) {}

    /* ── Global settings (AppSetting-backed, group "country_availability") ── */

    public function restrictionsEnabled(): bool
    {
        return (bool) AppSetting::get('country_restrictions_enabled', false);
    }

    public function globalSignupEnabled(): bool
    {
        return (bool) AppSetting::get('global_signup_enabled', true);
    }

    public function globalLoginEnabled(): bool
    {
        return (bool) AppSetting::get('global_login_enabled', true);
    }

    public function existingUserPolicy(): string
    {
        return (string) AppSetting::get('country_existing_user_policy', self::POLICY_ALLOW_EXISTING);
    }

    public function restrictionMessage(): string
    {
        return (string) AppSetting::get('country_restriction_message', self::DEFAULT_MESSAGE);
    }

    public function detectionMode(): string
    {
        // Only one detection mechanism exists (IpCountryService's
        // CF-header -> MMDB -> default cascade), so this is informational
        // rather than a real switch - kept as a setting for the admin page
        // per the spec, and so a future second provider has somewhere to
        // plug in without a schema change.
        return (string) AppSetting::get('country_detection_mode', 'ip_cloudflare');
    }

    /**
     * Whether a restricted country should still appear in the signup
     * dropdown (greyed out, with a reason) or be left out of the list
     * entirely. UX only, like every setting in this block - CountrySelect/
     * CountryPickerModal read this indirectly, via what /countries/
     * availability includes; the backend's own allow/deny decision at
     * submit time never consults it.
     */
    public function showRestrictedCountries(): bool
    {
        return (bool) AppSetting::get('show_restricted_countries', true);
    }

    /**
     * Whether the signup country picker may be changed away from the
     * detected country at all. UX only - even with this off, the backend
     * still evaluates against the DETECTED country, never the selected one
     * (see evaluateSignupAccess()'s own docblock), so this never becomes a
     * security boundary by omission.
     */
    public function allowManualCountryChange(): bool
    {
        return (bool) AppSetting::get('allow_manual_country_change', true);
    }

    public function policyVersion(): int
    {
        return (int) AppSetting::get('country_policy_version', 1);
    }

    /**
     * 'deny' (default) or 'allow'. Governs ONLY the specific case of a new
     * signup where detection could not be established at all (CF header,
     * MMDB, AND countries.dev - if enabled - all failed to produce a
     * country; see IpCountryService's 'reliable' flag). An admin-toggleable
     * emergency escape hatch back to today's behavior ('allow'), matching
     * every other setting in this class - never touches login/existing-user
     * behavior, which this system deliberately never fails closed on.
     */
    public function undeterminedSignupPolicy(): string
    {
        return (string) AppSetting::get('country_undetermined_signup_policy', 'deny');
    }

    /** Called by the admin controller after ANY write (global or per-country). */
    public function bumpPolicyVersion(): void
    {
        AppSetting::set('country_policy_version', $this->policyVersion() + 1, 'integer');
    }

    /**
     * Must be called by the admin controller after any write to a specific
     * country's row (single update or bulk) - getCountryPolicy() below caches
     * that row for 5 minutes keyed only by country code (not policyVersion,
     * unlike /countries/availability's list cache), so without this an admin
     * toggling a country stays invisible to real signup/login attempts for
     * up to 5 minutes after Save.
     */
    public function forgetCountryPolicy(string $code): void
    {
        Cache::forget('country_avail:' . strtoupper($code));
    }

    /* ── Detection ── */

    public function detectUserCountry(Request $request): array
    {
        return $this->ips->lookup($request);
    }

    /**
     * Cached 5 minutes per code - country policy changes rarely and this is
     * on the signup/login hot path. Never throws; returns null on any
     * failure (missing row or DB error) so callers apply the documented
     * fail-safe rather than crashing the request.
     */
    public function getCountryPolicy(string $code): ?CountryAvailability
    {
        $code = strtoupper($code);
        try {
            return Cache::remember("country_avail:{$code}", 300, function () use ($code) {
                return CountryAvailability::where('country_code', $code)->first();
            });
        } catch (\Throwable $e) {
            Log::error('CountryAvailabilityService: policy lookup failed', [
                'code' => $code, 'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /* ── Decisions, by already-known code (reused by /detect-country so it
         doesn't detect the same request's IP twice) ── */

    /**
     * $detectionReliable is IpCountryService's 'reliable' flag - false only
     * when CF header, MMDB, AND countries.dev (if enabled) ALL failed to
     * produce a country, i.e. the hardcoded NP default is all that's left.
     * Defaults to true so any caller not yet passing it keeps today's exact
     * behavior (evaluating the default country's policy like any other).
     *
     * @return array{allowed:bool, country:string, action:string, reason:?string}
     */
    public function signupAllowedForCode(string $code, bool $detectionReliable = true): array
    {
        $code = strtoupper($code);

        if (!$this->globalSignupEnabled()) {
            return $this->deny($code, 'SIGNUP', $this->restrictionMessage());
        }
        if (!$this->restrictionsEnabled()) {
            return $this->allow($code, 'SIGNUP');
        }

        // Restrictions are ON and we genuinely could not determine a real
        // country for this NEW signup - never silently evaluate the
        // hardcoded default's policy as if it were a confident answer.
        // Existing-user login is deliberately never subject to this (see
        // loginAllowedForCode/evaluateLoginAccess - unchanged).
        if (!$detectionReliable && $this->undeterminedSignupPolicy() === 'deny') {
            Log::info('CountryAvailabilityService: signup denied (country undetermined)', ['code' => $code]);
            return $this->deny($code, 'SIGNUP', self::UNDETERMINED_MESSAGE);
        }

        $policy = $this->getCountryPolicy($code);
        if ($policy === null) {
            // Restrictions are ON but the policy couldn't be determined -
            // fail CLOSED for signup (spec-mandated: never accidentally
            // expose unrestricted signup access because of a DB hiccup).
            Log::warning('CountryAvailabilityService: signup fail-closed (policy unavailable)', ['code' => $code]);
            return $this->deny($code, 'SIGNUP', $this->restrictionMessage());
        }
        if (!$policy->signup_enabled) {
            return $this->deny($code, 'SIGNUP', $policy->restriction_reason ?: $this->restrictionMessage());
        }
        return $this->allow($code, 'SIGNUP');
    }

    /**
     * $isExistingUser is always true in practice (there is no "login" for an
     * account that doesn't exist yet) - kept explicit rather than assumed so
     * this stays correct if a future caller ever legitimately differs.
     *
     * @return array{allowed:bool, country:string, action:string, reason:?string}
     */
    public function loginAllowedForCode(string $code, bool $isExistingUser): array
    {
        $code = strtoupper($code);

        if (!$this->globalLoginEnabled()) {
            return $this->deny($code, 'LOGIN', $this->restrictionMessage());
        }
        if (!$this->restrictionsEnabled()) {
            return $this->allow($code, 'LOGIN');
        }

        $policy = $this->getCountryPolicy($code);
        if ($policy === null) {
            // Fail OPEN here, unlike signup: this is an already password-
            // verified existing account, and a transient DB hiccup must
            // never lock real users out of accounts they already have.
            Log::warning('CountryAvailabilityService: login fail-open (policy unavailable, existing user)', ['code' => $code]);
            return $this->allow($code, 'LOGIN');
        }
        if ($policy->login_enabled) {
            return $this->allow($code, 'LOGIN');
        }

        // login_enabled is false for this country - the Existing Users
        // policy decides whether an existing account still gets through.
        // A brand-new signup attempt (not applicable to login at all, but
        // defensive) is always denied outright here.
        if ($isExistingUser) {
            $bypasses = [self::POLICY_ALLOW_EXISTING, self::POLICY_ALLOW_LOGIN_DISABLE_SIGNUP];
            if (in_array($this->existingUserPolicy(), $bypasses, true)) {
                return $this->allow($code, 'LOGIN');
            }
        }
        return $this->deny($code, 'LOGIN', $policy->restriction_reason ?: $this->restrictionMessage());
    }

    /* ── Decisions, by request (detects, then delegates to the code-based
         methods above) ── */

    public function evaluateSignupAccess(Request $request): array
    {
        $detected = $this->detectUserCountry($request);
        return $this->signupAllowedForCode(
            (string) ($detected['countryCode'] ?? ''),
            (bool) ($detected['reliable'] ?? true),
        );
    }

    public function evaluateLoginAccess(Request $request, bool $isExistingUser = true): array
    {
        $detected = $this->detectUserCountry($request);
        return $this->loginAllowedForCode((string) ($detected['countryCode'] ?? ''), $isExistingUser);
    }

    private function allow(string $code, string $action): array
    {
        return ['allowed' => true, 'country' => $code, 'action' => $action, 'reason' => null];
    }

    private function deny(string $code, string $action, string $reason): array
    {
        return ['allowed' => false, 'country' => $code, 'action' => $action, 'reason' => $reason];
    }
}
