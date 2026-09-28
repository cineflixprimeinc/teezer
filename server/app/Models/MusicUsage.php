<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MusicUsage extends Model
{
    public $timestamps = false;

    protected $table = 'music_usage';

    protected $fillable = ['track_id', 'user_id', 'content_id', 'content_type', 'used_at'];

    protected $casts = ['used_at' => 'datetime'];

    public function track(): BelongsTo
    {
        return $this->belongsTo(MusicTrack::class, 'track_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
