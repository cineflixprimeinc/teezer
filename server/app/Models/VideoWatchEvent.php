<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoWatchEvent extends Model
{
    public $timestamps = false;
    const  CREATED_AT  = 'created_at';
    const  UPDATED_AT  = null;

    protected $fillable = [
        'session_id', 'video_id', 'user_id', 'event_type', 'current_time', 'watched_delta',
    ];
}
