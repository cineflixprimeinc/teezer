<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Someone the host promoted to moderate. The host is implicit and never listed. */
class LiveStreamModerator extends Model
{
    protected $fillable = ['live_stream_id', 'user_id', 'added_by'];

    public function stream() { return $this->belongsTo(LiveStream::class, 'live_stream_id'); }
    public function user()   { return $this->belongsTo(User::class); }
}
