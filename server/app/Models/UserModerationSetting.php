<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserModerationSetting extends Model
{
    protected $fillable = [
        'user_id', 'restrict_uploads', 'post_approval_required',
        'block_live_access', 'disable_drafts', 'disable_commenting',
        'disable_commenting_on_others', 'disable_following_others',
        'daily_upload_limit', 'nsfw_review_required', 'copyright_hold',
        'upload_suspension_until', 'shadowban', 'temporary_suspension',
        'temporary_suspension_until',
        'warning_level', 'content_review_mode', 'comment_moderation',
        'message_monitoring', 'strike_count', 'last_warning_at',
        'last_strike_at', 'last_appeal_at', 'appeal_status',
        // Safety preferences
        'allow_dm', 'allow_mentions', 'content_filter',
        'sensitive_filter', 'activity_visibility',
    ];

    protected $casts = [
        'restrict_uploads'        => 'boolean',
        'post_approval_required'  => 'boolean',
        'block_live_access'       => 'boolean',
        'disable_drafts'               => 'boolean',
        'disable_commenting'           => 'boolean',
        'disable_commenting_on_others' => 'boolean',
        'disable_following_others'     => 'boolean',
        'nsfw_review_required'    => 'boolean',
        'copyright_hold'          => 'boolean',
        'shadowban'               => 'boolean',
        'temporary_suspension'    => 'boolean',
        'message_monitoring'      => 'boolean',
        'sensitive_filter'        => 'boolean',
        'upload_suspension_until'          => 'datetime',
        'temporary_suspension_until'       => 'datetime',
        'last_warning_at'         => 'datetime',
        'last_strike_at'          => 'datetime',
        'last_appeal_at'          => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }

    public static function forUser(int $userId): self
    {
        return self::firstOrCreate(['user_id' => $userId]);
    }
}
