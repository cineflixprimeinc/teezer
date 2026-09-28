<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopReview extends Model
{
    protected $fillable = ['shop_id', 'user_id', 'rating', 'comment', 'seller_reply', 'seller_reply_at'];

    protected function casts(): array
    {
        return ['rating' => 'integer', 'seller_reply_at' => 'datetime'];
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected static function booted(): void
    {
        static::saved(fn (ShopReview $review) => $review->shop?->refreshRatingAggregate());
        static::deleted(fn (ShopReview $review) => $review->shop?->refreshRatingAggregate());
    }
}
