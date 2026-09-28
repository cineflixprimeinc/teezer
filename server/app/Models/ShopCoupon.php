<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A marketplace coupon shown on the Shop home. See the migration that
 * created this table for why it's separate from the platform-wide
 * `coupons` table (subscription-plan-scoped, unrelated domain).
 */
class ShopCoupon extends Model
{
    public const TYPE_PERCENTAGE = 'percentage';
    public const TYPE_FIXED = 'fixed';
    public const TYPE_FREE_DELIVERY = 'free_delivery';
    public const TYPES = [self::TYPE_PERCENTAGE, self::TYPE_FIXED, self::TYPE_FREE_DELIVERY];

    protected $fillable = [
        'code', 'title', 'description', 'type', 'value', 'min_spend',
        'usage_limit', 'used_count',
        'is_active', 'starts_at', 'ends_at', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'value'       => 'decimal:2',
            'min_spend'   => 'decimal:2',
            'usage_limit' => 'integer',
            'used_count'  => 'integer',
            'is_active'   => 'boolean',
            'sort_order'  => 'integer',
            'starts_at'   => 'datetime',
            'ends_at'     => 'datetime',
        ];
    }

    public function claims(): HasMany
    {
        return $this->hasMany(ShopCouponClaim::class);
    }

    /**
     * Active and inside its own window - deliberately NOT filtered on
     * usage_limit exhaustion here. Exhaustion still blocks a NEW claim
     * (ShopController::claimCoupon checks it directly), but it must not
     * make an exhausted coupon disappear for the one viewer who already
     * claimed it - see ShopController::coupons(), which is where the
     * "already claimed OR still has room" distinction actually belongs
     * (it's relative to the viewer, not a global property of the row).
     */
    public function scopeLive($query)
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }
}
