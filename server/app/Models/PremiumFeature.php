<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One card in the premium page's "WHAT YOU GET" grid. */
class PremiumFeature extends Model
{
    protected $fillable = ['icon', 'title', 'description', 'badge', 'sort', 'is_enabled'];

    protected function casts(): array
    {
        return ['is_enabled' => 'boolean'];
    }

    public function scopeEnabled($query)
    {
        return $query->where('is_enabled', true);
    }
}
