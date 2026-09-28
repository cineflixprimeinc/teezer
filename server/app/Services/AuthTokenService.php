<?php

namespace App\Services;

use App\Models\User;
use App\Support\AuthUserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Mints the Sanctum token + response payload every successful authentication
 * hands back - extracted out of ApiAuthController::issueLoginToken() so
 * QrLoginController's confirm() (the phone approving a website login) can
 * produce the EXACT same thing a password/2FA login does, instead of a
 * second, drifting copy of security-relevant logic (token pruning, activity
 * stamps, new-country-login auditing). ApiAuthController::issueLoginToken()
 * now calls mint() too - same behaviour, same response shape, nothing about
 * a normal login changed.
 */
class AuthTokenService
{
    /**
     * Marks a token whose session cleared a TOTP/recovery-code challenge.
     *
     * Carried on the token rather than inferred from the user, because
     * $user->hasTwoFactorEnabled() only says the ACCOUNT has 2FA configured -
     * it is true for every session that account owns, including ones that were
     * never challenged. Anything that must know "did this particular sign-in
     * pass 2FA" has to read the token.
     */
    public const TWO_FACTOR_ABILITY = '2fa';

    public function __construct(
        private ?CountryService $countries = null,
        private ?SecurityRateLimiter $securityLimiter = null,
    ) {
        $this->countries ??= app(CountryService::class);
        $this->securityLimiter ??= app(SecurityRateLimiter::class);
    }

    /**
     * Prune to the 9 most-recent tokens, mint a fresh one, stamp activity,
     * and record country detection (never blocks on failure). Returns the
     * {token, token_type, expires_at, user} shape every login-success
     * response already uses.
     */
    public function mint(User $user, Request $request, bool $twoFactorVerified = false): array
    {
        $keepIds = $user->tokens()->orderByDesc('created_at')->take(9)->pluck('id');
        if ($keepIds->isNotEmpty()) {
            $user->tokens()->whereNotIn('id', $keepIds)->delete();
        }

        $expiresAt = $this->tokenExpiresAt();
        $tokenName = $this->describeSession($request);
        // '*' stays, so nothing that already relies on a full-access token
        // changes. The extra marker records that THIS session actually cleared
        // a TOTP challenge, which '*' alone cannot express.
        //
        // Read it with in_array(), never tokenCan(): Sanctum answers true to
        // tokenCan() for any ability when a token holds '*', so tokenCan('2fa')
        // would be true for every token ever minted and the check would pass
        // for exactly the sessions it exists to stop. See
        // ApiAdminMiddleware::TWO_FACTOR_ABILITY.
        $abilities = $twoFactorVerified ? ['*', self::TWO_FACTOR_ABILITY] : ['*'];
        $token     = $user->createToken($tokenName, $abilities, $expiresAt)->plainTextToken;

        $user->timestamps = false;
        $user->updateQuietly([
            'last_login_at'  => now(),
            'last_active_at' => now(),
        ]);
        $user->timestamps = true;

        try {
            $detection = $this->countries->recordDetection($user, $request, 'login');

            if (! empty($detection['newCountryLogin'])) {
                $this->securityLimiter->log('new_country_login', $request, null, 'Login from a new country', [
                    'user_id' => $user->id,
                    'from'    => $detection['previousCountryCode'] ?? null,
                    'to'      => $detection['countryCode'] ?? null,
                    'city'    => $detection['city'] ?? null,
                    'region'  => $detection['region'] ?? null,
                ]);
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return [
            'token'      => $token,
            'token_type' => 'Bearer',
            'expires_at' => $expiresAt,
            'user'       => AuthUserResource::make($user),
        ];
    }

    public function tokenExpiresAt(): Carbon
    {
        $minutes = (int) config('sanctum.expiration', 60 * 24 * 30);

        return now()->addMinutes($minutes > 0 ? $minutes : 60 * 24 * 30);
    }

    /**
     * A short "Browser on Platform" label plus its parts, JSON-encoded - used
     * as the Sanctum token's own name AND (by QrLoginController) as what the
     * mobile Authorize screen shows for "log in to ___?". Pure string
     * parsing, no side effects - safe to build from a synthetic Request the
     * way QrLoginController::confirm() does (reconstructing the WEBSITE
     * browser's own UA/IP from what create() captured, not the confirming
     * phone's).
     */
    public function describeSession(Request $request): string
    {
        $ua = $request->userAgent() ?? '';
        $ip = $request->ip() ?? '';

        $browser = 'Unknown Browser';
        if (str_contains($ua, 'Edg/'))           $browser = 'Edge';
        elseif (str_contains($ua, 'OPR/'))       $browser = 'Opera';
        elseif (str_contains($ua, 'Chrome/'))    $browser = 'Chrome';
        elseif (str_contains($ua, 'Firefox/'))   $browser = 'Firefox';
        elseif (str_contains($ua, 'Safari/'))    $browser = 'Safari';

        $platform = 'Unknown Device';
        if (str_contains($ua, 'iPhone'))         $platform = 'iPhone';
        elseif (str_contains($ua, 'iPad'))       $platform = 'iPad';
        elseif (str_contains($ua, 'Android'))    $platform = 'Android';
        elseif (str_contains($ua, 'Windows'))    $platform = 'Windows';
        elseif (str_contains($ua, 'Macintosh'))  $platform = 'Mac';
        elseif (str_contains($ua, 'Linux'))      $platform = 'Linux';

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
