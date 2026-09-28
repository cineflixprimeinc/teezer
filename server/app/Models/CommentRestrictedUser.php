<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Per-creator block list. When a creator "restricts" a commenter from the
 * Studio comments inbox, a row is added here. Their existing comments on the
 * creator's content are hidden, and CommentController@store blocks new ones.
 */
class CommentRestrictedUser extends Model
{
    protected $fillable = ['creator_id', 'user_id'];

    public function creator() { return $this->belongsTo(User::class, 'creator_id'); }
    public function user()    { return $this->belongsTo(User::class, 'user_id'); }

    public static function isRestricted(int $creatorId, int $userId): bool
    {
        return self::where('creator_id', $creatorId)->where('user_id', $userId)->exists();
    }
}
