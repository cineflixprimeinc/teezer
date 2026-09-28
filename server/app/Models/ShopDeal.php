<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One "deal of the day" - an admin-picked, real, existing Product with a
 * deal price + time window. See the migration for why this points at a
 * real product rather than inventing one.
 */
class ShopDeal extends Model
{
    protected $fillable = [
        'product_id', 'deal_price', 'discount_percent',
        'is_active', 'sort_order', 'starts_at', 'ends_at',
    ];

    protected function casts(): array
    {
        return [
            'deal_price'       => 'decimal:2',
            'discount_percent' => 'integer',
            'is_active'        => 'boolean',
            'sort_order'       => 'integer',
            'starts_at'        => 'datetime',
            'ends_at'          => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Active AND inside its own time window, AND the product itself is
     *  still a real, live listing - a deal must never outlive what it
     *  points at. */
    public function scopeLive($query)
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->whereHas('product', fn ($q) => $q->where('is_active', true));
    }
}
