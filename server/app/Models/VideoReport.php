<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoReport extends Model
{
    public $timestamps = false;
    protected $fillable = ['video_id', 'reporter_id', 'reason', 'description', 'evidence_keys', 'status', 'reviewed_by', 'reviewed_at'];

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime', 'evidence_keys' => 'array'];
    }

    public function video()      { return $this->belongsTo(Video::class); }
    public function reporter()   { return $this->belongsTo(User::class, 'reporter_id'); }
    public function reviewer()   { return $this->belongsTo(User::class, 'reviewed_by'); }
}
