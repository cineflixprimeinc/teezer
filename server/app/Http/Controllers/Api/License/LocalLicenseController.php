<?php

namespace App\Http\Controllers\Api\License;

use App\Http\Controllers\Controller;
use App\Licensing\Client\LicenseStore;
use App\Licensing\Client\LicenseVerifier;
use Illuminate\Http\JsonResponse;

/**
 * Lets a CUSTOMER's own administrator see the licence state of their own
 * installation. Nothing more.
 *
 * This is the shipped counterpart to AdminLicenseController, which manages
 * every licence and stays on our side. The distinction matters: this endpoint
 * answers "is my copy licensed and until when", never "who else has a licence".
 *
 * It returns no token, no signature, no licence key and no purchase code - only
 * the LicenseState conclusions, which are safe by construction (see that
 * class's docblock).
 *
 * On teezer.live this reports status 'disabled', which is accurate: the
 * licensor does not license itself.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class LocalLicenseController extends Controller
{
    /** GET /api/v1/admin/license/local */
    public function show(LicenseVerifier $verifier, LicenseStore $store): JsonResponse
    {
        $state = $verifier->state();
        $record = $store->read();

        return response()->json([
            'success' => true,
            'data'    => [
                'license'           => $state->jsonSerialize(),
                'configured_domain' => $verifier->configuredDomain(),
                'allows_service'    => $state->allowsService(),
                'needs_attention'   => $state->isHardFailure() || in_array($state->status, ['grace', 'stale'], true),
                // The file's LOCATION is not a secret and is the first thing
                // anyone debugging a licence problem needs.
                'license_file'      => $store->path(),
                'last_verified_at'  => $record['last_verified_at'] ?? null,
                'stale_policy'      => config('licensing.client.stale_policy'),
                'grace_days'        => (int) config('licensing.client.grace_days'),
            ],
        ]);
    }
}
