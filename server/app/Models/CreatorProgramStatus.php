<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A creator's persisted standing on one monetization programme.
 *
 * A snapshot, never the authority - see the migration and
 * MonetizationEligibilityService for why. Read it for history and for lists;
 * measure for anything that decides whether money may move.
 */
class CreatorProgramStatus extends Model
{
    protected $table = 'creator_program_status';

    protected $fillable = [
        'user_id', 'program_key', 'status', 'met_count', 'total_count',
        'percent', 'unlocked_at', 'suspended_at', 'evaluated_at',
        'consecutive_failed_months', 'last_month_key', 'enrolment_removed_at', 'reenrol_after',
    ];

    protected $casts = [
        'met_count'    => 'integer',
        'total_count'  => 'integer',
        'percent'      => 'integer',
        'unlocked_at'  => 'datetime',
        'suspended_at' => 'datetime',
        'evaluated_at' => 'datetime',
        'enrolment_removed_at' => 'datetime',
        'reenrol_after' => 'datetime',
        'consecutive_failed_months' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** Creators currently active on a programme. */
    public function scopeActiveOn($query, string $programKey)
    {
        return $query->where('program_key', $programKey)->where('status', 'active');
    }
}
