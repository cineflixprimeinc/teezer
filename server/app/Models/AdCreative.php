<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdCreative extends Model
{
    protected $fillable = [
        'ad_group_id', 'video_id', 'type',
        'asset_key', 'media_url', 'thumbnail_url', 'duration', 'width', 'height',
        'headline', 'body', 'cta_type', 'destination_url', 'display_name',
        'review_status', 'moderation', 'rejection_reason', 'meta',
    ];

    protected $casts = [
        'moderation' => 'array',
        'meta'       => 'array',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(AdGroup::class, 'ad_group_id');
    }

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }
}
