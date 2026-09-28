<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Jobs\SyncCreatorMonetization;
use App\Models\CreatorAgreement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * POST /studio/monetization/agreements
 *
 * Records a creator accepting one of the terms a monetization requirement asks
 * for. This is what makes "Sign pledge" and "Accept partner terms" real
 * buttons rather than checklist rows nobody can clear.
 *
 * Accepting re-measures immediately, so the requirement turns green and the
 * programme can unlock on the same tap - which is the whole point of an
 * automatic eligibility system.
 */
class CreatorAgreementController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key'     => ['required', Rule::in(CreatorAgreement::KEYS)],
            'version' => ['sometimes', 'string', 'max:20'],
        ]);

        // Idempotent: accepting twice is not an error, and the ORIGINAL
        // acceptance time is the one that matters as evidence, so it is not
        // overwritten by a second tap.
        $agreement = CreatorAgreement::firstOrCreate(
            ['user_id' => $request->user()->id, 'key' => $data['key']],
            [
                'version'     => $data['version'] ?? '1',
                'accepted_at' => now(),
                'ip'          => $request->ip(),
            ],
        );

        SyncCreatorMonetization::dispatch($request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Accepted.',
            'data'    => [
                'key'         => $agreement->key,
                'accepted_at' => $agreement->accepted_at?->toIso8601String(),
            ],
        ]);
    }

    /** GET /studio/monetization/agreements - what this creator has accepted. */
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => CreatorAgreement::where('user_id', $request->user()->id)
                ->get(['key', 'version', 'accepted_at']),
        ]);
    }
}
