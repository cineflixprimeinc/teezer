<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Idempotency ledger for provider webhooks - see the migration's own doc
 * comment (2026_08_31_000002). The unique(provider, dedup_key) constraint is
 * the actual mechanism; this model exists mostly to make inserting into it
 * (and catching the duplicate) ergonomic from the webhook controller.
 */
class VideoProcessingWebhookEvent extends Model
{
    protected $fillable = [
        'provider', 'dedup_key', 'video_processing_job_id', 'payload', 'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'processed_at' => 'datetime',
        ];
    }

    public function job(): BelongsTo
    {
        return $this->belongsTo(VideoProcessingJob::class, 'video_processing_job_id');
    }
}
