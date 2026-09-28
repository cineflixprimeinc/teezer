<?php

namespace Database\Seeders;

use App\Models\PremiumComparison;
use App\Models\PremiumFaq;
use App\Models\PremiumFeature;
use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

/**
 * Seeds the premium page with the designed catalogue.
 *
 * Idempotent (updateOrCreate keyed on the natural key), so it can be re-run
 * after a schema change without duplicating rows or clobbering an admin's later
 * price edits with a fresh insert.
 *
 * NOTE ON COPY: plan names, prices, features, the grid and the comparison
 * matrix are transcribed from the approved design. The FAQ *answers* are not -
 * the design shows the questions with their accordions closed, so the answers
 * here are drafted and should be reviewed before launch. The questions
 * themselves are the design's.
 */
class PremiumPageSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'key'         => 'starter',
                'name'        => 'Starter',
                'tagline'     => 'For new creators',
                'price'       => 249,
                'theme'       => 'light',
                'is_popular'  => false,
                'is_default'  => false,
                'sort'        => 10,
                'features'    => ['No ads in feed', '1080p uploads', '30-day analytics'],
            ],
            [
                'key'         => 'pro',
                'name'        => 'Pro',
                'tagline'     => 'For growing channels',
                'price'       => 499,
                'theme'       => 'light',
                'is_popular'  => true,
                'badge_label' => 'MOST POPULAR',
                'is_default'  => false,
                'sort'        => 20,
                'features'    => [
                    'Everything in Starter',
                    'Premium badge',
                    '12-month analytics',
                    'Priority Space slots',
                ],
            ],
            [
                'key'         => 'studio',
                'name'        => 'Studio',
                'tagline'     => 'For teams and agencies',
                'price'       => 1290,
                'theme'       => 'dark',
                'is_popular'  => false,
                'is_default'  => true,
                'sort'        => 30,
                'features'    => [
                    'Everything in Pro',
                    '5 team seats with roles',
                    'Scheduled posting + bulk upload',
                    'Priority support',
                ],
            ],
        ];

        foreach ($plans as $plan) {
            SubscriptionPlan::updateOrCreate(
                ['key' => $plan['key']],
                $plan + ['currency' => 'NPR', 'period' => 'month', 'is_enabled' => true],
            );
        }

        $features = [
            ['icon' => 'chart', 'title' => 'Advanced analytics', 'description' => 'Retention curves, follower sources and best posting times', 'sort' => 10],
            ['icon' => 'star', 'title' => 'Premium badge', 'description' => 'A verified-style mark next to your name everywhere', 'sort' => 20],
            ['icon' => 'video', 'title' => '4K uploads', 'description' => 'Upload up to 4K80 with no extra compression', 'sort' => 30],
            ['icon' => 'mic', 'title' => 'Priority Space slots', 'description' => 'Your Spaces surface first for followers', 'badge' => 'NEW', 'sort' => 40],
            ['icon' => 'ban', 'title' => 'No ads', 'description' => 'Watch reels without interruptions', 'sort' => 50],
            ['icon' => 'zap', 'title' => 'Early features', 'description' => 'Try new editing tools weeks before everyone', 'badge' => 'NEW', 'sort' => 60],
        ];

        foreach ($features as $f) {
            PremiumFeature::updateOrCreate(['title' => $f['title']], $f + ['is_enabled' => true]);
        }

        $comparison = [
            ['label' => 'Upload quality',  'values' => ['starter' => '1080p',   'pro' => '4K60',  'studio' => '4K80'], 'highlight_plan' => 'pro', 'sort' => 10],
            ['label' => 'Analytics',       'values' => ['starter' => '30 days', 'pro' => '12 mo', 'studio' => '12 mo'], 'highlight_plan' => 'pro', 'sort' => 20],
            ['label' => 'Space listeners', 'values' => ['starter' => '1K',      'pro' => '10K',   'studio' => '50K'],  'highlight_plan' => 'pro', 'sort' => 30],
            // No 'starter' key: the design draws a dash there, and an absent
            // value is exactly how the client renders one.
            ['label' => 'Team seats',      'values' => ['pro' => '1',   'studio' => '5'],   'highlight_plan' => 'pro', 'sort' => 40],
            ['label' => 'Scheduling',      'values' => ['studio' => 'Yes'],                 'highlight_plan' => 'pro', 'sort' => 50],
        ];

        foreach ($comparison as $row) {
            PremiumComparison::updateOrCreate(['label' => $row['label']], $row + ['is_enabled' => true]);
        }

        $faqs = [
            [
                'question' => 'Can I cancel anytime?',
                'answer'   => 'Yes. Cancel from your app store subscription settings at any time. You keep every premium feature until the end of the period you have already paid for, and you are not charged again.',
                'sort'     => 10,
            ],
            [
                'question' => 'Does Premium boost my reels?',
                'answer'   => 'No. Premium does not change how the feed ranks your videos - reach is earned the same way for everyone. What it gives you is better tooling: deeper analytics, higher upload quality, and priority placement for your Spaces among your own followers.',
                'sort'     => 20,
            ],
            [
                'question' => 'What happens to my 4K uploads if I cancel?',
                'answer'   => 'Videos you already uploaded stay exactly as they are and keep playing at the quality they were published in. New uploads after cancelling use the free tier limit.',
                'sort'     => 30,
            ],
            [
                'question' => 'Can I switch plans later?',
                'answer'   => 'Yes. Upgrading applies immediately and your app store prorates the difference. Downgrading takes effect at the start of your next billing period, so you keep the higher tier until then.',
                'sort'     => 40,
            ],
        ];

        foreach ($faqs as $q) {
            PremiumFaq::updateOrCreate(['question' => $q['question']], $q + ['is_enabled' => true]);
        }
    }
}
