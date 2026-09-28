<?php

namespace App\Services\Integrations;

use App\Models\IntegrationSetting;
use Illuminate\Support\Facades\Cache;

/**
 * The single place anything asks "what are the credentials for X?".
 *
 * Resolution order, and the reason for it:
 *
 *   1. Database (admin panel)  - so a key rotated in the UI takes effect on the
 *                                next request, with no deploy.
 *   2. .env                    - so every integration that already works today
 *                                keeps working before anyone opens the panel.
 *                                This module is additive; nothing breaks by
 *                                installing it.
 *   3. config defaults         - endpoints and user-agents that are the same for
 *                                everyone and are not really configuration.
 *
 * Nothing is ever hardcoded at a call site. A provider that reads
 * env('SPOTIFY_CLIENT_SECRET') directly is a bug: it bypasses the panel, so
 * rotating the key there silently does nothing.
 */
class IntegrationRegistry
{
    /**
     * Cached because this is read on nearly every provider call and the row
     * changes only when an admin saves. Short TTL rather than an explicit-only
     * bust so a change made directly in the database still surfaces on its own.
     */
    private const CACHE_TTL = 300;

    private static function cacheKey(string $provider): string
    {
        return "integration:config:{$provider}";
    }

    /** Every provider declared in config/integrations.php. */
    public static function definitions(): array
    {
        return config('integrations.providers', []);
    }

    public static function definition(string $provider): ?array
    {
        return static::definitions()[$provider] ?? null;
    }

    /**
     * The resolved configuration for a provider: every declared field, filled
     * from database → env → default, plus `enabled`.
     *
     * Returns secrets in the clear - this is the server-side accessor. It must
     * never be handed to a controller response; use maskedFor() for that.
     */
    public static function config(string $provider): array
    {
        return Cache::remember(
            static::cacheKey($provider),
            self::CACHE_TTL,
            fn () => static::resolve($provider),
        );
    }

    /** One field, resolved. */
    public static function get(string $provider, string $field, mixed $fallback = null): mixed
    {
        $value = static::config($provider)[$field] ?? null;

        return ($value === null || $value === '') ? $fallback : $value;
    }

    /**
     * Whether a provider may be used right now.
     *
     * Enabled is not enough: a provider whose required fields are blank is
     * misconfigured, and treating it as available means every call fails at the
     * network boundary instead of being skipped cleanly here.
     */
    public static function isReady(string $provider): bool
    {
        $definition = static::definition($provider);
        if ($definition === null) {
            return false;
        }

        $config = static::config($provider);
        if (! ($config['enabled'] ?? false)) {
            return false;
        }

        foreach ($definition['fields'] ?? [] as $key => $field) {
            if (($field['required'] ?? false) && blank($config[$key] ?? null)) {
                return false;
            }
        }

        return true;
    }

    private static function resolve(string $provider): array
    {
        $definition = static::definition($provider);
        if ($definition === null) {
            return ['enabled' => false];
        }

        $row         = IntegrationSetting::where('provider', $provider)->first();
        $credentials = $row?->credentials ?? [];
        $settings    = $row?->settings ?? [];
        $defaults    = $definition['defaults'] ?? [];

        $resolved = ['enabled' => (bool) ($row?->enabled ?? false)];

        foreach ($definition['fields'] ?? [] as $key => $field) {
            // Secrets come from the encrypted blob, non-secrets from plain
            // settings - they are stored apart so the admin API can render
            // configuration without decrypting anything.
            $stored = ($field['secret'] ?? false) ? ($credentials[$key] ?? null) : ($settings[$key] ?? null);

            $resolved[$key] = match (true) {
                filled($stored)                                        => $stored,
                // env() and not config(): these keys are not mirrored into any
                // config file, and reading .env directly is the whole point of
                // the fallback tier.
                ! empty($field['env']) && filled(env($field['env']))   => env($field['env']),
                default                                                => $defaults[$key] ?? null,
            };
        }

        // Defaults that are not editable fields (token URLs, rate limits) still
        // need to reach the provider client.
        foreach ($defaults as $key => $value) {
            $resolved[$key] ??= $value;
        }

        // A provider nobody has saved yet, but whose credentials are already in
        // .env, counts as enabled. Otherwise installing this module would switch
        // off every integration that currently works.
        if ($row === null) {
            $resolved['enabled'] = static::hasEnvCredentials($definition);
        }

        return $resolved;
    }

    private static function hasEnvCredentials(array $definition): bool
    {
        foreach ($definition['fields'] ?? [] as $field) {
            if (($field['required'] ?? false) && ! empty($field['env']) && filled(env($field['env']))) {
                return true;
            }
        }

        return false;
    }

    /**
     * The browser-safe view of a provider: configuration in the clear, secrets
     * reduced to "is it set, and what does the tail look like".
     *
     * A tail rather than nothing at all because an admin needs to tell two keys
     * apart to know whether a rotation landed - and four trailing characters is
     * what every other console shows for the same reason.
     */
    public static function maskedFor(string $provider): array
    {
        $definition = static::definition($provider);
        if ($definition === null) {
            return [];
        }

        $config = static::config($provider);
        $row    = IntegrationSetting::where('provider', $provider)->first();
        $fields = [];

        foreach ($definition['fields'] ?? [] as $key => $field) {
            $value  = $config[$key] ?? null;
            $secret = $field['secret'] ?? false;

            $fields[$key] = [
                'label'    => $field['label'],
                'type'     => $field['type'] ?? 'text',
                'secret'   => $secret,
                'required' => $field['required'] ?? false,
                'is_set'   => filled($value),
                // Where the effective value is coming from, so an admin can see
                // at a glance that the panel is not yet overriding .env.
                'source'   => static::sourceOf($provider, $key, $field, $row),
                'value'    => $secret ? static::mask($value) : $value,
            ];
        }

        return [
            'provider'          => $provider,
            'label'             => $definition['label'],
            'group'             => $definition['group'] ?? 'platform',
            'notes'             => $definition['notes'] ?? null,
            'docs'              => $definition['docs'] ?? null,
            'testable'          => ($definition['test'] ?? 'none') !== 'none',
            'refreshable'       => $definition['refreshable'] ?? false,
            'enabled'           => $config['enabled'] ?? false,
            'ready'             => static::isReady($provider),
            'status'            => $row?->status ?? IntegrationSetting::STATUS_UNTESTED,
            'last_connected_at' => $row?->last_connected_at?->toIso8601String(),
            'last_tested_at'    => $row?->last_tested_at?->toIso8601String(),
            'last_error'        => $row?->last_error,
            'usage'             => $row?->usage,
            'fields'            => $fields,
        ];
    }

    private static function sourceOf(string $provider, string $key, array $field, ?IntegrationSetting $row): string
    {
        $stored = ($field['secret'] ?? false) ? ($row?->credentials[$key] ?? null) : ($row?->settings[$key] ?? null);

        if (filled($stored)) {
            return 'database';
        }
        if (! empty($field['env']) && filled(env($field['env']))) {
            return 'env';
        }

        return 'default';
    }

    private static function mask(mixed $value): ?string
    {
        $value = (string) $value;
        if ($value === '') {
            return null;
        }

        return strlen($value) <= 4
            ? str_repeat('•', 8)
            : str_repeat('•', 8) . substr($value, -4);
    }

    /** Called after any write so the next read sees the new value immediately. */
    public static function forget(string $provider): void
    {
        Cache::forget(static::cacheKey($provider));
    }
}
