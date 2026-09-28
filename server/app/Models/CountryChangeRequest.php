<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CountryChangeRequest extends Model
{
    public const STATUS_PENDING   = 'pending';
    public const STATUS_ELIGIBLE  = 'eligible';
    public const STATUS_APPROVED  = 'approved';
    public const STATUS_REJECTED  = 'rejected';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'user_id',
        'current_country_code',
        'requested_country_code',
        'requested_country_name',
        'status',
        'continuous_detected_days',
        'verification_started_at',
        'eligible_at',
        'approved_at',
        'rejected_reason',
    ];

    protected $casts = [
        'continuous_detected_days' => 'integer',
        'verification_started_at'  => 'datetime',
        'eligible_at'              => 'datetime',
        'approved_at'              => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return in_array($this->status, [self::STATUS_PENDING, self::STATUS_ELIGIBLE], true);
    }
}
