<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StoryMedia extends Model
{
    protected $fillable = [
        'story_id', 'media_type', 'source_type', 'shared_video_id',
        'media_url', 'thumbnail_url', 'duration_seconds', 'order_index', 'metadata',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public function story() { return $this->belongsTo(Story::class); }
}
