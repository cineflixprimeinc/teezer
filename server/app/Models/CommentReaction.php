<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommentReaction extends Model
{
    protected $fillable = ['comment_id', 'user_id', 'reaction_type'];

    public function comment() { return $this->belongsTo(VideoComment::class, 'comment_id'); }
    public function user()    { return $this->belongsTo(User::class); }
}
