<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One line in a Space's chat.
 *
 * It belongs to the room, not the seat, so it survives the sender leaving - the
 * transcript is part of the room, and a message from someone who has since
 * dropped out still reads fine.
 */
class SpaceMessage extends Model
{
    protected $fillable = [
        'space_id', 'user_id', 'body', 'is_pinned',
    ];

    protected $casts = [
        'is_pinned' => 'boolean',
    ];

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(SpaceMessageReaction::class, 'message_id');
    }
}
