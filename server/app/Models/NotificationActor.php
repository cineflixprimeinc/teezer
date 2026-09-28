<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One (notification ↔ actor) association - the history of every user who
 * triggered an aggregated notification group. UNIQUE(notification_id, actor_id)
 * at the DB level guarantees a user is counted at most once per group.
 */
class NotificationActor extends Model
{
    protected $table = 'notification_actors';
    public $timestamps = false;

    protected $fillable = ['notification_id', 'actor_id', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function notification(): BelongsTo
    {
        return $this->belongsTo(AppNotification::class, 'notification_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
