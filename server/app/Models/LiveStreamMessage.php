<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A line of live chat. Removal is soft (`removed_at`) so moderation is auditable. */
class LiveStreamMessage extends Model
{
    protected $fillable = ['live_stream_id', 'user_id', 'body', 'gift_coins', 'is_pinned', 'removed_by', 'removed_at'];

    protected function casts(): array
    {
        return ['is_pinned' => 'boolean', 'removed_at' => 'datetime', 'gift_coins' => 'integer'];
    }

    public function stream() { return $this->belongsTo(LiveStream::class, 'live_stream_id'); }
    public function user()   { return $this->belongsTo(User::class); }
}
