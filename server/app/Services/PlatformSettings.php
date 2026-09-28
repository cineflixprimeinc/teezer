<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Facades\Cache;

/**
 * Declared schema for platform settings that are ACTUALLY WIRED into the
 * application, plus their defaults.
 *
 * Why a declared schema rather than free-form key/value: app_settings will
 * happily store any key an admin sends, so without a manifest there is no way
 * to tell a setting that does something from one that does nothing. The panel
 * already demonstrates the failure mode - it exposes seventeen feature flags
 * (feature_live, feature_stories, ...) that NOTHING reads, so toggling them
 * changes a row and no behaviour. Everything listed here is verified wired at
 * the consumer named in its comment; nothing gets added without one.
 *
 * Defaults are the values the application currently hardcodes, so an install
 * that has never opened the settings page behaves exactly as it does today.
 */
class PlatformSettings
{
    public const GROUP_SITE = 'site';

    /**
     * Site identity and SEO.
     *
     * Every key below is consumed by the frontend's root generateMetadata()
     * (frontend/src/app/layout.tsx) and therefore ends up in the served HTML.
     * The defaults are exactly what that file hardcoded before it was wired.
     *
     * @return array<string, array{default: mixed, type: string, label: string, help: string}>
     */
    public static function siteSchema(): array
    {
        return [
            'site_name' => [
                'type'    => 'string',
                'default' => 'Teezer',
                'label'   => 'Site name',
                'help'    => 'Used in the browser tab title and as the Open Graph site name.',
            ],
            'site_tagline' => [
                'type'    => 'string',
                'default' => 'Create Your Trend',
                'label'   => 'Tagline',
                'help'    => 'Appended to the site name on the home page title.',
            ],
            'site_description' => [
                'type'    => 'string',
                'default' => 'Create, watch, and share short videos on Teezer. Discover trending creators, upload reels, add music, share stories, and connect with a growing video community.',
                'label'   => 'Description',
                'help'    => 'The meta description, and the Open Graph / X card description.',
            ],
            'seo_keywords' => [
                'type'    => 'string',
                'default' => '',
                'label'   => 'Keywords',
                'help'    => 'Comma separated. Most search engines ignore these; leave blank unless you have a reason.',
            ],
            'og_image_url' => [
                'type'    => 'string',
                'default' => '/teezer-logo.png',
                'label'   => 'Social share image',
                'help'    => 'Shown when a link is shared. Absolute URL, or a path relative to the site.',
            ],
            'canonical_base_url' => [
                'type'    => 'string',
                'default' => 'https://teezer.live',
                'label'   => 'Canonical base URL',
                'help'    => 'The address search engines should treat as authoritative. No trailing slash.',
            ],
            'twitter_handle' => [
                'type'    => 'string',
                'default' => '',
                'label'   => 'X / Twitter handle',
                'help'    => 'With or without the @. Adds the site attribution to X cards.',
            ],
            'instagram_handle' => [
                'type'    => 'string',
                'default' => '',
                'label'   => 'Instagram handle',
                'help'    => 'With or without the @. Shown in the footer and social meta.',
            ],
            'facebook_url' => [
                'type'    => 'string',
                'default' => '',
                'label'   => 'Facebook page URL',
                'help'    => 'The full https:// address of the official page.',
            ],
            'youtube_url' => [
                'type'    => 'string',
                'default' => '',
                'label'   => 'YouTube channel URL',
                'help'    => 'The full https:// address of the official channel.',
            ],
            'allow_indexing' => [
                'type'    => 'boolean',
                'default' => true,
                'label'   => 'Allow search engine indexing',
                'help'    => 'Turning this off emits noindex, nofollow across the whole site.',
            ],
        ];
    }

    /**
     * Resolved site settings, cached.
     *
     * One query for the whole group rather than one per key - this is read on
     * every server-rendered page, so it must not be N round trips.
     *
     * The cache is busted explicitly by save(); the TTL is a backstop so a
     * value changed directly in the database still surfaces on its own.
     */
    public static function site(): array
    {
        return Cache::remember('platform:site', 300, function () {
            $schema = static::siteSchema();
            $stored = AppSetting::whereIn('key', array_keys($schema))->pluck('value', 'key');

            $out = [];

            foreach ($schema as $key => $meta) {
                $raw = $stored[$key] ?? null;

                // An empty string is a real answer for an optional field
                // (twitter_handle, keywords) but must not blank out a field
                // whose default carries meaning, so unset and empty are
                // treated the same: fall back to the default.
                if ($raw === null || $raw === '') {
                    $out[$key] = $meta['default'];
                    continue;
                }

                $out[$key] = $meta['type'] === 'boolean'
                    ? filter_var($raw, FILTER_VALIDATE_BOOLEAN)
                    : $raw;
            }

            return $out;
        });
    }

    /**
     * Persist one group and invalidate the cache.
     *
     * Only keys present in the schema are written. An unknown key is ignored
     * rather than stored, because storing it would create exactly the kind of
     * setting that looks configurable and does nothing.
     *
     * @param  array<string, mixed> $values
     * @return array{written: list<string>, ignored: list<string>}
     */
    public static function saveSite(array $values): array
    {
        $schema  = static::siteSchema();
        $written = [];
        $ignored = [];

        foreach ($values as $key => $value) {
            if (! isset($schema[$key])) {
                $ignored[] = $key;
                continue;
            }

            $type = $schema[$key]['type'];

            AppSetting::set(
                $key,
                $type === 'boolean' ? ($value ? '1' : '0') : (string) $value,
                $type,
            );

            // AppSetting::set() only forgets its own per-key cache entry, and
            // group() is a separate one - so it has to be cleared here or the
            // panel would save successfully and the site would keep serving
            // the old metadata for up to the TTL.
            AppSetting::where('key', $key)->update(['group' => self::GROUP_SITE]);

            $written[] = $key;
        }

        static::bustCache();

        return ['written' => $written, 'ignored' => $ignored];
    }

    /**
     * Drop the resolved-settings caches.
     *
     * Both keys, together: 'platform:site' is what site() memoises, and
     * 'app_settings_public' is the wider public bundle that carries some of the
     * same values. Forgetting one without the other leaves the two disagreeing
     * until the survivor's TTL expires.
     */
    public static function bustCache(): void
    {
        Cache::forget('platform:site');
        Cache::forget('app_settings_public');
    }

    /** The schema plus current values, for rendering the admin form. */
    public static function siteForAdmin(): array
    {
        $values = static::site();

        return collect(static::siteSchema())
            ->map(fn (array $meta, string $key) => [
                'key'       => $key,
                'label'     => $meta['label'],
                'help'      => $meta['help'],
                'type'      => $meta['type'],
                'value'     => $values[$key],
                'default'   => $meta['default'],
                'is_default' => $values[$key] === $meta['default'],
            ])
            ->values()
            ->all();
    }
}
