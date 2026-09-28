<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A timeout and a ban are one row: a ban is a timeout with no `expires_at`. */
class LiveStreamBan extends Model
{
    protected $fillable = ['live_stream_id', 'user_id', 'issued_by', 'reason', 'expires_at'];

    protected function casts(): array { return ['expires_at' => 'datetime']; }

    public function stream() { return $this->belongsTo(LiveStream::class, 'live_stream_id'); }
    public function user()   { return $this->belongsTo(User::class); }
}
