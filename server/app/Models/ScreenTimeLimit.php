<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScreenTimeLimit extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'daily_limit_enabled'            => 'boolean',
            'break_enabled'                  => 'boolean',
            'bedtime_enabled'                => 'boolean',
            'bedtime_disable_feed'           => 'boolean',
            'bedtime_disable_live'           => 'boolean',
            'bedtime_disable_audio'          => 'boolean',
            'bedtime_disable_upload'         => 'boolean',
            'bedtime_mute_notifications'     => 'boolean',
            'focus_hide_notifications'       => 'boolean',
            'focus_disable_infinite_scroll'  => 'boolean',
            'focus_disable_autoplay'         => 'boolean',
            'focus_hide_recommended'         => 'boolean',
            'focus_pause_messages'           => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
