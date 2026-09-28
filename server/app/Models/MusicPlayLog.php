<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MusicPlayLog extends Model
{
    public $timestamps = false;

    protected $table = 'music_play_logs';

    protected $fillable = ['track_id', 'user_id', 'source', 'played_at'];

    protected $casts = ['played_at' => 'datetime'];

    public function track(): BelongsTo
    {
        return $this->belongsTo(MusicTrack::class, 'track_id');
    }
}
