<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScreenTimeDaily extends Model
{
    protected $table = 'screen_time_daily';

    protected $fillable = [
        'user_id', 'date', 'total_seconds', 'breakdown', 'longest_session_seconds', 'sessions_count',
    ];

    protected function casts(): array
    {
        return [
            'date'      => 'date',
            'breakdown' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
