<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    /** What the storefront's sort dropdown can order by - see ShopController::products(). */
    public const SORTS = ['recommended', 'best_sellers', 'new_arrivals', 'price_asc', 'price_desc'];

    /** Badge ribbon shown on the product card image, if any. */
    public const BADGES = ['bestseller', 'new'];

    protected $fillable = [
        'shop_id', 'collection_id', 'category_id', 'name', 'description', 'sku',
        'price', 'compare_at_price', 'currency', 'image_url', 'images',
        'badge', 'colors', 'variations', 'stock', 'shipping_type', 'is_digital',
        'allow_cod', 'is_active', 'sort_order', 'low_stock_threshold',
    ];

    protected function casts(): array
    {
        return [
            'price'            => 'decimal:2',
            'compare_at_price' => 'decimal:2',
            'rating_avg'       => 'float',
            'rating_count'     => 'integer',
            'sold_count'       => 'integer',
            'stock'            => 'integer',
            'colors'           => 'array',
            'images'           => 'array',
            'variations'       => 'array',
            'is_digital'       => 'boolean',
            'allow_cod'        => 'boolean',
            'is_active'        => 'boolean',
            'sort_order'       => 'integer',
            'low_stock_threshold' => 'integer',
        ];
    }

    /** stock is at or below the seller's own low_stock_threshold - see the 2026_08_25_000003 migration. Zero stock always counts as low. */
    public function isLowStock(): bool
    {
        return $this->stock <= $this->low_stock_threshold;
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function collection(): BelongsTo
    {
        return $this->belongsTo(ProductCollection::class, 'collection_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ShopCategory::class, 'category_id');
    }
}
