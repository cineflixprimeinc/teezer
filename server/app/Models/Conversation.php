<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Conversation extends Model
{
    protected $fillable = [
        'user_a_id', 'user_b_id',
        'initiated_by', 'received_by',
        'status', 'approved_at',
        'flagged_at', 'report_status', 'risk_level',
        'shadow_restricted', 'dm_restricted', 'message_approval_required',
        'links_disabled', 'media_restricted', 'prevent_new_requests',
        'auto_hide_reported', 'history_archived', 'auto_delete_flagged',
        'admin_closed_at', 'admin_muted_at',
        'restrictions_config', 'admin_note',
    ];

    protected $casts = [
        'approved_at'         => 'datetime',
        'flagged_at'          => 'datetime',
        'admin_closed_at'     => 'datetime',
        'admin_muted_at'      => 'datetime',
        'restrictions_config' => 'array',
    ];

    public function userA(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_a_id');
    }

    public function userB(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_b_id');
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    /**
     * Find or null a conversation for a given pair of user IDs (order-independent).
     */
    public static function forPair(int $userId1, int $userId2): ?self
    {
        return static::where('user_a_id', min($userId1, $userId2))
            ->where('user_b_id', max($userId1, $userId2))
            ->first();
    }
}
