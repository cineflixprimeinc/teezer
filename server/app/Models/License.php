<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An issued licence. See the create_licenses_table migration for the storage
 * model (hashes only) and why `username` is not a users foreign key.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class License extends Model
{
    public const STATUS_ACTIVE    = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_REVOKED   = 'revoked';
    public const STATUS_EXPIRED   = 'expired';

    protected $fillable = [
        'license_id', 'purchase_code_id', 'purchase_code_hash', 'purchase_code_last4',
        'license_key_hash', 'license_key_prefix', 'username', 'domain',
        'installation_id', 'status', 'version', 'activation_limit', 'activation_count',
        'activated_at', 'installed_at', 'last_verified_at', 'token_expires_at',
        'revoked_at', 'revoked_reason', 'expires_at', 'notes',
    ];

    /**
     * Both hashes are hidden from serialisation. license_key_hash especially:
     * it is the single value that, if leaked, lets someone confirm a guessed
     * key offline.
     */
    protected $hidden = ['license_key_hash', 'purchase_code_hash'];

    protected function casts(): array
    {
        return [
            'activated_at'     => 'datetime',
            'installed_at'     => 'datetime',
            'last_verified_at' => 'datetime',
            'token_expires_at' => 'datetime',
            'revoked_at'       => 'datetime',
            'expires_at'       => 'datetime',
        ];
    }

    public function purchaseCode(): BelongsTo
    {
        return $this->belongsTo(PurchaseCode::class);
    }

    public function activations(): HasMany
    {
        return $this->hasMany(LicenseActivation::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(LicenseAuditLog::class);
    }

    /**
     * Whether this licence may currently mint a token.
     *
     * Note the commercial-expiry check writes nothing - a licence that has
     * passed expires_at simply stops issuing. Flipping status to expired is
     * the scheduled reconciliation job business, not a read path.
     */
    public function isIssuable(): bool
    {
        if ($this->status !== self::STATUS_ACTIVE) {
            return false;
        }
        if ($this->expires_at !== null && $this->expires_at->isPast()) {
            return false;
        }
        return true;
    }

    /** Masked form for the admin table: RL-************ */
    public function maskedKey(): string
    {
        return $this->license_key_prefix . str_repeat('*', 12);
    }
}
