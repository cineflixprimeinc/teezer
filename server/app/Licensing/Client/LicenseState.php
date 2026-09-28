<?php

namespace App\Licensing\Client;

/**
 * The result of verifying this installation's licence. Immutable, cheap, and
 * safe to serialise into a cache or an API response - it deliberately carries
 * NO token, NO signature and NO key material, only the conclusions.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
final class LicenseState implements \JsonSerializable
{
    /** Enforcement is switched off entirely (this is what reelsoo.com runs). */
    public const STATUS_DISABLED = 'disabled';

    /** Signature, product, domain, installation and expiry all check out. */
    public const STATUS_VALID = 'valid';

    /**
     * Signature and bindings are fine, but the token is past expires_at and the
     * heartbeat has not renewed it. Still inside the grace window.
     */
    public const STATUS_GRACE = 'grace';

    /** Past expires_at AND past the grace window. Policy decides what happens. */
    public const STATUS_STALE = 'stale';

    /** No licence file at all - a fresh install that has not run setup yet. */
    public const STATUS_MISSING = 'missing';

    /** Signature failed, product wrong, or the token is structurally garbage. */
    public const STATUS_INVALID = 'invalid';

    /** Valid signature, but for a different domain or a different install. */
    public const STATUS_MISMATCH = 'mismatch';

    /** The licence server told us, at the last heartbeat, that this is dead. */
    public const STATUS_REVOKED = 'revoked';

    /** Temporarily halted by the licensor (unpaid invoice, dispute, etc). */
    public const STATUS_SUSPENDED = 'suspended';

    /**
     * The licence's own commercial term has ended. Distinct from STALE: STALE
     * means we could not be reached, EXPIRED means the licence really has run
     * out and the signed token says so, verifiable with no network at all.
     */
    public const STATUS_EXPIRED = 'expired';

    private function __construct(
        public readonly string  $status,
        public readonly string  $message,
        public readonly ?string $licenseId = null,
        public readonly ?string $domain = null,
        public readonly ?string $installationId = null,
        public readonly ?string $username = null,
        public readonly ?string $licensedVersion = null,
        public readonly ?string $issuedAt = null,
        public readonly ?string $expiresAt = null,
        public readonly ?string $lastVerifiedAt = null,
    ) {}

    public static function make(string $status, string $message, array $attributes = []): self
    {
        return new self(
            status:          $status,
            message:         $message,
            licenseId:       $attributes['license_id']       ?? null,
            domain:          $attributes['domain']           ?? null,
            installationId:  $attributes['installation_id']  ?? null,
            username:        $attributes['username']         ?? null,
            licensedVersion: $attributes['licensed_version'] ?? null,
            issuedAt:        $attributes['issued_at']        ?? null,
            expiresAt:       $attributes['expires_at']       ?? null,
            lastVerifiedAt:  $attributes['last_verified_at'] ?? null,
        );
    }

    /**
     * Whether the application should serve traffic.
     *
     * GRACE and STALE both pass here. That is deliberate and is the spec's
     * requirement: a licence server outage is OUR failure, and it must never
     * present to a paying customer as their site going down. What happens in
     * the STALE case beyond this is the middleware's stale_policy decision.
     *
     * DISABLED passes because it means enforcement is off, which is the
     * licensor's own configuration.
     */
    public function allowsService(): bool
    {
        return in_array($this->status, [
            self::STATUS_DISABLED,
            self::STATUS_VALID,
            self::STATUS_GRACE,
            self::STATUS_STALE,
        ], true);
    }

    /** A hard failure that no grace period should ever paper over. */
    public function isHardFailure(): bool
    {
        return in_array($this->status, [
            self::STATUS_INVALID,
            self::STATUS_MISMATCH,
            self::STATUS_REVOKED,
            self::STATUS_SUSPENDED,
            self::STATUS_EXPIRED,
        ], true);
    }

    public function needsSetup(): bool
    {
        return $this->status === self::STATUS_MISSING;
    }

    public function jsonSerialize(): array
    {
        return [
            'status'           => $this->status,
            'message'          => $this->message,
            'license_id'       => $this->licenseId,
            'domain'           => $this->domain,
            'installation_id'  => $this->installationId,
            'username'         => $this->username,
            'licensed_version' => $this->licensedVersion,
            'issued_at'        => $this->issuedAt,
            'expires_at'       => $this->expiresAt,
            'last_verified_at' => $this->lastVerifiedAt,
        ];
    }
}
