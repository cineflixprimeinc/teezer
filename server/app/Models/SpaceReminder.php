<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** "Remind me" on a scheduled Space - one row per person per room. */
class SpaceReminder extends Model
{
    protected $fillable = ['space_id', 'user_id'];

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
