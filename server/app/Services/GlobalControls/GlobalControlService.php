<?php

namespace App\Services\GlobalControls;

use App\Models\AdminActionLog;
use App\Models\GlobalControl;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Global Reelsoo Control - read/write layer over `global_controls`.
 *
 * Every value is read through one cached map (cache key below), so a request
 * that needs to check three controls costs one cache read, not three - the
 * enforcement middleware checks this on every request, so it must stay cheap.
 * Writes bust that one key; there is no per-key cache to fall out of sync.
 */
class GlobalControlService
{
    private const CACHE_KEY = 'global_controls:map';
    private const CACHE_TTL = 60;

    /**
     * Resolved key => enabled map for every registered control, including
     * ones that have never been touched (registry default applies).
     *
     * @return array<string, bool>
     */
    public function map(): array
    {
        // This runs on every request via EnsureGlobalControlEnabled - a DB
        // hiccup here (most realistically: the migration hasn't landed yet
        // in the few-second window right after a deploy, since deploys pull
        // code before running `migrate`) must not 500 every request on the
        // site. Fail OPEN to every control's registry default, same
        // direction IpCountryService/LicenseVerifier already fail in this
        // codebase for exactly this reason - a restriction system's outage
        // mode is "no restrictions", never "nothing works".
        try {
            return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
                $schema = GlobalControlRegistry::schema();
                $stored = GlobalControl::whereIn('key', array_keys($schema))->pluck('enabled', 'key');

                $out = [];
                foreach ($schema as $key => $meta) {
                    $out[$key] = $stored->has($key) ? (bool) $stored[$key] : $meta['default'];
                }

                return $out;
            });
        } catch (\Throwable $e) {
            Log::warning('global_controls.map_failed_open', ['error' => $e->getMessage()]);

            return array_map(fn (array $meta) => $meta['default'], GlobalControlRegistry::schema());
        }
    }

    public function isEnabled(string $key): bool
    {
        if (! GlobalControlRegistry::isValidKey($key)) {
            // An unregistered key can never gate anything - fail open rather
            // than let a typo in a call site silently block real users.
            return true;
        }

        return $this->map()[$key] ?? GlobalControlRegistry::schema()[$key]['default'];
    }

    /**
     * The standard denial body every gated endpoint returns (spec §32),
     * now including WHEN it's expected back if a temporary restriction was
     * set - the piece client UIs need to show "how long" rather than just
     * "blocked". Single source of truth for this shape: seven call sites
     * across the app used to hand-roll it independently before this existed.
     */
    public function deniedResponse(string $key): array
    {
        return [
            'success' => false,
            'error' => [
                'code' => 'GLOBAL_FEATURE_DISABLED',
                'feature' => $key,
                'message' => $this->messageFor($key),
                'expiresAt' => $this->expiresAtFor($key),
            ],
        ];
    }

    public function messageFor(string $key): string
    {
        return match ($key) {
            'signup_enabled', 'block_new_accounts' => 'New registrations are temporarily unavailable.',
            'login_enabled' => 'Login is temporarily unavailable.',
            'uploads_enabled', 'photo_uploads_enabled', 'video_uploads_enabled' => 'Uploads are temporarily unavailable. Please try again later.',
            'gif_uploads_enabled' => 'GIF uploads are temporarily unavailable.',
            'draft_creation_enabled' => 'Saving drafts is temporarily unavailable.',
            'external_links_enabled' => 'Adding a link to your post is temporarily unavailable.',
            'live_create_enabled' => 'Live streaming is temporarily unavailable.',
            'live_watch_enabled' => 'Live streaming is temporarily unavailable.',
            'live_gifts_enabled' => 'Gifting during live streams is temporarily unavailable.',
            'voice_messages_enabled' => 'Voice messages are temporarily unavailable.',
            'creator_rewards_enabled' => 'Creator Rewards is temporarily unavailable.',
            'studio_enabled' => 'Teezer Studio is temporarily unavailable.',
            'comments_enabled' => 'Comments are temporarily unavailable.',
            default => 'This feature is temporarily unavailable.',
        };
    }

    /**
     * Not read through map() - expires_at isn't part of the cached
     * key=>bool map, and this only runs on the failure path anyway, so one
     * small direct query costs nothing a real user would notice.
     */
    public function expiresAtFor(string $key): ?string
    {
        if (! GlobalControlRegistry::isValidKey($key)) {
            return null;
        }

        try {
            // ->first() (not ->value()) is required here - value() is a query
            // builder shortcut that returns the raw column, bypassing
            // GlobalControl's datetime cast, so ->toIso8601String() would
            // fatal on what would actually be a plain string.
            return GlobalControl::where('key', $key)->first()?->expires_at?->toIso8601String();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * True only if the named control is enabled AND its paired emergency
     * switch is NOT active. The emergency keys are inverted from every other
     * control in the registry - `enabled=true` means the restriction IS
     * ACTIVE (matches the mockup's [OFF]-by-default emergency toggles), not
     * "the capability is allowed" - so pairing them in has to flip the sense
     * of the check, not repeat it, or an admin turning an emergency block ON
     * would silently do nothing.
     */
    public function isEnabledWithEmergencyPair(string $key): bool
    {
        if (! $this->isEnabled($key)) {
            return false;
        }

        foreach (GlobalControlRegistry::emergencyPairs() as $emergencyKey => $pairedKey) {
            if ($pairedKey === $key && $this->isEnabled($emergencyKey)) {
                return false;
            }
        }

        return true;
    }

    public function isMaintenanceMode(): bool
    {
        return $this->isEnabled('maintenance_mode');
    }

    public function isReadOnlyMode(): bool
    {
        return $this->isEnabled('read_only_mode');
    }

    /**
     * Full admin-facing view: schema + current value + audit metadata, one
     * row per control, grouped by category. Powers the whole settings page.
     */
    public function forAdmin(): array
    {
        $schema = GlobalControlRegistry::schema();
        $rows = GlobalControl::whereIn('key', array_keys($schema))
            ->with('changedBy:id,name,username')
            ->get()
            ->keyBy('key');

        $out = [];
        foreach ($schema as $key => $meta) {
            $row = $rows->get($key);

            $out[] = [
                'key'            => $key,
                'category'       => $meta['category'],
                'label'          => $meta['label'],
                'description'    => $meta['description'],
                'enabled'        => $row ? (bool) $row->enabled : $meta['default'],
                'default'        => $meta['default'],
                'critical'       => $meta['critical'],
                'requiresReason' => $meta['requiresReason'],
                'platforms'      => $meta['platforms'],
                'enforcement'    => $meta['enforcement'],
                'changedReason'  => $row?->changed_reason,
                'changedBy'      => $row?->changedBy?->name,
                'changedAt'      => $row?->changed_at?->toIso8601String(),
                'expiresAt'      => $row?->expires_at?->toIso8601String(),
            ];
        }

        return $out;
    }

    public function statusSummary(): array
    {
        $map = $this->map();
        $schema = GlobalControlRegistry::schema();

        $activeRestrictions = 0;
        $disabledFeatures = 0;

        foreach ($schema as $key => $meta) {
            $enabled = $map[$key];
            if ($meta['category'] === GlobalControlRegistry::CATEGORY_EMERGENCY) {
                if ($enabled) {
                    $activeRestrictions++;
                }
                continue;
            }
            if (! $enabled) {
                $disabledFeatures++;
            }
        }

        return [
            'operational'        => $activeRestrictions === 0 && ! $map['maintenance_mode'] && ! $map['read_only_mode'],
            'activeRestrictions' => $activeRestrictions,
            'disabledFeatures'   => $disabledFeatures,
            'maintenanceMode'    => $map['maintenance_mode'],
            'readOnlyMode'       => $map['read_only_mode'],
        ];
    }

    /**
     * Safe public config for Website/Android/iOS - every key, since none of
     * these are secrets, only behaviour flags. Clients pick this up on their
     * own next fetch; there is no realtime push channel wired to config in
     * this codebase, so this is intentionally NOT presented as instant to
     * running clients (see the admin UI's propagation panel).
     */
    public function publicConfig(): array
    {
        return $this->map();
    }

    /**
     * @throws \InvalidArgumentException if $key is not a real control, or a
     *         reason is required and missing.
     */
    public function set(string $key, bool $enabled, User $admin, ?string $reason = null, ?int $durationMinutes = null): array
    {
        if (! GlobalControlRegistry::isValidKey($key)) {
            throw new \InvalidArgumentException("Unknown global control key: {$key}");
        }

        $meta = GlobalControlRegistry::schema()[$key];

        // For an inverted (emergency) key, enabled=true IS the restrictive
        // direction, so the reason requirement has to flip with it - see
        // GlobalControlRegistry::isInverted()'s docblock. Getting this wrong
        // silently lets an admin flip maintenance mode ON with no reason
        // while demanding one to turn it back off.
        $isRestrictiveDirection = GlobalControlRegistry::isInverted($key) ? $enabled : ! $enabled;

        if ($meta['requiresReason'] && $isRestrictiveDirection && ! $reason) {
            throw new \InvalidArgumentException('A reason is required for this change.');
        }

        $row = GlobalControl::firstOrNew(['key' => $key]);
        $previous = $row->exists ? (bool) $row->enabled : $meta['default'];

        $expiresAt = null;
        $restoreValue = null;
        if ($durationMinutes !== null && $durationMinutes > 0) {
            $expiresAt = now()->addMinutes($durationMinutes);
            $restoreValue = $previous;
        }

        $row->fill([
            'enabled'        => $enabled,
            'previous_value' => $previous,
            'changed_reason' => $reason,
            'changed_by'     => $admin->id,
            'changed_at'     => now(),
            'expires_at'     => $expiresAt,
            'restore_value'  => $restoreValue,
        ])->save();

        $this->bustCache();

        AdminActionLog::record(
            admin: $admin,
            action: 'global_control.update',
            category: 'global_controls',
            description: ($enabled ? 'Enabled' : 'Disabled') . " global control: {$meta['label']}",
            metadata: [
                'key' => $key, 'previous' => $previous, 'new' => $enabled,
                'reason' => $reason, 'expires_at' => $expiresAt?->toIso8601String(),
            ],
            severity: $meta['critical'] ? 'warning' : 'info',
        );

        return ['key' => $key, 'enabled' => $enabled, 'previous' => $previous, 'expiresAt' => $expiresAt?->toIso8601String()];
    }

    /** Enable/disable every control in a category at once (spec §23). */
    public function setCategory(string $category, bool $enabled, User $admin, ?string $reason = null): array
    {
        $keys = array_keys(array_filter(
            GlobalControlRegistry::schema(),
            fn (array $meta) => $meta['category'] === $category,
        ));

        $changed = [];
        foreach ($keys as $key) {
            $changed[] = $this->set($key, $enabled, $admin, $reason);
        }

        AdminActionLog::record(
            admin: $admin,
            action: 'global_control.bulk_category',
            category: 'global_controls',
            description: ($enabled ? 'Enabled' : 'Disabled') . " all controls in category: {$category}",
            metadata: ['category' => $category, 'enabled' => $enabled, 'reason' => $reason, 'keys' => $keys],
            severity: 'warning',
        );

        return $changed;
    }

    /**
     * Restore every control whose temporary-restriction window has passed.
     * Called by the scheduled `global-controls:restore-expired` command.
     */
    public function restoreExpired(): int
    {
        $rows = GlobalControl::whereNotNull('expires_at')->where('expires_at', '<=', now())->get();

        foreach ($rows as $row) {
            $row->update([
                'enabled'        => $row->restore_value ?? true,
                'expires_at'     => null,
                'restore_value'  => null,
                'changed_reason' => 'Automatically restored - temporary restriction expired.',
                'changed_by'     => null,
                'changed_at'     => now(),
            ]);

            // No admin actor here - a scheduled command, not a request. AdminActionLog's
            // admin_id is NOT NULL and casts a null admin to 0, which would violate the
            // FK; plain Log matches the precedent already used for this exact situation
            // elsewhere in the app (e.g. CreateDemoAdmin, the countries:sync command).
            Log::info('global_control.auto_restore', ['key' => $row->key, 'restored_to' => $row->enabled]);
        }

        if ($rows->isNotEmpty()) {
            $this->bustCache();
        }

        return $rows->count();
    }

    public function bustCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
