<?php

namespace App\Licensing\Client;

use App\Licensing\Support\DomainNormalizer;
use App\Licensing\Support\LicenseTokenCodec;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Verifies this installation's signed licence. ENTIRELY LOCAL.
 *
 * This class makes NO network call of any kind, and must never be given one.
 * That is the whole architectural point of the asymmetric scheme: the licence
 * server signs once, at activation, with a private key it never releases; the
 * installation verifies as often as it likes with the public key it was
 * shipped. Normal traffic - a page load, a login, a feed request, an upload -
 * therefore never touches reelsoo.com, license.reelsoo.com or anything else of
 * ours. Renewal and revocation discovery happen on a SCHEDULED heartbeat
 * (LicenseHeartbeat), never on a request path.
 *
 * It also never throws. A verifier that can throw is a verifier that can take
 * a customer's site down over a corrupt file, and the failure modes here are
 * all expressible as a LicenseState.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class LicenseVerifier
{
    public function __construct(
        private readonly LicenseStore $store,
        private readonly string $publicKeyPath,
        private readonly string $product,
        private readonly int $graceDays,
        private readonly int $cacheSeconds,
        private readonly bool $enabled,
    ) {}

    /**
     * Cached so the middleware is not hitting the filesystem and doing an RSA
     * verify on every single request. The TTL is short and the cache is local,
     * so a revocation discovered by the heartbeat surfaces within minutes.
     */
    public function state(): LicenseState
    {
        if (! $this->enabled) {
            return LicenseState::make(
                LicenseState::STATUS_DISABLED,
                'Licence enforcement is disabled on this installation.',
            );
        }

        if ($this->cacheSeconds <= 0) {
            return $this->verify();
        }

        // A plain array round trip rather than caching the object keeps this
        // working on every cache store, including the array driver in tests.
        $cached = Cache::get('licensing:state');

        if (is_array($cached) && isset($cached['status'], $cached['message'])) {
            return LicenseState::make($cached['status'], $cached['message'], $cached);
        }

        $state = $this->verify();
        Cache::put('licensing:state', $state->jsonSerialize(), $this->cacheSeconds);

        return $state;
    }

    public function forget(): void
    {
        Cache::forget('licensing:state');
    }

    /**
     * The uncached check, ordered so it fails fast and leaks nothing.
     */
    public function verify(): LicenseState
    {
        if (! $this->enabled) {
            return LicenseState::make(LicenseState::STATUS_DISABLED, 'Licence enforcement is disabled.');
        }

        $record = $this->store->read();

        if ($record === null || empty($record['token'])) {
            return LicenseState::make(
                LicenseState::STATUS_MISSING,
                'This installation has not been activated yet.',
            );
        }

        $decoded = LicenseTokenCodec::decode((string) $record['token']);

        if ($decoded === null) {
            return LicenseState::make(
                LicenseState::STATUS_INVALID,
                'The licence file is not a valid Teezer licence token.',
            );
        }

        // Signature first. Nothing in the payload is trustworthy until the
        // signature over the EXACT signed bytes has been verified.
        if (! $this->signatureIsValid($decoded['payload_bytes'], $decoded['signature'])) {
            return LicenseState::make(
                LicenseState::STATUS_INVALID,
                'The licence signature could not be verified.',
            );
        }

        $payload = $decoded['payload'];

        // Product. A token minted for something else is not a Reelsoo licence,
        // however validly it happens to be signed.
        if (! hash_equals($this->product, (string) ($payload['product'] ?? ''))) {
            return LicenseState::make(
                LicenseState::STATUS_INVALID,
                'This licence was not issued for Teezer.',
            );
        }

        $attributes = [
            'license_id'       => $payload['license_id']       ?? null,
            'domain'           => $payload['domain']           ?? null,
            'installation_id'  => $payload['installation_id']  ?? null,
            'username'         => $payload['username']         ?? null,
            'licensed_version' => $payload['licensed_version'] ?? null,
            'issued_at'        => $payload['issued_at']        ?? null,
            'expires_at'       => $payload['expires_at']       ?? null,
            'last_verified_at' => $record['last_verified_at']  ?? null,
        ];

        // Status as of issue time, plus whatever the last heartbeat learned.
        // Both are checked: the token is authoritative, and the locally
        // recorded heartbeat result is how a revocation issued AFTER this
        // token was signed gets discovered without a per-request call.
        $status    = strtolower((string) ($payload['status'] ?? 'active'));
        $lastKnown = strtolower((string) ($record['last_verify_status'] ?? ''));

        if ($status === 'revoked' || $lastKnown === 'revoked') {
            return LicenseState::make(
                LicenseState::STATUS_REVOKED,
                'This licence has been revoked. Please contact Teezer support.',
                $attributes,
            );
        }

        if ($status === 'suspended' || $lastKnown === 'suspended') {
            return LicenseState::make(
                LicenseState::STATUS_SUSPENDED,
                'This licence is currently suspended. Please contact Teezer support.',
                $attributes,
            );
        }

        // Domain binding, compared against the CONFIGURED installation domain
        // (APP_URL) and never against the request Host header. A header is
        // attacker-controlled, so binding to it would let any visitor satisfy
        // the licence just by sending the licensed hostname.
        if (! DomainNormalizer::matches($payload['domain'] ?? null, $this->configuredDomain())) {
            return LicenseState::make(
                LicenseState::STATUS_MISMATCH,
                'This licence is issued for a different domain.',
                $attributes,
            );
        }

        // Installation binding. Stops one licence being copied across
        // unlimited VPSes: a clone carries the original installation id and is
        // visible to the licence server as one installation reporting from two
        // places at once.
        $boundInstallation = (string) ($payload['installation_id'] ?? '');
        $localInstallation = (string) ($record['installation_id'] ?? '');

        if ($boundInstallation === '' || ! hash_equals($boundInstallation, $localInstallation)) {
            return LicenseState::make(
                LicenseState::STATUS_MISMATCH,
                'This licence is bound to a different installation.',
                $attributes,
            );
        }

        // Commercial term. NULL means perpetual, which is the normal
        // marketplace case. When set, it is enforced locally and offline.
        $licenseExpiresAt = $this->parseDate($payload['license_expires_at'] ?? null);

        if ($licenseExpiresAt !== null && $licenseExpiresAt->isPast()) {
            return LicenseState::make(
                LicenseState::STATUS_EXPIRED,
                'This licence expired on ' . $licenseExpiresAt->toFormattedDateString() . '.',
                $attributes,
            );
        }

        // Refresh window. Past it we are in grace, then stale. Neither stops
        // the site here - see LicenseState::allowsService() and stale_policy.
        $tokenExpiresAt = $this->parseDate($payload['expires_at'] ?? null);

        if ($tokenExpiresAt !== null && $tokenExpiresAt->isPast()) {
            $graceEndsAt = $tokenExpiresAt->copy()->addDays($this->graceDays);

            if ($graceEndsAt->isFuture()) {
                return LicenseState::make(
                    LicenseState::STATUS_GRACE,
                    'This licence needs to re-verify. It keeps working until '
                        . $graceEndsAt->toFormattedDateString() . '.',
                    $attributes,
                );
            }

            return LicenseState::make(
                LicenseState::STATUS_STALE,
                'This licence has not re-verified since '
                    . $tokenExpiresAt->toFormattedDateString() . '.',
                $attributes,
            );
        }

        return LicenseState::make(LicenseState::STATUS_VALID, 'Licence is active.', $attributes);
    }

    /**
     * RSA-SHA256 over the raw signed bytes.
     *
     * RSA rather than Ed25519 deliberately: ext-sodium is not present on every
     * PHP 8.2 host a customer might install on (it is absent from this very
     * development machine), while ext-openssl effectively always is. A licence
     * check that cannot run on the customer's server is worse than a slightly
     * larger signature.
     */
    private function signatureIsValid(string $payloadBytes, string $signature): bool
    {
        $pem = $this->publicKey();

        if ($pem === null) {
            // No public key means we cannot verify anything. Fail CLOSED:
            // report the signature as bad rather than waving the licence past.
            return false;
        }

        $key = @openssl_pkey_get_public($pem);

        if ($key === false) {
            return false;
        }

        // openssl_verify returns 1 valid, 0 invalid, -1 error. Only 1 passes.
        return openssl_verify($payloadBytes, $signature, $key, OPENSSL_ALGO_SHA256) === 1;
    }

    private function publicKey(): ?string
    {
        if (! is_file($this->publicKeyPath) || ! is_readable($this->publicKeyPath)) {
            return null;
        }

        $pem = @file_get_contents($this->publicKeyPath);

        return ($pem === false || trim($pem) === '') ? null : $pem;
    }

    /**
     * The domain this installation believes itself to be. APP_URL is the
     * source of truth, with LICENSE_DOMAIN as an explicit override for setups
     * where APP_URL is not the public hostname.
     */
    public function configuredDomain(): ?string
    {
        $explicit = config('licensing.client.domain');

        if (is_string($explicit) && trim($explicit) !== '') {
            return DomainNormalizer::normalize($explicit);
        }

        return DomainNormalizer::normalize((string) config('app.url'));
    }

    private function parseDate(mixed $value): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            // An unparseable date is treated as absent rather than fatal.
            return null;
        }
    }
}
