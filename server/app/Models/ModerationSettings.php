<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class ModerationSettings extends Model
{
    protected $fillable = [
        'nsfw_pending_threshold',
        'nsfw_reject_threshold',
        'nudity_pending_threshold',
        'nudity_reject_threshold',
        'video_default_frame_interval_seconds',
        'video_default_scan_duration_seconds',
        'video_full_scan_frame_interval_seconds',
        'auto_reject_enabled',
        'admin_review_required_for_high_risk',
        'moderation_enabled',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'nsfw_pending_threshold'                 => 'float',
            'nsfw_reject_threshold'                  => 'float',
            'nudity_pending_threshold'               => 'float',
            'nudity_reject_threshold'                => 'float',
            'auto_reject_enabled'                    => 'boolean',
            'admin_review_required_for_high_risk'    => 'boolean',
            'moderation_enabled'                     => 'boolean',
        ];
    }

    private const CACHE_KEY = 'moderation_settings';
    private const CACHE_TTL = 300; // 5 min

    public static function current(): self
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
            return self::firstOrCreate([], [
                'nsfw_pending_threshold'                  => 0.65,
                'nsfw_reject_threshold'                   => 0.85,
                'nudity_pending_threshold'                => 0.65,
                'nudity_reject_threshold'                 => 0.85,
                'video_default_frame_interval_seconds'    => 2,
                'video_default_scan_duration_seconds'     => 120,
                'video_full_scan_frame_interval_seconds'  => 1,
                'auto_reject_enabled'                     => true,
                'admin_review_required_for_high_risk'     => true,
                'moderation_enabled'                      => true,
            ]);
        });
    }

    public static function bust(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
