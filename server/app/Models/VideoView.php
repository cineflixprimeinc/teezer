<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoView extends Model
{
    public $timestamps = false;
    protected $fillable = ['video_id', 'user_id', 'ip_address', 'watch_duration', 'source', 'country', 'city', 'device_type'];

    public function video() { return $this->belongsTo(Video::class); }
    public function user()  { return $this->belongsTo(User::class); }
}
