<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AdGroup extends Model
{
    protected $fillable = [
        'campaign_id', 'name', 'status',
        'placements', 'targeting',
        'optimization_goal', 'bid_type', 'bid_cents', 'daily_budget_cents', 'meta',
    ];

    protected $casts = [
        'placements'         => 'array',
        'targeting'          => 'array',
        'bid_cents'          => 'integer',
        'daily_budget_cents' => 'integer',
        'meta'               => 'array',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(AdCampaign::class, 'campaign_id');
    }

    public function creatives(): HasMany
    {
        return $this->hasMany(AdCreative::class, 'ad_group_id');
    }
}
