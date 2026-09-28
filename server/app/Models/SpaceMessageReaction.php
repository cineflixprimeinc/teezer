<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One person's emoji on one chat message. Unique per (message, user, emoji) -
 * see the migration - so tapping the same reaction twice toggles it rather than
 * counting twice.
 */
class SpaceMessageReaction extends Model
{
    protected $fillable = [
        'message_id', 'user_id', 'emoji',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(SpaceMessage::class, 'message_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
