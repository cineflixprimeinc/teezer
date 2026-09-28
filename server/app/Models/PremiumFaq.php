<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One question in the premium page's QUESTIONS accordion. */
class PremiumFaq extends Model
{
    protected $fillable = ['question', 'answer', 'sort', 'is_enabled'];

    protected function casts(): array
    {
        return ['is_enabled' => 'boolean'];
    }

    public function scopeEnabled($query)
    {
        return $query->where('is_enabled', true);
    }
}
