<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A guideline strike or a brand-safety flag against a creator.
 *
 * "Active" means issued, not yet expired, and not cleared by an upheld appeal.
 * The eligibility engine asks only that, which is why `cleared_at` exists: an
 * appeal's own status is a workflow concern, and the engine should never have
 * to interpret one to decide whether someone can earn.
 */
class CreatorStrike extends Model
{
    public const TYPE_GUIDELINE    = 'guideline';
    public const TYPE_BRAND_SAFETY = 'brand_safety';

    /** The spec's window: a strike blocks for 90 days. */
    public const WINDOW_DAYS = 90;

    protected $fillable = [
        'user_id', 'type', 'reason', 'subject_type', 'subject_id',
        'issued_at', 'expires_at', 'appeal_status', 'appeal_note',
        'appealed_at', 'cleared_at', 'issued_by',
    ];

    protected $casts = [
        'issued_at'   => 'datetime',
        'expires_at'  => 'datetime',
        'appealed_at' => 'datetime',
        'cleared_at'  => 'datetime',
    ];

    /** Issued, unexpired, not cleared. */
    public function scopeActive($query)
    {
        return $query->whereNull('cleared_at')->where('expires_at', '>', now());
    }

    /** Issue one, dating the expiry from the policy window. */
    public static function issue(
        int $userId,
        string $reason,
        string $type = self::TYPE_GUIDELINE,
        ?int $byAdminId = null,
    ): self {
        return static::create([
            'user_id'    => $userId,
            'type'       => $type,
            'reason'     => $reason,
            'issued_at'  => now(),
            'expires_at' => now()->addDays(self::WINDOW_DAYS),
            'issued_by'  => $byAdminId,
        ]);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
