<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MediaModeration extends Model
{
    protected $table = 'media_moderation';

    protected $fillable = [
        'content_id', 'user_id', 'content_type', 'file_key',
        'scan_status',
        'nudity_detected', 'nudity_score', 'nsfw_score',
        'detected_labels_json', 'scanned_frames_count', 'highest_risk_timestamp',
        'decision', 'reason',
        'model_name', 'model_version', 'scanned_at',
        'admin_review_status', 'admin_reviewed_by', 'admin_reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'nudity_detected'         => 'boolean',
            'nudity_score'            => 'float',
            'nsfw_score'              => 'float',
            'detected_labels_json'    => 'array',
            'highest_risk_timestamp'  => 'float',
            'scanned_at'              => 'datetime',
            'admin_reviewed_at'       => 'datetime',
        ];
    }

    public function adminReviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_reviewed_by');
    }

    public function scopePending($query)
    {
        return $query->where('decision', 'pending_review')->whereNull('admin_review_status');
    }

    public function scopeApproved($query)
    {
        return $query->where('decision', 'approved');
    }

    public function scopeRejected($query)
    {
        return $query->where('decision', 'rejected');
    }
}
