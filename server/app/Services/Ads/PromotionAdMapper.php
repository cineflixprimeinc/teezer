<?php

namespace App\Services\Ads;

use App\Models\AdAccount;
use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdGroup;
use App\Models\Promotion;

/**
 * One-way adapter that projects a legacy `promotions` row into the canonical
 * Campaign -> Ad Group -> Creative hierarchy, so the existing wizard / promote page
 * keep working unchanged while feeding the real delivery engine.
 *
 * Defined in Phase 0 but NOT wired anywhere yet — StudioPromotionController calls
 * `project()` in Phase 1 (on create / status change). Idempotent per promotion.
 */
class PromotionAdMapper
{
    /** promotion objective -> campaign objective */
    private const OBJECTIVE_MAP = [
        'more_views'          => 'video_views',
        'more_followers'      => 'followers',
        'more_profile_visits' => 'traffic',
        'more_engagement'     => 'engagement',
    ];

    /**
     * Create or update the ad hierarchy mirroring a promotion. Returns the campaign.
     */
    public function project(Promotion $promotion): AdCampaign
    {
        $account = $this->accountFor($promotion);

        $campaign = AdCampaign::updateOrCreate(
            ['promotion_id' => $promotion->id],
            [
                'ad_account_id'      => $account->id,
                'name'               => 'Promotion #' . $promotion->id,
                'objective'          => self::OBJECTIVE_MAP[$promotion->objective] ?? 'reach',
                'status'             => $promotion->status,
                'budget_type'        => 'daily',
                'daily_budget_cents' => $this->toCents($promotion->daily_budget),
                'total_budget_cents' => $this->toCents($promotion->total_budget),
                'currency'           => $promotion->currency ?: 'USD',
                'start_at'           => $promotion->start_date,
                'end_at'             => $promotion->end_date,
            ]
        );

        $group = AdGroup::updateOrCreate(
            ['campaign_id' => $campaign->id],
            [
                'name'       => 'Default group',
                'status'     => 'active',
                // Advertiser-chosen placements (in_feed by default) drive where the
                // sponsored card is eligible to appear.
                'placements' => $promotion->placements ?: ['in_feed'],
                'targeting'  => $this->targeting($promotion),
                'bid_type'   => 'cpm',
            ]
        );

        AdCreative::updateOrCreate(
            ['ad_group_id' => $group->id],
            [
                'type'            => 'video',
                'video_id'        => $promotion->video_id,
                // Creative copy shown on the in-feed sponsored card. display_name
                // falls back to the promoting creator so the "Sponsored · …" line
                // is never blank.
                'headline'        => $promotion->headline,
                'body'            => $promotion->body,
                'cta_type'        => $promotion->cta_type,
                'destination_url' => $promotion->destination_url,
                'display_name'    => $promotion->display_name
                    ?: ($promotion->user->name ?? ($promotion->user->username ? '@' . $promotion->user->username : null)),
                'review_status'   => in_array($promotion->status, ['approved', 'active'], true) ? 'approved' : 'pending',
            ]
        );

        return $campaign;
    }

    private function accountFor(Promotion $promotion): AdAccount
    {
        return (new AdAccountService())->forUser($promotion->user_id, $promotion->currency ?: 'USD');
    }

    private function targeting(Promotion $promotion): array
    {
        [$ageMin, $ageMax] = $this->parseAge($promotion->age_range);

        $geo = ($promotion->target_lat !== null && $promotion->target_lng !== null)
            ? [
                'lat'       => (float) $promotion->target_lat,
                'lng'       => (float) $promotion->target_lng,
                'radius_km' => (int) ($promotion->target_radius_km ?: 10),
            ]
            : null;

        return array_filter([
            'countries' => $promotion->country ? [$promotion->country] : null,
            'city'      => $promotion->city ?: null,
            'region'    => $promotion->region ?: null,
            'geo'       => $geo,
            'age_min'   => $ageMin,
            'age_max'   => $ageMax,
            'genders'   => $promotion->gender && $promotion->gender !== 'all' ? [$promotion->gender] : null,
            'interests' => $promotion->interests ?: null,
        ], fn ($v) => $v !== null);
    }

    /** "18-24" -> [18,24]; "45+" -> [45,null]; null -> [null,null] */
    private function parseAge(?string $range): array
    {
        if (! $range) {
            return [null, null];
        }
        if (str_ends_with($range, '+')) {
            return [(int) rtrim($range, '+'), null];
        }
        if (str_contains($range, '-')) {
            [$lo, $hi] = explode('-', $range, 2);
            return [(int) $lo, (int) $hi];
        }
        return [null, null];
    }

    private function toCents($amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
