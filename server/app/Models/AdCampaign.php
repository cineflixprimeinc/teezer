<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AdCampaign extends Model
{
    protected $fillable = [
        'ad_account_id', 'promotion_id', 'name', 'objective', 'status',
        'budget_type', 'daily_budget_cents', 'total_budget_cents', 'spent_cents', 'currency',
        'bid_strategy', 'pacing', 'start_at', 'end_at',
        'submitted_at', 'reviewed_at', 'reviewed_by', 'rejection_reason', 'meta',
    ];

    protected $casts = [
        'daily_budget_cents' => 'integer',
        'total_budget_cents' => 'integer',
        'spent_cents'        => 'integer',
        'start_at'           => 'datetime',
        'end_at'             => 'datetime',
        'submitted_at'       => 'datetime',
        'reviewed_at'        => 'datetime',
        'meta'               => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(AdAccount::class, 'ad_account_id');
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function groups(): HasMany
    {
        return $this->hasMany(AdGroup::class, 'campaign_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
