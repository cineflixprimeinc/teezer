<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Promotion extends Model
{
    protected $fillable = [
        'user_id', 'video_id',
        'objective',
        // "More Followers" flow: promote a profile or up to 3 videos + a follow-card label.
        'promote_target', 'promoted_video_ids', 'follow_button_text',
        // "More Video Views" flow: optimization goal / play behaviour / sound / tracking.
        'video_settings',
        // "Messages" flow: greeting / quick replies / action button.
        'message_settings',
        // "App Installs" flow: app source / store URLs / platforms / deep link / ad copy.
        'app_settings',
        // "More Engagement" flow: optimize-for + engagement style.
        'engagement_settings',
        // "Sales / Conversions" flow: conversion location/event/value + tracking.
        'conversion_settings',
        // Creative copy for the in-feed sponsored card.
        'headline', 'body', 'cta_type', 'destination_url', 'destination_type', 'display_name', 'placements',
        'country', 'city', 'region', 'age_range', 'gender', 'interests', 'target_languages', 'demographics',
        'target_lat', 'target_lng', 'target_radius_km',
        'daily_budget', 'total_budget', 'currency',
        // Advertiser's original (pre-USD-conversion) budget, for display.
        'budget_currency', 'daily_budget_original', 'total_budget_original', 'fx_rate_to_usd',
        'start_date', 'end_date', 'duration_days',
        'payment_method',
        'est_impressions_min', 'est_impressions_max',
        'est_views_min', 'est_views_max',
        'est_profile_visits_min', 'est_profile_visits_max',
        'status', 'rejection_reason',
    ];

    protected $casts = [
        'interests'          => 'array',
        'target_languages'   => 'array',
        'demographics'       => 'array',
        'placements'         => 'array',
        'promoted_video_ids' => 'array',
        'video_settings'     => 'array',
        'message_settings'   => 'array',
        'app_settings'       => 'array',
        'engagement_settings' => 'array',
        'conversion_settings' => 'array',
        'target_lat'       => 'float',
        'target_lng'       => 'float',
        'target_radius_km' => 'integer',
        'start_date'   => 'date',
        'end_date'     => 'date',
        'daily_budget' => 'decimal:2',
        'total_budget' => 'decimal:2',
        'daily_budget_original' => 'decimal:2',
        'total_budget_original' => 'decimal:2',
        'fx_rate_to_usd'        => 'decimal:8',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }
}
