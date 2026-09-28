<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A platform-wide variation preset (Size: S/M/L/XL, Color: Black/White/Red...)
 * offered as a dropdown on Add Product's "Add Variation" sheet - admin-
 * manageable the same way ShopCategory is, one global list every seller
 * draws from. Picking one is a shortcut into the same free-text
 * name/options fields the sheet always had, never a replacement for them.
 */
class ProductVariationType extends Model
{
    protected $fillable = ['name', 'slug', 'options', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'options'    => 'array',
            'is_active'  => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }

    public function toClientArray(): array
    {
        return [
            'id'      => $this->id,
            'name'    => $this->name,
            'options' => $this->options ?? [],
        ];
    }
}
