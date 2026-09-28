<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Licensing\Server\LicenseKeyFactory;
use App\Licensing\Support\DomainNormalizer;
use App\Models\License;
use App\Models\LicenseActivation;
use App\Models\LicenseAuditLog;
use App\Models\PurchaseCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Backend for the "Teezer Code Purchase / License Management" admin section.
 *
 * Access is enforced SERVER-SIDE in three stacked layers, none of which a
 * browser can influence:
 *   1. auth:sanctum, via the api.admin group
 *   2. ApiAdminMiddleware - authenticated, not banned, role admin/super_admin
 *   3. permission:manage_licenses - the per-admin grant added to
 *      App\Support\AdminPermissions
 *
 * An ordinary Teezer user therefore cannot reach any of this, and neither can
 * an admin who has not been granted the licence permission. The frontend guard
 * is convenience only; this is the boundary.
 *
 * Nothing in here can reveal a purchase code or a licence key: neither is
 * stored in a recoverable form anywhere in the system. The spec's optional
 * "Reveal" action is therefore deliberately NOT implemented - see reveal()
 * below for what is offered instead, and why.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class AdminLicenseController extends Controller
{
    public function __construct(private readonly LicenseKeyFactory $keys) {}

    /** GET /api/v1/admin/licenses */
    public function index(Request $request): JsonResponse
    {
        $query = License::query()->with('purchaseCode');

        if ($search = trim((string) $request->get('q', ''))) {
            $query->where(function ($w) use ($search) {
                $w->where('domain', 'like', '%' . $search . '%')
                  ->orWhere('username', 'like', '%' . $search . '%')
                  ->orWhere('license_id', 'like', '%' . $search . '%')
                  ->orWhere('installation_id', 'like', '%' . $search . '%');
            });

            // A full purchase code or licence key pasted into the search box is
            // matched by HASH, so the operator can find a row from a customer's
            // support email without us ever storing the plaintext.
            $hash = $this->keys->hash($search);
            $query->orWhere('purchase_code_hash', $hash)->orWhere('license_key_hash', $hash);
        }

        if (($status = $request->get('status', 'all')) !== 'all') {
            $query->where('status', $status);
        }

        $licenses = $query->orderByDesc('created_at')
            ->paginate(min((int) $request->get('per_page', 25), 100));

        return response()->json([
            'success' => true,
            'data'    => [
                'items' => collect($licenses->items())->map(fn (License $l) => $this->present($l))->all(),
                'meta'  => [
                    'current_page' => $licenses->currentPage(),
                    'last_page'    => $licenses->lastPage(),
                    'per_page'     => $licenses->perPage(),
                    'total'        => $licenses->total(),
                ],
                'stats' => $this->stats(),
            ],
        ]);
    }

    /** GET /api/v1/admin/licenses/{licenseId} */
    public function show(string $licenseId): JsonResponse
    {
        $license = License::where('license_id', $licenseId)->with('purchaseCode')->firstOrFail();

        return response()->json([
            'success' => true,
            'data'    => [
                'license'     => $this->present($license),
                'activations' => $license->activations()->orderByDesc('created_at')->limit(50)->get()->map(fn ($a) => [
                    'installation_id'  => $a->installation_id,
                    'domain'           => $a->domain,
                    'status'           => $a->status,
                    'ip_address'       => $a->ip_address,
                    'version'          => $a->version,
                    'php_version'      => $a->php_version,
                    'server_os'        => $a->server_os,
                    'rejection_reason' => $a->rejection_reason,
                    'activated_at'     => $a->activated_at?->toIso8601String(),
                    'last_seen_at'     => $a->last_seen_at?->toIso8601String(),
                ]),
                'audit_logs'  => $license->auditLogs()->orderByDesc('created_at')->limit(100)->get()->map(fn ($l) => [
                    'action'      => $l->action,
                    'actor_type'  => $l->actor_type,
                    'description' => $l->description,
                    'metadata'    => $l->metadata,
                    'ip_address'  => $l->ip_address,
                    'severity'    => $l->severity,
                    'created_at'  => $l->created_at?->toIso8601String(),
                ]),
            ],
        ]);
    }

    /** POST /api/v1/admin/licenses/{licenseId}/suspend */
    public function suspend(Request $request, string $licenseId): JsonResponse
    {
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        return $this->transition($request, $licenseId, License::STATUS_SUSPENDED, 'license.suspended',
            'Licence suspended.', $validated['reason'] ?? null);
    }

    /** POST /api/v1/admin/licenses/{licenseId}/reactivate */
    public function reactivate(Request $request, string $licenseId): JsonResponse
    {
        return $this->transition($request, $licenseId, License::STATUS_ACTIVE, 'license.reactivated',
            'Licence reactivated.', null);
    }

    /**
     * POST /api/v1/admin/licenses/{licenseId}/revoke
     *
     * Terminal by intent, but note what it does NOT do: it does not touch the
     * customer's database, uploads or users. Section 15 is explicit that
     * licence enforcement must never destroy customer data, and revocation here
     * is purely a status the installation discovers at its next heartbeat.
     */
    public function revoke(Request $request, string $licenseId): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $license = License::where('license_id', $licenseId)->firstOrFail();

        $license->update([
            'status'         => License::STATUS_REVOKED,
            'revoked_at'     => now(),
            'revoked_reason' => $validated['reason'],
        ]);

        LicenseAuditLog::record(
            $license->id,
            'license.revoked',
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            'Licence revoked: ' . $validated['reason'],
            ['domain' => $license->domain],
            $request->ip(),
            'critical',
        );

        return response()->json(['success' => true, 'message' => 'Licence revoked.', 'data' => $this->present($license->fresh())]);
    }

    /**
     * POST /api/v1/admin/licenses/{licenseId}/reset-activation
     *
     * The legitimate-migration escape hatch required by section 12. Clears the
     * installation binding so the customer can run the installer on a new VPS,
     * and marks the old activation released rather than deleting it, so the
     * history of where this licence has run stays intact.
     */
    public function resetActivation(Request $request, string $licenseId): JsonResponse
    {
        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $license = License::where('license_id', $licenseId)->firstOrFail();
        $previous = $license->installation_id;

        DB::transaction(function () use ($license, $previous) {
            LicenseActivation::where('license_id', $license->id)
                ->where('status', LicenseActivation::STATUS_ACTIVE)
                ->update(['status' => LicenseActivation::STATUS_RELEASED, 'released_at' => now()]);

            $license->update(['installation_id' => null, 'installed_at' => null]);
        });

        LicenseAuditLog::record(
            $license->id,
            'license.activation_reset',
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            'Activation reset' . ($validated['reason'] ? ': ' . $validated['reason'] : '.'),
            ['previous_installation_id' => $previous, 'domain' => $license->domain],
            $request->ip(),
            'warning',
        );

        return response()->json([
            'success' => true,
            'message' => 'Activation reset. The customer can now install on a new server.',
            'data'    => $this->present($license->fresh()),
        ]);
    }

    /**
     * POST /api/v1/admin/licenses/{licenseId}/change-domain
     *
     * The existing signed token names the OLD domain, so it stops verifying the
     * moment this lands. That is intended: the customer re-runs the installer
     * (or the heartbeat renews) and receives a token for the new domain. Doing
     * it any other way would mean a token that verifies against two domains,
     * which is exactly the property domain binding exists to prevent.
     */
    public function changeDomain(Request $request, string $licenseId): JsonResponse
    {
        $validated = $request->validate([
            'domain' => ['required', 'string', 'max:253'],
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $normalized = DomainNormalizer::normalize($validated['domain']);

        if ($normalized === null) {
            return response()->json(['success' => false, 'message' => 'That is not a valid domain name.'], 422);
        }

        $license = License::where('license_id', $licenseId)->firstOrFail();
        $previous = $license->domain;

        $license->update(['domain' => $normalized, 'installation_id' => null, 'installed_at' => null]);

        LicenseAuditLog::record(
            $license->id,
            'license.domain_changed',
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            'Domain changed from ' . $previous . ' to ' . $normalized . '.',
            ['previous_domain' => $previous, 'domain' => $normalized, 'reason' => $validated['reason'] ?? null],
            $request->ip(),
            'warning',
        );

        return response()->json([
            'success' => true,
            'message' => 'Domain updated. The customer must re-run the installer on the new domain.',
            'data'    => $this->present($license->fresh()),
        ]);
    }

    /**
     * POST /api/v1/admin/licenses/{licenseId}/reveal
     *
     * Section 3 allows a "Reveal" action "only if absolutely necessary". It is
     * not necessary, and it is not possible: purchase codes and licence keys
     * are stored ONLY as SHA-256 hashes, so there is nothing to reveal. This
     * endpoint therefore returns the unmasked identifiers that are safe (the
     * licence id, domain, username, installation id) and says plainly why the
     * secrets are absent.
     *
     * It still writes an audit entry, because "who tried to look at licence
     * secrets" is worth knowing even when the answer is "nothing to see".
     */
    public function reveal(Request $request, string $licenseId): JsonResponse
    {
        $license = License::where('license_id', $licenseId)->with('purchaseCode')->firstOrFail();

        LicenseAuditLog::record(
            $license->id,
            'license.reveal_requested',
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            'Administrator opened licence details.',
            ['domain' => $license->domain],
            $request->ip(),
            'warning',
        );

        return response()->json([
            'success' => true,
            'data'    => [
                'license_id'      => $license->license_id,
                'domain'          => $license->domain,
                'username'        => $license->username,
                'installation_id' => $license->installation_id,
                'purchase_code'   => null,
                'license_key'     => null,
                'notice'          => 'Purchase codes and licence keys are stored only as SHA-256 hashes and '
                    . 'cannot be recovered. To give a customer a working key, revoke this licence and issue a '
                    . 'replacement purchase code.',
            ],
        ]);
    }

    // ── Purchase code management ─────────────────────────────────────────

    /** GET /api/v1/admin/licenses/purchase-codes */
    public function purchaseCodes(Request $request): JsonResponse
    {
        $codes = PurchaseCode::withCount('licenses')
            ->when($request->get('status', 'all') !== 'all', fn ($q) => $q->where('status', $request->get('status')))
            ->when($request->get('batch'), fn ($q, $b) => $q->where('batch', $b))
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->get('per_page', 50), 200));

        return response()->json([
            'success' => true,
            'data'    => [
                'items' => collect($codes->items())->map(fn (PurchaseCode $c) => [
                    'id'               => $c->id,
                    'masked'           => $c->masked(),
                    'batch'            => $c->batch,
                    'marketplace'      => $c->marketplace,
                    'buyer_reference'  => $c->buyer_reference,
                    'status'           => $c->status,
                    'activation_limit' => $c->activation_limit,
                    'licenses_count'   => $c->licenses_count,
                    'activated_at'     => $c->activated_at?->toIso8601String(),
                    'created_at'       => $c->created_at?->toIso8601String(),
                ])->all(),
                'meta' => [
                    'current_page' => $codes->currentPage(),
                    'last_page'    => $codes->lastPage(),
                    'total'        => $codes->total(),
                ],
            ],
        ]);
    }

    /**
     * POST /api/v1/admin/licenses/purchase-codes
     *
     * Generates a batch. The plaintext codes are returned ONCE, in this
     * response, and never stored - same contract as the licence key. The
     * operator copies them to the marketplace listing; we keep only hashes.
     */
    public function generatePurchaseCodes(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'count'            => ['required', 'integer', 'min:1', 'max:500'],
            'batch'            => ['nullable', 'string', 'max:64'],
            'marketplace'      => ['nullable', 'string', 'max:64'],
            'activation_limit' => ['nullable', 'integer', 'min:1', 'max:50'],
            'notes'            => ['nullable', 'string', 'max:500'],
        ]);

        $batch = $validated['batch'] ?? ('batch-' . now()->format('Ymd-His'));
        $plaintext = [];

        DB::transaction(function () use ($validated, $batch, $request, &$plaintext) {
            for ($i = 0; $i < $validated['count']; $i++) {
                $code = $this->keys->generatePurchaseCode();

                PurchaseCode::create([
                    'code_hash'        => $this->keys->hash($code),
                    'code_last4'       => $this->keys->last4($code),
                    'batch'            => $batch,
                    'marketplace'      => $validated['marketplace'] ?? null,
                    'status'           => PurchaseCode::STATUS_AVAILABLE,
                    'activation_limit' => $validated['activation_limit'] ?? 1,
                    'created_by'       => $request->user()->id,
                    'notes'            => $validated['notes'] ?? null,
                ]);

                $plaintext[] = $code;
            }
        });

        LicenseAuditLog::record(
            null,
            'purchase_codes.generated',
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            'Generated ' . $validated['count'] . ' purchase codes in batch ' . $batch . '.',
            ['batch' => $batch, 'count' => $validated['count']],
            $request->ip(),
        );

        return response()->json([
            'success' => true,
            'message' => $validated['count'] . ' purchase codes generated.',
            'data'    => [
                'batch'  => $batch,
                'codes'  => $plaintext,
                'notice' => 'Copy these now. They are stored only as hashes and cannot be shown again.',
            ],
        ], 201);
    }

    /** POST /api/v1/admin/licenses/purchase-codes/{id}/disable */
    public function disablePurchaseCode(Request $request, int $id): JsonResponse
    {
        $code = PurchaseCode::findOrFail($id);

        $code->update(['status' => PurchaseCode::STATUS_DISABLED, 'disabled_at' => now()]);

        LicenseAuditLog::record(
            null,
            'purchase_code.disabled',
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            'Purchase code ' . $code->masked() . ' disabled.',
            ['purchase_code_id' => $code->id],
            $request->ip(),
            'warning',
        );

        return response()->json(['success' => true, 'message' => 'Purchase code disabled.']);
    }

    // ── Internals ────────────────────────────────────────────────────────

    private function transition(
        Request $request,
        string $licenseId,
        string $status,
        string $action,
        string $message,
        ?string $reason,
    ): JsonResponse {
        $license = License::where('license_id', $licenseId)->firstOrFail();

        if ($license->status === License::STATUS_REVOKED && $status !== License::STATUS_REVOKED) {
            return response()->json([
                'success' => false,
                'message' => 'A revoked licence cannot be reactivated. Issue a new purchase code instead.',
            ], 422);
        }

        $license->update(['status' => $status]);

        LicenseAuditLog::record(
            $license->id,
            $action,
            LicenseAuditLog::ACTOR_ADMIN,
            $request->user()->id,
            $message . ($reason ? ' ' . $reason : ''),
            ['domain' => $license->domain, 'status' => $status],
            $request->ip(),
            'warning',
        );

        return response()->json(['success' => true, 'message' => $message, 'data' => $this->present($license->fresh())]);
    }

    /** Masked by default, per section 3. The unmasked values do not exist. */
    private function present(License $license): array
    {
        return [
            'license_id'       => $license->license_id,
            'purchase_code'    => 'XXXX-****-****-' . $license->purchase_code_last4,
            'license_key'      => $license->maskedKey(),
            'domain'           => $license->domain,
            'username'         => $license->username,
            'installation_id'  => $license->installation_id,
            'status'           => $license->status,
            'version'          => $license->version,
            'activation_limit' => $license->activation_limit,
            'activation_count' => $license->activation_count,
            'activated_at'     => $license->activated_at?->toIso8601String(),
            'installed_at'     => $license->installed_at?->toIso8601String(),
            'last_verified_at' => $license->last_verified_at?->toIso8601String(),
            'token_expires_at' => $license->token_expires_at?->toIso8601String(),
            'expires_at'       => $license->expires_at?->toIso8601String(),
            'revoked_at'       => $license->revoked_at?->toIso8601String(),
            'revoked_reason'   => $license->revoked_reason,
            'created_at'       => $license->created_at?->toIso8601String(),
        ];
    }

    private function stats(): array
    {
        $byStatus = License::select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'total'      => (int) $byStatus->sum(),
            'active'     => (int) ($byStatus[License::STATUS_ACTIVE] ?? 0),
            'suspended'  => (int) ($byStatus[License::STATUS_SUSPENDED] ?? 0),
            'revoked'    => (int) ($byStatus[License::STATUS_REVOKED] ?? 0),
            'expired'    => (int) ($byStatus[License::STATUS_EXPIRED] ?? 0),
            'installed'  => License::whereNotNull('installation_id')->count(),
            'codes_available' => PurchaseCode::where('status', PurchaseCode::STATUS_AVAILABLE)->count(),
            // "Quiet" = registered but not heard from in a fortnight. The number
            // an operator actually wants when asking "is anything wrong?".
            'quiet_installs'  => License::whereNotNull('installation_id')
                ->where(fn ($q) => $q->whereNull('last_verified_at')->orWhere('last_verified_at', '<', now()->subDays(14)))
                ->count(),
        ];
    }
}
