<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoScore extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'video_id', 'score',
        'completion_score', 'rewatch_score', 'like_score',
        'comment_score', 'share_score', 'save_score',
        'follow_score', 'skip_penalty', 'report_penalty',
        'event_count', 'computed_at', 'updated_at',
    ];

    protected function casts(): array
    {
        return [
            'score'            => 'float',
            'completion_score' => 'float',
            'rewatch_score'    => 'float',
            'like_score'       => 'float',
            'comment_score'    => 'float',
            'share_score'      => 'float',
            'save_score'       => 'float',
            'follow_score'     => 'float',
            'skip_penalty'     => 'float',
            'report_penalty'   => 'float',
            'event_count'      => 'integer',
            'computed_at'      => 'datetime',
            'updated_at'       => 'datetime',
        ];
    }

    public function video() { return $this->belongsTo(Video::class); }
}
