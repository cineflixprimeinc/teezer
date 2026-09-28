<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AudioFavorite extends Model
{
    protected $fillable = ['user_id', 'audio_track_id'];

    public function track()
    {
        return $this->belongsTo(AudioTrack::class, 'audio_track_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
