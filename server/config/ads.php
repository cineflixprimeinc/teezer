<?php

/**
 * Ads System configuration. Nothing reads this until Phase 4 — feed insertion is gated by
 * `ads.enabled`, which ships OFF so the live feed is byte-identical until explicitly enabled.
 */
return [

    // Master kill switch for feed ad insertion. OFF by default.
    'enabled' => env('ADS_ENABLED', false),

    // 'manual' = admin approves each campaign; 'auto' = auto-approve after creative moderation.
    'review_mode' => env('ADS_REVIEW_MODE', 'manual'),

    'default_currency' => env('ADS_CURRENCY', 'USD'),

    // In-feed insertion cadence (overridable per placement row in ad_placements).
    'in_feed' => [
        'first_slot' => (int) env('ADS_INFEED_FIRST_SLOT', 4),
        'cadence'    => (int) env('ADS_INFEED_CADENCE', 6),
    ],

    // Per-viewer frequency capping.
    'frequency_cap' => [
        'per_session' => (int) env('ADS_FREQCAP_SESSION', 3),
        'per_day'     => (int) env('ADS_FREQCAP_DAY', 8),
    ],

    // Economics (integer cents / percentages).
    'floor_cpm_cents'         => (int) env('ADS_FLOOR_CPM_CENTS', 50),
    'min_daily_budget_cents'  => (int) env('ADS_MIN_DAILY_BUDGET_CENTS', 100),
    'revenue_share_pct'       => (int) env('ADS_REVENUE_SHARE_PCT', 50), // creator share of boosted-video ad revenue
    'platform_commission_pct' => (int) env('ADS_PLATFORM_COMMISSION_PCT', 30),

    // Viewability: an impression only bills after this dwell (ms) at >= 50% on-screen.
    'viewable_ms' => (int) env('ADS_VIEWABLE_MS', 1000),

    // HMAC secret for signed impression/click tokens (set in prod env).
    'signing_secret' => env('ADS_SIGNING_SECRET'),

    // Invalid-traffic / click-fraud guard on the ad-events beacon. Cheap Redis
    // velocity + heuristics; a blocked event is recorded and never billed.
    'fraud' => [
        'enabled'               => (bool) env('ADS_FRAUD_ENABLED', true),
        'block_score'           => (int) env('ADS_FRAUD_BLOCK_SCORE', 70),
        'flag_score'            => (int) env('ADS_FRAUD_FLAG_SCORE', 40),
        // Per-identity (user / device / session / ip) event ceilings.
        'impression_per_min'    => (int) env('ADS_FRAUD_IMPR_PER_MIN', 40),
        'click_per_min'         => (int) env('ADS_FRAUD_CLICK_PER_MIN', 12),
        'conversion_per_min'    => (int) env('ADS_FRAUD_CONV_PER_MIN', 6),
        'click_per_campaign_5m' => (int) env('ADS_FRAUD_CLICK_PER_CAMP_5M', 8),
    ],
];
