<?php

namespace App\Http\Controllers\Api\License;

use App\Http\Controllers\Controller;
use App\Licensing\Server\LicenseIssuer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public endpoint behind teezer.live/activate-license.
 *
 * Unauthenticated on purpose: the purchase code IS the credential, and the
 * person redeeming it has no Teezer account and must not need one. Section 23
 * of the spec is explicit that the licence system stays independent of Teezer
 * user auth - a buyer's licence username is an ownership label, not a social
 * account, and redeeming a code must never create one.
 *
 * Brute-force protection is the route's throttle (see routes/api.php) plus the
 * 128-bit code space; there is nothing here worth guessing at 5 attempts a
 * minute.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class ActivationController extends Controller
{
    public function __construct(private readonly LicenseIssuer $issuer) {}

    /** POST /api/v1/license/activate */
    public function activate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purchase_code' => ['required', 'string', 'min:8', 'max:100'],
            'domain'        => ['required', 'string', 'max:253'],
            // Deliberately NOT unique against the users table, and never used
            // to look one up. See the class docblock.
            'username'      => ['required', 'string', 'min:3', 'max:60', 'regex:/^[A-Za-z0-9._-]+$/'],
        ], [
            'username.regex' => 'The username may only contain letters, numbers, dots, underscores and hyphens.',
        ]);

        $result = $this->issuer->activate(
            purchaseCode: $validated['purchase_code'],
            domain:       $validated['domain'],
            username:     $validated['username'],
            ip:           $request->ip(),
        );

        if (! $result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
                'code'    => $result['code'],
            ], $result['code'] === 'INVALID_PURCHASE_CODE' ? 404 : 422);
        }

        // The ONLY time the plaintext licence key is ever transmitted. It is
        // not stored, so it cannot be shown again - the copy the customer takes
        // from this response is the only one that will exist.
        return response()->json([
            'success' => true,
            'message' => $result['message'],
            'data'    => [
                'license_key' => $result['license_key'],
                'license_id'  => $result['license_id'],
                'domain'      => $result['domain'],
                'username'    => $result['username'],
                'notice'      => 'Save this licence key now. For your security it is stored only as a hash, '
                    . 'so it cannot be displayed again.',
            ],
        ], 201);
    }
}
