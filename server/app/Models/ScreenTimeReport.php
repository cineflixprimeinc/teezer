<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScreenTimeReport extends Model
{
    protected $fillable = [
        'user_id', 'period_type', 'period_start', 'period_end', 'data',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end'   => 'date',
            'data'         => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
