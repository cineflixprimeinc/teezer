<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MusicFavorite extends Model
{
    protected $fillable = ['user_id', 'music_track_id'];

    public function track(): BelongsTo
    {
        return $this->belongsTo(MusicTrack::class, 'music_track_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
