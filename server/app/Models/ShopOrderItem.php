<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopOrderItem extends Model
{
    protected $fillable = [
        'order_id', 'product_id', 'product_name', 'unit_price', 'quantity', 'variation', 'line_total',
    ];

    protected function casts(): array
    {
        return [
            'unit_price'  => 'decimal:2',
            'quantity'    => 'integer',
            'variation'   => 'array',
            'line_total'  => 'decimal:2',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(ShopOrder::class, 'order_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
