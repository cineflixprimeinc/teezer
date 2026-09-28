<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One user claiming one ShopCoupon - see the migration's doc comment for
 *  why this is a claim, not a checkout redemption. No `updated_at` (see
 *  migration - `created_at` only, a claim is never edited). */
class ShopCouponClaim extends Model
{
    public $timestamps = false;

    protected $fillable = ['shop_coupon_id', 'user_id', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(ShopCoupon::class, 'shop_coupon_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
