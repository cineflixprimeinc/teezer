<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoWatchSession extends Model
{
    protected $fillable = [
        'video_id', 'user_id', 'session_id', 'device_id', 'ip_hash',
        'started_at', 'ended_at', 'watch_seconds', 'max_position',
        'completed', 'replay_count', 'view_counted',
    ];

    protected function casts(): array
    {
        return [
            'started_at'   => 'datetime',
            'ended_at'     => 'datetime',
            'completed'    => 'boolean',
            'view_counted' => 'boolean',
        ];
    }

    public function video() { return $this->belongsTo(Video::class); }
    public function user()  { return $this->belongsTo(User::class); }
}
