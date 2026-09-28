<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Registers every legal/policy page the site and app actually link to
 * (PoliciesScreen.tsx on mobile, legal-ui.tsx's footer on web, plus the
 * top-level /terms /privacy /cookies /copyright /law-enforcement
 * /virtual-items routes) as a row in cms_pages, alongside the 5 already
 * seeded by 2026_05_30_100001_create_feature_flags_and_cms_tables.
 *
 * Deliberately NOT included: /help-center. It isn't a legal document - a
 * "use client" interactive topics/search/article hub with its own layout,
 * nothing like LegalShell's structure - so it's out of scope for the
 * CMS-driven legal-page renderer this migration supports.
 *
 * Every row here is inserted EMPTY (content = null) and unpublished. That
 * is deliberate: CmsPageController/the frontend's CMS-aware rendering
 * treat an empty/unpublished row as "nothing to show here yet" and fall
 * back to the page's own existing, already-correct hardcoded content -
 * this migration only makes each page EDITABLE from CMS & Legal, it does
 * not change what any visitor sees until an admin actually saves content
 * for that specific page.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $slugs = [
            // Top-level (not under /policies/)
            'cookies'            => 'Cookie Policy',
            'copyright'          => 'Copyright Policy',
            'law-enforcement'    => 'Law Enforcement Guidelines',
            'virtual-items'      => 'Virtual Items Policy',

            // /policies/*
            'safety'             => 'Safety Policy',
            'adult-content'      => 'Adult Content Policy',
            'minor-safety'       => 'Minor Safety Policy',
            'harassment'         => 'Harassment & Bullying Policy',
            'hateful-behavior'   => 'Hateful Behaviour Policy',
            'integrity'          => 'Integrity & Authenticity Policy',
            'ai-content'         => 'AI-Generated Content Policy',
            'enforcement'        => 'Enforcement & Appeals',
            'creator-earnings'   => 'Creator Earnings & Payouts',
            'data-collection'    => 'Data Collection Policy',
            'data-sharing'       => 'Data Sharing Policy',
            'data-retention'     => 'Data Retention & Deletion',
            'security'           => 'Security Policy',
            'your-rights'        => 'Your Rights & Controls',
            'creator-agreement'  => 'Creator Agreement',
            'monetization-terms' => 'Monetization Terms',
            'advertising-policy' => 'Advertising Policy',
        ];

        foreach ($slugs as $slug => $title) {
            DB::table('cms_pages')->updateOrInsert(
                ['slug' => $slug],
                [
                    'title'        => $title,
                    'content'      => null,
                    'is_published' => false,
                    'locale'       => 'en',
                    'created_at'   => $now,
                    'updated_at'   => $now,
                ]
            );
        }
    }

    public function down(): void
    {
        DB::table('cms_pages')->whereIn('slug', [
            'cookies', 'copyright', 'law-enforcement', 'virtual-items',
            'safety', 'adult-content', 'minor-safety', 'harassment', 'hateful-behavior',
            'integrity', 'ai-content', 'enforcement', 'creator-earnings', 'data-collection',
            'data-sharing', 'data-retention', 'security', 'your-rights', 'creator-agreement',
            'monetization-terms', 'advertising-policy',
        ])->delete();
    }
};
