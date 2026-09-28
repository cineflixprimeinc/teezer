<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One viewing session. `left_at` closes it, so presence is a query, not a counter. */
class LiveStreamViewer extends Model
{
    public $timestamps = false;

    protected $fillable = ['live_stream_id', 'user_id', 'guest_key', 'joined_at', 'left_at', 'watch_seconds'];

    protected function casts(): array
    {
        return ['joined_at' => 'datetime', 'left_at' => 'datetime', 'watch_seconds' => 'integer'];
    }

    public function stream() { return $this->belongsTo(LiveStream::class, 'live_stream_id'); }
    public function user()   { return $this->belongsTo(User::class); }
}
