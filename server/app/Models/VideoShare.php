<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoShare extends Model
{
    public $timestamps = false;
    protected $fillable = ['video_id', 'user_id', 'platform', 'ip_address'];

    public function video() { return $this->belongsTo(Video::class); }
    public function user()  { return $this->belongsTo(User::class); }
}
