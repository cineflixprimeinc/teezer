<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Playlist extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id', 'title', 'description', 'cover_url',
        'type', 'is_active', 'sort_order', 'videos_count',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function videos()
    {
        return $this->belongsToMany(Video::class, 'playlist_videos')
            ->withPivot('sort_order')
            ->withTimestamps()
            ->orderByPivot('sort_order');
    }
}
