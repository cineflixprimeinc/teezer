<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserAdminRestriction extends Model
{
    protected $fillable = [
        'user_id', 'restriction_type', 'is_active', 'expires_at', 'reason',
        'created_by_admin_id', 'updated_by_admin_id',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'expires_at' => 'datetime',
    ];

    // Maps restriction_type → UserModerationSetting column name
    public const MOD_COLUMN_MAP = [
        'restrict_uploads'              => 'restrict_uploads',
        'post_approval_required'        => 'post_approval_required',
        'block_live_access'             => 'block_live_access',
        'disable_draft_creation'        => 'disable_drafts',
        'disable_commenting_on_uploads' => 'disable_commenting',
        'disable_commenting_on_others'  => 'disable_commenting_on_others',
        'disable_following_others'      => 'disable_following_others',
    ];

    public static function getActiveForUser(int $userId): array
    {
        return static::where('user_id', $userId)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->get()
            ->keyBy('restriction_type')
            ->toArray();
    }

    public function user()           { return $this->belongsTo(User::class); }
    public function createdByAdmin() { return $this->belongsTo(User::class, 'created_by_admin_id'); }
    public function updatedByAdmin() { return $this->belongsTo(User::class, 'updated_by_admin_id'); }
}
