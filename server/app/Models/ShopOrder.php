<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One purchase against a Shop, paid in the product's own currency (never
 * Reelsoo Coins) - see the 2026_08_19_000007 migration's own docblock for why
 * this is a parallel system to CoinOrder rather than built on it.
 */
class ShopOrder extends Model
{
    public const STATUS_PENDING     = 'pending';
    public const STATUS_PAID        = 'paid';
    public const STATUS_COD_PENDING = 'cod_pending';
    public const STATUS_FULFILLED   = 'fulfilled';
    public const STATUS_CANCELLED   = 'cancelled';
    public const STATUS_FAILED      = 'failed';

    public const METHOD_STRIPE   = 'stripe';
    public const METHOD_RAZORPAY = 'razorpay';
    public const METHOD_COD      = 'cod';

    /** Statuses that mean "money has actually settled" - used to gate seller crediting. */
    public const SETTLED_STATUSES = [self::STATUS_PAID, self::STATUS_FULFILLED];

    protected $fillable = [
        'shop_id', 'buyer_id', 'status', 'payment_method', 'payment_reference',
        'payment_meta', 'currency', 'subtotal', 'commission_rate', 'commission_amount',
        'net_amount', 'shipping_address', 'buyer_note', 'paid_at', 'fulfilled_at',
    ];

    protected function casts(): array
    {
        return [
            'payment_meta'      => 'array',
            'shipping_address'  => 'array',
            'subtotal'          => 'decimal:2',
            'commission_rate'   => 'decimal:2',
            'commission_amount' => 'decimal:2',
            'net_amount'        => 'decimal:2',
            'paid_at'           => 'datetime',
            'fulfilled_at'      => 'datetime',
        ];
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function buyer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'buyer_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ShopOrderItem::class, 'order_id');
    }
}
