<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The Shop marketplace home's promo carousel - see the migration that
 * created this table for why it's a standalone table, not tied to any
 * shop/product.
 */
class ShopPromoBanner extends Model
{
    protected $fillable = [
        'title', 'subtitle', 'description', 'image_url',
        'gradient_start', 'gradient_end', 'cta_label', 'cta_link',
        'is_active', 'sort_order', 'starts_at', 'ends_at',
    ];

    protected function casts(): array
    {
        return [
            'is_active'  => 'boolean',
            'sort_order' => 'integer',
            'starts_at'  => 'datetime',
            'ends_at'    => 'datetime',
        ];
    }

    /** Active AND inside its own time window (open-ended sides included). */
    public function scopeLive($query)
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }

    public function toClientArray(): array
    {
        return [
            'id'             => $this->id,
            'title'          => $this->title,
            'subtitle'       => $this->subtitle,
            'description'    => $this->description,
            'image_url'      => $this->image_url ? \Illuminate\Support\Facades\Storage::url($this->image_url) : null,
            'gradient_start' => $this->gradient_start,
            'gradient_end'   => $this->gradient_end,
            'cta_label'      => $this->cta_label,
            'cta_link'       => $this->cta_link,
        ];
    }
}
