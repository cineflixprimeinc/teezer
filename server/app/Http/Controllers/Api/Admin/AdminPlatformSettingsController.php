<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdminActionLog;
use App\Services\PlatformSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Grouped platform settings.
 *
 * Separate from AdminSettingsController, which stays as it is: that one is a
 * generic single-key key/value editor over app_settings, and it is still the
 * right tool for the ad-hoc settings the panel already manages. This one is
 * for settings with a DECLARED SCHEMA (App\Services\PlatformSettings) that are
 * saved as a group and are verified wired into the application.
 *
 * The distinction matters. The generic editor will store any key it is sent,
 * which is how the panel ended up exposing seventeen feature flags that
 * nothing reads. Everything reachable through this controller is constrained
 * to the schema, so a setting cannot be surfaced without a consumer.
 *
 * Authorisation is the api.admin group (authenticated, not banned,
 * admin/super_admin) - the same server-side gate as every other admin route,
 * and the reason hiding the menu item is not the control.
 */
class AdminPlatformSettingsController extends Controller
{
    /** GET /api/v1/admin/platform-settings/site */
    public function site(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => ['fields' => PlatformSettings::siteForAdmin()],
        ]);
    }

    /** PUT /api/v1/admin/platform-settings/site */
    public function updateSite(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'site_name'          => ['sometimes', 'string', 'max:60'],
            'site_tagline'       => ['sometimes', 'string', 'max:120'],
            // 320 rather than 160: search engines truncate around 160, but
            // truncating the stored value would silently discard what the
            // admin wrote. The UI warns; the store keeps what they typed.
            'site_description'   => ['sometimes', 'string', 'max:320'],
            'seo_keywords'       => ['sometimes', 'string', 'max:500'],
            'og_image_url'       => ['sometimes', 'string', 'max:500'],
            'canonical_base_url' => ['sometimes', 'string', 'max:255', 'regex:/^https?:\/\/[^\s\/]+$/i'],
            'twitter_handle'     => ['sometimes', 'string', 'max:32', 'regex:/^@?[A-Za-z0-9_]*$/'],
            // Handles are stored with or without the leading @; the regex allows
            // both rather than forcing a shape the admin has to guess.
            'instagram_handle'   => ['sometimes', 'string', 'max:32', 'regex:/^@?[A-Za-z0-9_.]*$/'],
            // Anchored to https so a pasted "facebook.com/x" cannot become a
            // relative link, and to the real host so this cannot be pointed at
            // an unrelated domain from the settings screen.
            'facebook_url'       => ['sometimes', 'string', 'max:255', 'regex:/^$|^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9_.\/-]*$/i'],
            'youtube_url'        => ['sometimes', 'string', 'max:255', 'regex:/^$|^https:\/\/(www\.)?youtube\.com\/[A-Za-z0-9_.@\/-]*$/i'],
            'allow_indexing'     => ['sometimes', 'boolean'],
        ], [
            'canonical_base_url.regex' => 'Enter a full URL with no trailing slash, for example https://example.com.',
            'twitter_handle.regex'     => 'A handle can only contain letters, numbers and underscores.',
        ]);

        $before = PlatformSettings::site();
        $result = PlatformSettings::saveSite($validated);

        // Only the keys that actually changed, and only their names plus a
        // changed/unchanged flag - not the values. None of these are secrets,
        // but the audit log is shared with settings that will be, and a log
        // that records values by default is one bad addition away from
        // recording a credential.
        $changed = array_values(array_filter(
            $result['written'],
            fn (string $key) => ($before[$key] ?? null) !== (PlatformSettings::site()[$key] ?? null),
        ));

        if ($changed !== []) {
            AdminActionLog::record(
                admin: $request->user(),
                action: 'update_platform_settings',
                category: 'settings',
                description: 'Updated site & SEO settings: ' . implode(', ', $changed),
                metadata: ['group' => 'site', 'changed' => $changed],
                ip: $request->ip(),
            );
        }

        return response()->json([
            'success' => true,
            'message' => $changed === []
                ? 'No changes to save.'
                : count($changed) . ' setting' . (count($changed) === 1 ? '' : 's') . ' saved.',
            'data'    => ['fields' => PlatformSettings::siteForAdmin(), 'changed' => $changed],
        ]);
    }

    /**
     * POST /api/v1/admin/platform-settings/site/reset
     *
     * Restores the schema defaults, which are the values the application
     * hardcoded before any of this existed - so a reset returns the site to
     * exactly its shipped behaviour rather than to something blank.
     */
    /**
     * POST /admin/platform-settings/site/clear-cache
     *
     * Drops the resolved-settings cache without changing a single value.
     *
     * save() already busts it, so this is for the case save() cannot see: a
     * value edited straight in the database, or a stale read on the other box.
     * The 5-minute TTL would clear it eventually; this is the button for when
     * "eventually" is not good enough.
     */
    public function clearSiteCache(): JsonResponse
    {
        PlatformSettings::bustCache();

        return response()->json([
            'success' => true,
            'message' => 'SEO cache cleared.',
            'data'    => ['fields' => PlatformSettings::siteForAdmin()],
        ]);
    }

    public function resetSite(Request $request): JsonResponse
    {
        $defaults = collect(PlatformSettings::siteSchema())
            ->map(fn (array $meta) => $meta['default'])
            ->all();

        PlatformSettings::saveSite($defaults);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'reset_platform_settings',
            category: 'settings',
            description: 'Reset site & SEO settings to defaults.',
            metadata: ['group' => 'site'],
            ip: $request->ip(),
            severity: 'warning',
        );

        return response()->json([
            'success' => true,
            'message' => 'Site settings restored to defaults.',
            'data'    => ['fields' => PlatformSettings::siteForAdmin()],
        ]);
    }
}
