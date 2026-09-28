<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommentReport extends Model
{
    protected $fillable = [
        'comment_id', 'video_id', 'reporter_user_id', 'comment_owner_id',
        'reason', 'details', 'evidence_keys', 'status',
    ];

    protected function casts(): array
    {
        return ['evidence_keys' => 'array'];
    }

    public function comment()  { return $this->belongsTo(VideoComment::class, 'comment_id'); }
    public function reporter() { return $this->belongsTo(User::class, 'reporter_user_id'); }
}
