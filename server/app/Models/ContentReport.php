<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A report against something that isn't a video, comment, or story - a
 * user profile, a DM conversation, a live stream, or a Space. See the
 * migration's own comment for why this is one polymorphic table rather
 * than four near-identical ones, and why it's a separate table from
 * video_reports/comment_reports/story_reports rather than a merge.
 */
class ContentReport extends Model
{
    public const TYPE_USER         = 'user';
    public const TYPE_CONVERSATION = 'conversation';
    public const TYPE_LIVE_STREAM  = 'live_stream';
    public const TYPE_SPACE        = 'space';

    protected $fillable = [
        'reportable_type', 'reportable_id', 'reporter_id',
        'reason', 'details', 'evidence_keys',
        'status', 'reviewed_by', 'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'evidence_keys' => 'array',
            'reviewed_at'   => 'datetime',
        ];
    }

    public function reporter() { return $this->belongsTo(User::class, 'reporter_id'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }

    public function scopeType(\Illuminate\Database\Eloquent\Builder $q, string $type): \Illuminate\Database\Eloquent\Builder
    {
        return $q->where('reportable_type', $type);
    }
}
