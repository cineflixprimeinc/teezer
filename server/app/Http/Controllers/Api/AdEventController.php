<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Ads\AdContext;
use App\Services\Ads\AdSigner;
use App\Services\Ads\AdSpendCounter;
use App\Services\Ads\AdStatsRecorder;
use App\Services\Ads\FraudGuard;
use App\Services\Ads\FrequencyCap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

/**
 * POST /api/v1/ad-events — the ad delivery beacon (impression / click / conversion).
 * Server-authoritative: the signed impression_token minted at serve time is the only
 * thing trusted, so a client can't fabricate or replay billable events. Deduped per
 * token+type, screened by the fraud guard, then counted + billed.
 */
class AdEventController extends Controller
{
    public function __construct(
        private AdSigner $signer,
        private AdStatsRecorder $recorder,
        private FrequencyCap $freqCap,
        private AdSpendCounter $spend,
    ) {}

    public function store(Request $request, FraudGuard $fraud): JsonResponse
    {
        $data = $request->validate([
            'type'       => ['required', 'in:impression,click,conversion'],
            'token'      => ['required', 'string', 'max:512'],
            'session_id' => ['nullable', 'string', 'max:100'],
            'placement'  => ['nullable', 'string', 'max:40'],
        ]);

        $tok = $this->signer->verify($data['token']);
        if ($tok === null) {
            return response()->json(['success' => false, 'message' => 'Invalid or expired ad token.'], 422);
        }

        // Count each (token, type) once. NX+EX = atomic first-writer-wins.
        $tokenHash = substr(sha1($data['token']), 0, 24);
        $dedupeKey = 'ads:ev:' . $data['type'] . ':' . $tokenHash;
        if (! Redis::connection('default')->set($dedupeKey, 1, 'EX', 3600, 'NX')) {
            return response()->json(['success' => true, 'deduped' => true]);
        }

        $placement = $data['placement'] ?? 'in_feed';
        $ctx = [
            'user_id'    => $tok['user_id'] ?: $request->user()?->id,
            'session_id' => $data['session_id'] ?? null,
            'ip'         => $request->ip(),
            'device_fp'  => $request->header('X-Device-Fingerprint'),
            'placement'  => $placement,
            'token_hash' => $tokenHash,
        ];

        // Fraud screen: block invalid traffic before it counts or bills.
        $verdict = $fraud->assess($data['type'], $tok, $ctx);
        if ($verdict->action !== 'allow') {
            $fraud->record($data['type'], $tok, $ctx, $verdict);
        }
        if (! $verdict->allowed) {
            // Swallow silently so the caller can't probe the detector.
            return response()->json(['success' => true]);
        }

        $country = $request->header('CF-IPCountry') ?: null;
        $this->recorder->record($data['type'], $tok, $country, $placement);

        if ($data['type'] === 'impression') {
            // Buffer the spend (settled into the ledger by ads:settle).
            $this->spend->addImpression($tok['campaign_id'], (int) $tok['price_cents']);

            $adCtx = new AdContext(
                placement:  $placement,
                userId:     $ctx['user_id'],
                sessionId:  $ctx['session_id'],
            );
            $this->freqCap->record($adCtx, $tok['campaign_id']);
        }

        return response()->json(['success' => true]);
    }
}
