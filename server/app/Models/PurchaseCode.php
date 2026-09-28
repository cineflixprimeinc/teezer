<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A marketplace purchase code. See the create_purchase_codes_table migration
 * for why the plaintext code is never stored.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class PurchaseCode extends Model
{
    public const STATUS_AVAILABLE = 'available';
    public const STATUS_ACTIVATED = 'activated';
    public const STATUS_DISABLED  = 'disabled';

    protected $fillable = [
        'code_hash', 'code_last4', 'batch', 'marketplace', 'buyer_reference',
        'status', 'activation_limit', 'created_by', 'activated_at',
        'disabled_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'activated_at' => 'datetime',
            'disabled_at'  => 'datetime',
        ];
    }

    /**
     * Deliberately hidden from every serialisation path. The hash is not a
     * secret in the way the code is, but there is no reason for an API
     * response to carry it and every reason not to hand an attacker a target
     * for an offline dictionary attack against a short code space.
     */
    protected $hidden = ['code_hash'];

    public function licenses(): HasMany
    {
        return $this->hasMany(License::class);
    }

    public function isRedeemable(): bool
    {
        return $this->status !== self::STATUS_DISABLED
            && $this->licenses()->where('status', '!=', License::STATUS_REVOKED)->count() < $this->activation_limit;
    }

    /** Masked form for the admin table: XXXX-****-****-1234 */
    public function masked(): string
    {
        return 'XXXX-****-****-' . $this->code_last4;
    }
}
