<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Daily performance rollup (aggregated from ClickHouse). Not FK-constrained by design; the
 * campaign relation is convenience-only and may be null for deleted campaigns.
 */
class AdStatDaily extends Model
{
    protected $table = 'ad_stats_daily';

    protected $fillable = [
        'stat_date', 'ad_account_id', 'campaign_id', 'ad_group_id', 'creative_id',
        'placement', 'country', 'impressions', 'reach', 'clicks', 'conversions', 'spend_cents',
    ];

    protected $casts = [
        'stat_date'   => 'date',
        'impressions' => 'integer',
        'reach'       => 'integer',
        'clicks'      => 'integer',
        'conversions' => 'integer',
        'spend_cents' => 'integer',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(AdCampaign::class, 'campaign_id');
    }
}
