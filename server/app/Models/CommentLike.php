<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommentLike extends Model
{
    public $timestamps = false;
    protected $fillable = ['comment_id', 'user_id'];

    public function comment() { return $this->belongsTo(VideoComment::class, 'comment_id'); }
    public function user()    { return $this->belongsTo(User::class); }
}
