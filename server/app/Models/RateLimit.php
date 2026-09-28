<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RateLimit extends Model
{
    protected $fillable = [
        'identifier',
        'identifier_type',
        'action_type',
        'attempt_count',
        'window_start',
        'blocked_until',
        'block_level',
    ];

    protected function casts(): array
    {
        return [
            'window_start' => 'datetime',
            'blocked_until' => 'datetime',
            'attempt_count' => 'integer',
            'block_level' => 'integer',
        ];
    }
}
