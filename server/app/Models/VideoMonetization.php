<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VideoMonetization extends Model
{
    protected $table = 'video_monetization';

    protected $fillable = [
        'video_id',
        'eligibility_status',
        'review_status',
        'reviewed_on',
        'next_review',
        'ad_revenue_sharing',
        'creator_fund_active',
        'tips_gifts_enabled',
        'subscriptions_eligible',
        'brand_partnerships_eligible',
        'shop_product_tagging',
        'paid_promotion_disclosure',
        'affiliate_links_enabled',
        'brand_deals_allowed',
        'auto_claim_brand_mentions',
        'total_earnings',
        'rpm',
        'cpm',
        'revenue',
        'next_payout',
        'payout_date',
        'payout_method',
        'payout_currency',
        'payout_status',
        'allowed_regions',
        'blocked_regions',
        'policy_status',
        'monetization_notes',
    ];

    protected function casts(): array
    {
        return [
            'ad_revenue_sharing'          => 'boolean',
            'creator_fund_active'         => 'boolean',
            'tips_gifts_enabled'          => 'boolean',
            'subscriptions_eligible'      => 'boolean',
            'brand_partnerships_eligible' => 'boolean',
            'shop_product_tagging'        => 'boolean',
            'affiliate_links_enabled'     => 'boolean',
            'brand_deals_allowed'         => 'boolean',
            'auto_claim_brand_mentions'   => 'boolean',
            'reviewed_on'                 => 'datetime',
            'next_review'                 => 'datetime',
            'payout_date'                 => 'datetime',
            'allowed_regions'             => 'array',
            'blocked_regions'             => 'array',
        ];
    }

    public function video()
    {
        return $this->belongsTo(Video::class);
    }
}
