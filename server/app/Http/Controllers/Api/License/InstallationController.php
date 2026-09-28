<?php

namespace App\Http\Controllers\Api\License;

use App\Http\Controllers\Controller;
use App\Licensing\Server\LicenseIssuer;
use App\Licensing\Server\ReleaseAuthorizer;
use App\Licensing\Support\DomainNormalizer;
use App\Models\License;
use App\Models\LicenseAuditLog;
use App\Licensing\Server\LicenseKeyFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The three endpoints a customer installation is ever allowed to call, and the
 * complete list of moments it talks to us at all:
 *
 *   POST /license/install  - once, during installation
 *   POST /license/verify   - on a schedule (default daily), never per request
 *   POST /license/release  - only when the operator runs `teezer update`
 *
 * Nothing on a page load. Nothing on a login. Nothing on an API call. If a
 * future change makes a normal request path reach this controller, that change
 * is wrong - the whole architecture in sections 8 and 13 depends on it.
 *
 * Unauthenticated by Sanctum, because a customer VPS has no Teezer user. The
 * credential is the licence key, checked by hash on every call.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class InstallationController extends Controller
{
    public function __construct(
        private readonly LicenseIssuer $issuer,
        private readonly ReleaseAuthorizer $releases,
        private readonly LicenseKeyFactory $keys,
    ) {}

    /** POST /api/v1/license/install */
    public function install(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purchase_code'   => ['required', 'string', 'max:100'],
            'license_key'     => ['required', 'string', 'max:100'],
            'domain'          => ['required', 'string', 'max:253'],
            'installation_id' => ['required', 'string', 'max:40'],
            'version'         => ['nullable', 'string', 'max:32'],
            'php_version'     => ['nullable', 'string', 'max:32'],
            'server_os'       => ['nullable', 'string', 'max:100'],
        ]);

        $result = $this->issuer->install(
            purchaseCode:   $validated['purchase_code'],
            licenseKey:     $validated['license_key'],
            domain:         $validated['domain'],
            installationId: $validated['installation_id'],
            meta: [
                'version'     => $validated['version']     ?? null,
                'php_version' => $validated['php_version'] ?? null,
                'server_os'   => $validated['server_os']   ?? null,
                'user_agent'  => substr((string) $request->userAgent(), 0, 255),
            ],
            ip: $request->ip(),
        );

        if (! $result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
                'code'    => $result['code'],
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => $result['message'],
            'data'    => [
                'token'      => $result['token'],
                'license_id' => $result['license_id'],
                'domain'     => $result['domain'],
                'expires_at' => $result['expires_at'],
            ],
        ], 201);
    }

    /**
     * POST /api/v1/license/verify
     *
     * The scheduled heartbeat. Renews the token and is how a revocation reaches
     * an otherwise self-sufficient installation.
     *
     * A failure here is reported, never enforced from our side: we cannot and
     * must not reach into a customer's server. The installation records the
     * status locally and its own middleware decides what to do.
     */
    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'license_key'     => ['required', 'string', 'max:100'],
            'installation_id' => ['required', 'string', 'max:40'],
            'domain'          => ['required', 'string', 'max:253'],
            'version'         => ['nullable', 'string', 'max:32'],
        ]);

        $result = $this->issuer->heartbeat(
            licenseKey:     $validated['license_key'],
            installationId: $validated['installation_id'],
            domain:         $validated['domain'],
            meta:           ['version' => $validated['version'] ?? null],
            ip:             $request->ip(),
        );

        // 200 even for a negative verdict. The installation needs to READ the
        // status; a 4xx would be indistinguishable from a network fault and
        // would push a perfectly healthy install into its grace path.
        return response()->json([
            'success' => $result['ok'],
            'message' => $result['message'],
            'code'    => $result['code'],
            'data'    => [
                'status'     => $result['status']     ?? null,
                'token'      => $result['token']      ?? null,
                'expires_at' => $result['expires_at'] ?? null,
            ],
        ]);
    }

    /**
     * POST /api/v1/license/release
     *
     * Authorises a single, short-lived download of a private release package.
     * The response carries a presigned URL, a checksum and a signature - never
     * a B2 credential of any kind.
     */
    public function release(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'license_key'     => ['required', 'string', 'max:100'],
            'installation_id' => ['required', 'string', 'max:40'],
            'domain'          => ['required', 'string', 'max:253'],
            'version'         => ['nullable', 'string', 'max:32'],
            'channel'         => ['nullable', 'string', 'in:stable,beta'],
        ]);

        $license = License::where('license_key_hash', $this->keys->hash($validated['license_key']))->first();

        if ($license === null) {
            return response()->json([
                'success' => false,
                'message' => 'Licence not recognised.',
                'code'    => 'INVALID_CREDENTIALS',
            ], 403);
        }

        // Both bindings are re-checked here, not just the key. A leaked key
        // alone must not be enough to pull our private source.
        if ($license->installation_id !== null
            && ! hash_equals($license->installation_id, $validated['installation_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'This installation is not the one registered for the licence.',
                'code'    => 'INSTALLATION_MISMATCH',
            ], 403);
        }

        if (! DomainNormalizer::matches($license->domain, $validated['domain'])) {
            return response()->json([
                'success' => false,
                'message' => 'This licence is registered to a different domain.',
                'code'    => 'DOMAIN_MISMATCH',
            ], 403);
        }

        $result = $this->releases->authorize(
            $license,
            $validated['version'] ?? null,
            $validated['channel'] ?? 'stable',
        );

        LicenseAuditLog::record(
            $license->id,
            $result['ok'] ? 'release.authorized' : 'release.denied',
            LicenseAuditLog::ACTOR_CUSTOMER,
            null,
            $result['ok']
                ? 'Authorised download of version ' . $result['version'] . '.'
                : 'Release download denied: ' . $result['code'] . '.',
            ['version' => $result['version'] ?? ($validated['version'] ?? null), 'result' => $result['code']],
            $request->ip(),
            $result['ok'] ? 'info' : 'warning',
        );

        if (! $result['ok']) {
            return response()->json([
                'success' => false,
                'message' => $result['message'],
                'code'    => $result['code'],
            ], 403);
        }

        return response()->json([
            'success' => true,
            'message' => $result['message'],
            'data'    => [
                'version'       => $result['version'],
                'channel'       => $result['channel'],
                'download_url'  => $result['download_url'],
                'expires_in'    => $result['expires_in'],
                'checksum'      => $result['checksum'],
                'signature'     => $result['signature'],
                'size_bytes'    => $result['size_bytes'],
                'is_mandatory'  => $result['is_mandatory'],
                'release_notes' => $result['release_notes'],
            ],
        ]);
    }
}
