<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorAnalytic extends Model
{
    public $timestamps = false;
    protected $table = 'creator_analytics';
    protected $fillable = [
        'user_id', 'date', 'views', 'watch_time_mins', 'new_followers', 'lost_followers',
        'likes', 'comments', 'shares', 'saves', 'earnings',
        'profile_views', 'watch_time_secs', 'total_sessions', 'completed_sessions',
        'replayed_sessions', 'followers_snapshot',
    ];

    protected function casts(): array
    {
        return ['date' => 'date', 'earnings' => 'decimal:2'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
