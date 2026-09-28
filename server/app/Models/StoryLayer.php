<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StoryLayer extends Model
{
    protected $fillable = [
        'story_id', 'slide_index', 'type', 'text', 'url',
        'mentioned_user_id', 'hashtag', 'location_name',
        'x_percent', 'y_percent', 'scale_value', 'rotation',
        'color', 'font', 'z_index',
    ];

    protected $casts = [
        'x_percent'   => 'float',
        'y_percent'   => 'float',
        'scale_value' => 'float',
        'rotation'    => 'float',
        'z_index'     => 'integer',
        'slide_index' => 'integer',
    ];

    public function story(): BelongsTo
    {
        return $this->belongsTo(Story::class);
    }

    public function mentionedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'mentioned_user_id');
    }
}
