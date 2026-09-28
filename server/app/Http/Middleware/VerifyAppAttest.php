<?php

namespace App\Http\Middleware;

use App\Http\Controllers\Api\AppAttestController;
use App\Models\AppAttestDevice;
use App\Services\AppAttest\AppAttestException;
use App\Services\AppAttest\AssertionVerifier;
use App\Services\AppAttest\ChallengeService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires a valid App Attest assertion on the routes it is applied to.
 *
 * Applied per-route rather than globally, and only to abuse-sensitive
 * operations. Putting it in front of the feed or video delivery would cost a
 * Secure Enclave signature and a round trip per request to protect content that
 * is public anyway.
 *
 * ── Two dials, both server-side ──────────────────────────────────────────
 * `appattest.enabled` off  -> the middleware is inert.
 * `appattest.enforce` off  -> verification runs in full and the result is
 *                             logged, but the request proceeds either way.
 *
 * Observe-only is the mode to deploy first and it is the default. It answers
 * the question that actually decides whether enforcement is safe - how many
 * real requests would have been blocked, and why - without locking anybody out
 * to find out. Both are read per request, so enforcement can be turned off
 * again without shipping an app update.
 *
 * ── Layering ────────────────────────────────────────────────────────────
 * This runs AFTER authentication and rate limiting, and replaces neither. A
 * genuine app instance can still be driven abusively, so the rate limiters stay
 * exactly as they are; this only answers "is this a real Teezer build".
 * Unsupported devices (every Android handset, older iPhones, simulators) never
 * present a key and are deliberately allowed through to the existing controls -
 * failing closed on them would lock out most of the userbase to stop a threat
 * they are not the source of.
 */
class VerifyAppAttest
{
    public function __construct(
        private readonly AssertionVerifier $assertions,
        private readonly ChallengeService $challenges,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        if (! config('appattest.enabled', false)) {
            return $next($request);
        }

        $enforce = (bool) config('appattest.enforce', false);
        $keyId   = (string) $request->header('X-App-Attest-Key-Id', '');

        // No key presented at all. On a supported device the client always
        // sends one, so this is either an unsupported device or a caller that
        // is not the app - which is exactly the case enforcement is for, but
        // also exactly the case that must not break Android and older iPhones.
        if ($keyId === '') {
            return $this->outcome($request, $next, 'absent', $enforce && $this->requiresKey($request));
        }

        $assertion = (string) $request->header('X-App-Attest-Assertion', '');
        $challenge = (string) $request->header('X-App-Attest-Challenge', '');
        if ($assertion === '' || $challenge === '') {
            return $this->outcome($request, $next, 'incomplete_headers', $enforce);
        }

        $device = AppAttestDevice::where('key_id', $keyId)->first();
        if (! $device) {
            // Attested against a different deployment, or pruned. The client
            // treats a rejection as "re-attest and retry once".
            return $this->outcome($request, $next, 'unknown_key', $enforce);
        }

        if (! $this->challenges->consume($challenge, AppAttestController::PURPOSE_ASSERT, $request->user()?->id)) {
            return $this->outcome($request, $next, 'challenge_invalid', $enforce);
        }

        // Binds the signature to THIS request: a captured assertion cannot be
        // lifted onto a different endpoint or a different body. Must match the
        // client's construction byte for byte.
        $clientData = AssertionVerifier::clientData(
            $challenge,
            $request->method(),
            '/' . ltrim($request->path(), '/'),
            hash('sha256', $request->getContent()),
        );

        try {
            $this->assertions->verify($device, $assertion, $clientData);
        } catch (AppAttestException $e) {
            return $this->outcome($request, $next, $e->getMessage(), $enforce);
        } catch (\Throwable $e) {
            Log::error('appattest.assert_crashed', ['error' => $e->getMessage()]);
            // A crash in our own verifier must not hand an attacker a bypass
            // when enforcing, nor take the endpoint down when not.
            return $this->outcome($request, $next, 'internal', $enforce);
        }

        $device->forceFill(['last_seen_at' => now()])->save();

        return $next($request);
    }

    /**
     * Whether a missing key should count as a failure when enforcing.
     *
     * Only iOS clients can produce one, so a request that is not from the iOS
     * app is not expected to. This keeps enforcement meaningful on iOS without
     * making Android or the website collateral damage. It is a soft signal -
     * the header is forgeable - which is precisely why "absent" is treated as
     * "no assertion to check" rather than as proof of anything.
     */
    private function requiresKey(Request $request): bool
    {
        return strtolower((string) $request->header('X-Client')) === 'teezer-mobile'
            && strtolower((string) $request->header('X-Platform')) === 'ios';
    }

    /**
     * Log the verdict, then either block or carry on.
     *
     * Every path through this middleware ends here, so there is exactly one
     * place that decides what a failure costs and exactly one place that
     * records it - which is what makes the observe-only numbers trustworthy
     * enough to base a rollout on.
     */
    private function outcome(Request $request, Closure $next, string $reason, bool $block): Response
    {
        Log::info('appattest.assertion', [
            'reason'   => $reason,
            'blocked'  => $block,
            'route'    => $request->path(),
            'user_id'  => $request->user()?->id,
        ]);

        if (! $block) {
            return $next($request);
        }

        // Same deliberately vague body as the attestation endpoint, for the
        // same reason: no oracle.
        return response()->json([
            'success' => false,
            'message' => 'This request could not be verified. Please update the app and try again.',
            'code'    => 'APP_ATTEST_REQUIRED',
        ], 403);
    }
}
