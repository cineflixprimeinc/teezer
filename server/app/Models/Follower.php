<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Follower extends Model
{
    public $timestamps = false;

    protected $fillable = ['follower_id', 'following_id', 'status', 'notify_posts'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime', 'notify_posts' => 'boolean'];
    }

    public function follower()
    {
        return $this->belongsTo(User::class, 'follower_id');
    }

    public function following()
    {
        return $this->belongsTo(User::class, 'following_id');
    }
}
