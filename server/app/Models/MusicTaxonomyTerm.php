<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MusicTaxonomyTerm extends Model
{
    public const KINDS = ['genre', 'mood', 'language'];

    protected $fillable = ['kind', 'name', 'sort_order', 'is_active'];

    protected $casts = [
        'is_active'  => 'boolean',
        'sort_order' => 'integer',
    ];

    public function scopeKind($query, string $kind)
    {
        return $query->where('kind', $kind);
    }

    /** Picker order: explicit sort first, then alphabetical for anything unset. */
    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('name');
    }
}
