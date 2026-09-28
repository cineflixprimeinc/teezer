<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Gift extends Model
{
    public $timestamps = false;
    protected $fillable = ['slug', 'name', 'icon_url', 'coin_value', 'cash_value', 'sort_order', 'is_active'];

    protected function casts(): array
    {
        return [
            'cash_value' => 'decimal:4',
            'is_active'  => 'boolean',
        ];
    }

    /** The live catalog. Retired gifts stay in the table for gift_transactions history. */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function transactions()
    {
        return $this->hasMany(GiftTransaction::class);
    }
}
