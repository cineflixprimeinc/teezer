<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'video_id', 'user_id', 'session_id', 'event_type', 'payload', 'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'payload'    => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function video() { return $this->belongsTo(Video::class); }
    public function user()  { return $this->belongsTo(User::class);  }

    public static function weights(): array
    {
        return [
            'view_progress'     => 0,  // handled via completion_pct in payload
            'skip'              => -5,
            'rewatch'           => 2,
            'like'              => 3,
            'comment'           => 4,
            'share'             => 6,
            'save'              => 5,
            'follow_from_video' => 8,
            'not_interested'    => -10,
            'report'            => -20,
        ];
    }
}
