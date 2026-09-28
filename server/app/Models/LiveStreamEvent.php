<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The control audit trail - who turned what, and when. Append-only. */
class LiveStreamEvent extends Model
{
    public $timestamps = false;

    protected $fillable = ['live_stream_id', 'actor_id', 'action', 'meta', 'created_at'];

    protected function casts(): array { return ['meta' => 'array', 'created_at' => 'datetime']; }

    public function stream() { return $this->belongsTo(LiveStream::class, 'live_stream_id'); }
    public function actor()  { return $this->belongsTo(User::class, 'actor_id'); }
}
