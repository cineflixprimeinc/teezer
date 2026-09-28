<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppAttestDevice;
use App\Services\AppAttest\AppAttestException;
use App\Services\AppAttest\AttestationVerifier;
use App\Services\AppAttest\ChallengeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * The two endpoints an app instance needs before it can sign anything:
 * get a challenge, and register the key it attested with that challenge.
 *
 * Both are reachable WITHOUT a session on purpose. The endpoints most worth
 * protecting - register and login - are the ones nobody is signed in for yet,
 * so requiring auth here would make attestation useless exactly where it
 * matters most. A signed-in caller has its key associated with the account as
 * well, which is only ever used for support and abuse work (see the migration).
 */
class AppAttestController extends Controller
{
    public function __construct(
        private readonly ChallengeService $challenges,
        private readonly AttestationVerifier $verifier,
    ) {}

    /** Purpose string binding a challenge to key registration specifically. */
    public const PURPOSE_ATTEST = 'attest';

    /** Purpose for the per-request assertions the middleware consumes. */
    public const PURPOSE_ASSERT = 'assert';

    /**
     * POST /app-attest/challenge
     *
     * Returns a single-use nonce. Cheap and deliberately uninformative: it
     * reveals nothing and is useless without a Secure Enclave key, so it is
     * safe to hand out to an unauthenticated caller. It is still rate-limited
     * at the route, because minting is not free.
     */
    public function challenge(Request $request): JsonResponse
    {
        if (! config('appattest.enabled', false)) {
            // "Unavailable" rather than an error: an app that gets this simply
            // proceeds without attestation, which is the correct behaviour both
            // while the feature is dark and on devices that cannot support it.
            return response()->json(['success' => true, 'data' => ['available' => false]]);
        }

        $purpose = $request->input('purpose') === self::PURPOSE_ASSERT
            ? self::PURPOSE_ASSERT
            : self::PURPOSE_ATTEST;

        return response()->json([
            'success' => true,
            'data'    => [
                'available'  => true,
                'challenge'  => $this->challenges->issue($purpose, $request->user()?->id),
                'expires_in' => (int) config('appattest.challenge_ttl', 300),
            ],
        ]);
    }

    /**
     * POST /app-attest/key
     *
     * Verify an attestation and record the key. Everything of consequence
     * happens inside AttestationVerifier; this method's own job is to spend the
     * challenge exactly once, keep the failure response uninformative, and
     * store the result.
     */
    public function register(Request $request): JsonResponse
    {
        if (! config('appattest.enabled', false)) {
            return response()->json(['success' => true, 'data' => ['available' => false]]);
        }

        $data = $request->validate([
            'key_id'      => ['required', 'string', 'max:128'],
            'attestation' => ['required', 'string', 'max:16384'],
            'challenge'   => ['required', 'string', 'max:128'],
        ]);

        // Spent BEFORE the expensive verification below, so two concurrent
        // replays of the same challenge cannot both get as far as verifying.
        if (! $this->challenges->consume($data['challenge'], self::PURPOSE_ATTEST, $request->user()?->id)) {
            return $this->refuse('challenge_invalid', $request);
        }

        try {
            $result = $this->verifier->verify($data['key_id'], $data['attestation'], $data['challenge']);
        } catch (AppAttestException $e) {
            return $this->refuse($e->getMessage(), $request);
        } catch (\Throwable $e) {
            // An unexpected failure is a bug in the verifier, not a verdict
            // about the client - logged loudly, still refused.
            Log::error('appattest.verify_crashed', ['error' => $e->getMessage()]);
            return $this->refuse('internal', $request);
        }

        // updateOrCreate on key_id: re-attesting the same install (a reinstall
        // generates a NEW key, but a retried attestation reuses the same one)
        // must update rather than collide with the unique index.
        AppAttestDevice::updateOrCreate(
            ['key_id' => $result['key_id']],
            [
                'user_id'      => $request->user()?->id,
                'public_key'   => $result['public_key'],
                'environment'  => $result['environment'],
                'bundle_id'    => (string) config('appattest.bundle_id'),
                'team_id'      => (string) config('appattest.team_id'),
                'receipt'      => $result['receipt'],
                'last_counter' => $result['counter'],
                'status'       => 'active',
                'attested_at'  => now(),
                'last_seen_at' => now(),
            ],
        );

        Log::info('appattest.attested', [
            'environment' => $result['environment'],
            // Never the key id itself: it identifies an install across
            // accounts, so a prefix is enough to correlate a support report
            // without putting a durable device identifier in the log.
            'key_prefix'  => substr($result['key_id'], 0, 8),
            'user_id'     => $request->user()?->id,
        ]);

        return response()->json(['success' => true, 'data' => ['attested' => true]]);
    }

    /**
     * One response shape for every failure.
     *
     * The real reason goes to the log and never to the client. Telling a caller
     * which of a dozen checks it failed turns this into an oracle for probing
     * the verifier until something passes.
     */
    private function refuse(string $reason, Request $request): JsonResponse
    {
        Log::warning('appattest.rejected', [
            'reason' => $reason,
            'ip'     => $request->ip(),
            'user_id' => $request->user()?->id,
        ]);

        return response()->json([
            'success' => false,
            'message' => 'Attestation could not be verified.',
        ], 400);
    }
}
