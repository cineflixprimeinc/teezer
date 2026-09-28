<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AudioTrack extends Model
{
    protected $fillable = [
        'title', 'artist', 'cover_url', 'audio_url',
        'duration', 'usage_count', 'is_original', 'user_id',
        'mood', 'genre', 'usage_rights',
    ];

    protected function casts(): array
    {
        return ['is_original' => 'boolean'];
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function videos()
    {
        return $this->hasMany(Video::class);
    }

    public function favorites()
    {
        return $this->hasMany(AudioFavorite::class);
    }

    public function scopeTrending($query)
    {
        return $query->orderByDesc('usage_count');
    }
}
