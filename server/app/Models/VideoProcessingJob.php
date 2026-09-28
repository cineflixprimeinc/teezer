<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per transcoding-provider attempt for a video. See the migration's
 * own doc comment (2026_08_31_000001) for why this is separate from
 * hls_status/hls_master_key/hls_ready_at on Video - those stay the single
 * source of truth for playback readiness; this table is orchestration-only.
 */
class VideoProcessingJob extends Model
{
    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_TRANSFERRING = 'transferring';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'video_id', 'provider', 'provider_job_id', 'status', 'attempt',
        'requested_outputs', 'started_at', 'completed_at', 'failed_at',
        'fallback_started_at', 'fallback_completed_at',
        'error_code', 'error_message',
    ];

    protected function casts(): array
    {
        return [
            'requested_outputs' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'failed_at' => 'datetime',
            'fallback_started_at' => 'datetime',
            'fallback_completed_at' => 'datetime',
        ];
    }

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }
}
