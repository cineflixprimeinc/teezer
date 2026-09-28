<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Hashtag extends Model
{
    protected $fillable = ['name', 'videos_count'];

    protected function casts(): array
    {
        return [
            'is_blocked'  => 'boolean',
            'is_featured' => 'boolean',
            'blocked_at'  => 'datetime',
        ];
    }

    /** Tags allowed to surface in discovery. */
    public function scopeVisible($query)
    {
        return $query->where('is_blocked', false);
    }

    public function videos()
    {
        return $this->belongsToMany(Video::class, 'video_hashtags');
    }

    public function scopeTrending($query)
    {
        return $query->orderByDesc('videos_count');
    }
}
