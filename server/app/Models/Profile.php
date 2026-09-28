<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    protected $fillable = [
        'user_id', 'location', 'website', 'joined_label', 'category',
        'creator_badge', 'total_followers', 'total_following',
        'total_likes', 'total_videos', 'profile_views',
    ];

    protected function casts(): array
    {
        return [
            'total_followers' => 'integer',
            'total_following' => 'integer',
            'total_likes'     => 'integer',
            'total_videos'    => 'integer',
            'profile_views'   => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
