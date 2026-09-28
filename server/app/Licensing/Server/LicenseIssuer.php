<?php

namespace App\Licensing\Server;

use App\Licensing\Support\DomainNormalizer;
use App\Models\License;
use App\Models\LicenseActivation;
use App\Models\LicenseAuditLog;
use App\Models\PurchaseCode;
use Illuminate\Support\Facades\DB;

/**
 * The licence lifecycle: redeem a purchase code, bind an installation, answer a
 * heartbeat.
 *
 * Every method returns a plain array rather than throwing, because each of
 * these outcomes is an expected result that the caller has to render to a
 * customer, not an exceptional condition. The shape is always:
 *
 *     ['ok' => bool, 'code' => string, 'message' => string, ...payload]
 *
 * `code` is a stable machine-readable reason the frontend and the installer can
 * branch on; `message` is what a human reads.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class LicenseIssuer
{
    public function __construct(
        private readonly LicenseKeyFactory $keys,
        private readonly LicenseSigner $signer,
        private readonly int $tokenTtlDays,
        private readonly string $product,
    ) {}

    /**
     * Step 1 of the customer journey: teezer.live/activate-license.
     *
     * Takes a purchase code, a domain and an owner username; returns a freshly
     * minted licence key IN PLAINTEXT, exactly once. We never store it, so this
     * response is the only copy that will ever exist - the customer is told so.
     *
     * The whole thing runs in a transaction with a row lock on the purchase
     * code. Without the lock, two simultaneous submissions of the same code
     * both read "available" and both create a licence - the classic
     * double-redeem race, and the one place this system would leak free copies.
     */
    public function activate(string $purchaseCode, string $domain, string $username, ?string $ip = null): array
    {
        $normalizedDomain = DomainNormalizer::normalize($domain);

        if ($normalizedDomain === null) {
            return $this->fail('INVALID_DOMAIN', 'Enter a valid domain name, for example example.com.');
        }

        $codeHash = $this->keys->hash($purchaseCode);

        return DB::transaction(function () use ($codeHash, $normalizedDomain, $username, $ip, $purchaseCode) {
            $record = PurchaseCode::where('code_hash', $codeHash)->lockForUpdate()->first();

            if ($record === null) {
                // Logged with the HASH only - never the code the customer typed.
                LicenseAuditLog::record(
                    null,
                    'activation.rejected',
                    LicenseAuditLog::ACTOR_CUSTOMER,
                    null,
                    'Activation attempted with an unrecognised purchase code.',
                    ['domain' => $normalizedDomain, 'username' => $username, 'code_hash_prefix' => substr($codeHash, 0, 12)],
                    $ip,
                    'warning',
                );

                return $this->fail('INVALID_PURCHASE_CODE', 'That purchase code was not recognised.');
            }

            if ($record->status === PurchaseCode::STATUS_DISABLED) {
                return $this->fail('PURCHASE_CODE_DISABLED', 'This purchase code is no longer valid. Please contact support.');
            }

            $existing = License::where('purchase_code_id', $record->id)
                ->where('status', '!=', License::STATUS_REVOKED)
                ->get();

            // Same code + same domain = the customer lost their key and is
            // trying again. Say so plainly instead of "already activated",
            // which reads like an accusation and generates a support ticket.
            $sameDomain = $existing->first(fn (License $l) => DomainNormalizer::matches($l->domain, $normalizedDomain));

            if ($sameDomain !== null) {
                return $this->fail(
                    'ALREADY_ACTIVATED',
                    'This purchase code is already activated for ' . $sameDomain->domain
                        . '. If you have lost your licence key, contact support to have it reissued.',
                );
            }

            if ($existing->count() >= $record->activation_limit) {
                return $this->fail(
                    'ACTIVATION_LIMIT_REACHED',
                    'This purchase code has already been used for its allowed number of domains.',
                );
            }

            // The key is generated BEFORE the row exists and is derived from
            // nothing but the CSPRNG. See LicenseKeyFactory.
            $licenseKey = $this->keys->generateLicenseKey();

            $license = License::create([
                'license_id'          => $this->keys->generateLicenseId(),
                'purchase_code_id'    => $record->id,
                'purchase_code_hash'  => $record->code_hash,
                'purchase_code_last4' => $record->code_last4,
                'license_key_hash'    => $this->keys->hash($licenseKey),
                'license_key_prefix'  => $this->keys->keyPrefix($licenseKey),
                'username'            => $username,
                'domain'              => $normalizedDomain,
                'status'              => License::STATUS_ACTIVE,
                'activation_limit'    => 1,
                'activated_at'        => now(),
            ]);

            $record->update([
                'status'       => PurchaseCode::STATUS_ACTIVATED,
                'activated_at' => $record->activated_at ?? now(),
            ]);

            LicenseAuditLog::record(
                $license->id,
                'license.created',
                LicenseAuditLog::ACTOR_CUSTOMER,
                null,
                'Licence issued for ' . $normalizedDomain . '.',
                ['domain' => $normalizedDomain, 'username' => $username, 'license_id' => $license->license_id],
                $ip,
            );

            return [
                'ok'          => true,
                'code'        => 'ACTIVATED',
                'message'     => 'Your licence key has been generated.',
                'license_key' => $licenseKey,
                'license_id'  => $license->license_id,
                'domain'      => $normalizedDomain,
                'username'    => $username,
            ];
        });
    }

    /**
     * Step 2: the installer on the customer's VPS presents purchase code +
     * licence key + domain + a freshly generated installation id, and receives
     * the signed token it will verify locally forever after.
     */
    public function install(
        string $purchaseCode,
        string $licenseKey,
        string $domain,
        string $installationId,
        array $meta = [],
        ?string $ip = null,
    ): array {
        $normalizedDomain = DomainNormalizer::normalize($domain);

        if ($normalizedDomain === null) {
            return $this->fail('INVALID_DOMAIN', 'Enter a valid domain name.');
        }

        if (! preg_match('/^inst_[a-z0-9]{10,40}$/', $installationId)) {
            return $this->fail('INVALID_INSTALLATION_ID', 'The installation identifier is malformed.');
        }

        return DB::transaction(function () use ($purchaseCode, $licenseKey, $normalizedDomain, $installationId, $meta, $ip) {
            $license = License::where('license_key_hash', $this->keys->hash($licenseKey))
                ->lockForUpdate()
                ->first();

            // One generic message for "no such key" and "key/code mismatch".
            // Distinguishing them turns this endpoint into an oracle that
            // confirms whether a guessed key exists.
            if ($license === null || ! hash_equals($license->purchase_code_hash, $this->keys->hash($purchaseCode))) {
                LicenseAuditLog::record(
                    $license?->id,
                    'install.rejected',
                    LicenseAuditLog::ACTOR_CUSTOMER,
                    null,
                    'Installation attempted with an invalid purchase code / licence key pair.',
                    ['domain' => $normalizedDomain, 'installation_id' => $installationId],
                    $ip,
                    'warning',
                );

                return $this->fail('INVALID_CREDENTIALS', 'The purchase code and licence key do not match a valid licence.');
            }

            if (! $license->isIssuable()) {
                $this->recordRejection($license, $installationId, $normalizedDomain, $meta, $ip, 'status:' . $license->status);

                return $this->fail(
                    'LICENSE_' . strtoupper($license->status),
                    'This licence is ' . $license->status . '. Please contact Teezer support.',
                );
            }

            if (! DomainNormalizer::matches($license->domain, $normalizedDomain)) {
                $this->recordRejection($license, $installationId, $normalizedDomain, $meta, $ip, 'domain_mismatch');

                return $this->fail(
                    'DOMAIN_MISMATCH',
                    'This licence is registered to ' . $license->domain
                        . '. To move it to another domain, request a domain change from Teezer support.',
                );
            }

            // Re-running the installer on the SAME box is normal (a repair, a
            // reinstall). A DIFFERENT installation id is the case that matters,
            // and it is refused rather than silently rebound - otherwise the
            // installation binding buys nothing at all.
            if ($license->installation_id !== null && ! hash_equals($license->installation_id, $installationId)) {
                $this->recordRejection($license, $installationId, $normalizedDomain, $meta, $ip, 'installation_conflict');

                return $this->fail(
                    'ALREADY_INSTALLED',
                    'This licence is already active on another installation. '
                        . 'Ask Teezer support to reset the activation if you are migrating to a new server.',
                );
            }

            $isNew = $license->installation_id === null;

            $license->fill([
                'installation_id'  => $installationId,
                'installed_at'     => $license->installed_at ?? now(),
                'last_verified_at' => now(),
                'version'          => $meta['version'] ?? $license->version,
            ]);

            if ($isNew) {
                $license->activation_count = $license->activation_count + 1;
            }

            $token = $this->issueToken($license);
            $license->save();

            LicenseActivation::updateOrCreate(
                ['license_id' => $license->id, 'installation_id' => $installationId],
                [
                    'domain'       => $normalizedDomain,
                    'status'       => LicenseActivation::STATUS_ACTIVE,
                    'ip_address'   => $ip,
                    'version'      => $meta['version'] ?? null,
                    'php_version'  => $meta['php_version'] ?? null,
                    'server_os'    => $meta['server_os'] ?? null,
                    'user_agent'   => $meta['user_agent'] ?? null,
                    'activated_at' => now(),
                    'last_seen_at' => now(),
                ],
            );

            LicenseAuditLog::record(
                $license->id,
                $isNew ? 'install.completed' : 'install.repeated',
                LicenseAuditLog::ACTOR_CUSTOMER,
                null,
                ($isNew ? 'Installation registered on ' : 'Installation re-registered on ') . $normalizedDomain . '.',
                ['domain' => $normalizedDomain, 'installation_id' => $installationId, 'version' => $meta['version'] ?? null],
                $ip,
            );

            return [
                'ok'         => true,
                'code'       => 'INSTALLED',
                'message'    => 'Installation registered.',
                'token'      => $token,
                'license_id' => $license->license_id,
                'domain'     => $license->domain,
                'expires_at' => $license->token_expires_at?->toIso8601String(),
            ];
        });
    }

    /**
     * The scheduled heartbeat. Renews the token so a healthy installation
     * silently rolls forward, and is the channel through which a revocation
     * reaches an installation that is otherwise entirely self-sufficient.
     *
     * A rejection here NEVER destroys anything on the customer's side - it just
     * reports a status the installation records locally.
     */
    public function heartbeat(
        string $licenseKey,
        string $installationId,
        string $domain,
        array $meta = [],
        ?string $ip = null,
    ): array {
        $license = License::where('license_key_hash', $this->keys->hash($licenseKey))->first();

        if ($license === null) {
            return $this->fail('INVALID_CREDENTIALS', 'Licence not recognised.');
        }

        if ($license->installation_id !== null && ! hash_equals($license->installation_id, $installationId)) {
            return $this->fail('INSTALLATION_MISMATCH', 'This installation is not the one registered for the licence.');
        }

        LicenseActivation::where('license_id', $license->id)
            ->where('installation_id', $installationId)
            ->update([
                'last_seen_at' => now(),
                'version'      => $meta['version'] ?? null,
                'ip_address'   => $ip,
            ]);

        $license->last_verified_at = now();

        if (! $license->isIssuable()) {
            $license->save();

            return [
                'ok'      => false,
                'code'    => 'LICENSE_' . strtoupper($license->status),
                'status'  => $license->status,
                'message' => 'This licence is ' . $license->status . '.',
            ];
        }

        $token = $this->issueToken($license);
        $license->version = $meta['version'] ?? $license->version;
        $license->save();

        return [
            'ok'         => true,
            'code'       => 'VERIFIED',
            'status'     => $license->status,
            'message'    => 'Licence verified.',
            'token'      => $token,
            'expires_at' => $license->token_expires_at?->toIso8601String(),
        ];
    }

    /**
     * Build and sign the token. Sets token_expires_at on the model as a side
     * effect; the caller saves.
     *
     * Note what is NOT in this payload: no purchase code, no licence key, no
     * hash of either, no email, no internal row id. A leaked token identifies
     * an installation and authorises nothing.
     */
    public function issueToken(License $license): string
    {
        $issuedAt  = now();
        $expiresAt = $issuedAt->copy()->addDays($this->tokenTtlDays);

        $license->token_expires_at = $expiresAt;

        return $this->signer->sign([
            'product'            => $this->product,
            'license_id'         => $license->license_id,
            'domain'             => $license->domain,
            'username'           => $license->username,
            'installation_id'    => $license->installation_id,
            'status'             => $license->status,
            'licensed_version'   => $license->version,
            'issued_at'          => $issuedAt->toIso8601String(),
            'expires_at'         => $expiresAt->toIso8601String(),
            'license_expires_at' => $license->expires_at?->toIso8601String(),
        ]);
    }

    private function recordRejection(
        License $license,
        string $installationId,
        string $domain,
        array $meta,
        ?string $ip,
        string $reason,
    ): void {
        LicenseActivation::create([
            'license_id'       => $license->id,
            'installation_id'  => $installationId,
            'domain'           => $domain,
            'status'           => LicenseActivation::STATUS_REJECTED,
            'ip_address'       => $ip,
            'version'          => $meta['version'] ?? null,
            'php_version'      => $meta['php_version'] ?? null,
            'server_os'        => $meta['server_os'] ?? null,
            'user_agent'       => $meta['user_agent'] ?? null,
            'rejection_reason' => $reason,
        ]);
    }

    private function fail(string $code, string $message): array
    {
        return ['ok' => false, 'code' => $code, 'message' => $message];
    }
}
