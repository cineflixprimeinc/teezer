<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BlockedUser extends Model
{
    protected $table = 'blocked_users';

    protected $fillable = ['blocker_id', 'blocked_id'];

    public function blocker()
    {
        return $this->belongsTo(User::class, 'blocker_id');
    }

    public function blocked()
    {
        return $this->belongsTo(User::class, 'blocked_id');
    }

    /**
     * Does a block exist between these two users in EITHER direction?
     *
     * Blocking is symmetric in what it hides: whether A blocked B or B blocked
     * A, neither should reach the other. Several call sites (FollowController,
     * MessageController, StoryController, FeedService, MentionController) each
     * spell this pair of conditions out by hand; this is the one shared
     * expression of it, used by NotificationService so no notification is
     * created across a block in either direction.
     */
    public static function existsBetween(?int $a, ?int $b): bool
    {
        if ($a === null || $b === null || $a === $b) {
            return false;
        }

        return static::query()
            ->where(fn ($q) => $q->where('blocker_id', $a)->where('blocked_id', $b))
            ->orWhere(fn ($q) => $q->where('blocker_id', $b)->where('blocked_id', $a))
            ->exists();
    }
}
