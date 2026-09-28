<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * Single source of truth for social-login provider credentials.
 *
 * Credentials are entered by an admin (Admin › Social Login) and stored in the
 * `app_settings` table under the `social_login` group. Secret fields (client
 * secrets, etc.) are encrypted at rest with the app key. Non-secret allow-lists
 * (Google client IDs, Apple bundle IDs) fall back to the historical env values
 * (GOOGLE_CLIENT_IDS / APPLE_BUNDLE_IDS via config/services.php) when the admin
 * has not entered them, so existing production keeps working with no migration.
 *
 * Both the token verifier (SocialAuthVerifier) and the admin controller
 * (AdminSocialLoginController) drive off the schema declared here, so adding a
 * field in one place wires it everywhere.
 */
class SocialLoginConfig
{
    /** Setting-key prefix + group used for every social-login credential. */
    private const PREFIX = 'social_login';
    public const GROUP   = 'social_login';

    /**
     * Field schema per provider. `secret` fields are encrypted at rest and are
     * never returned to the admin UI in clear text (only a "set" flag + hint).
     *
     * @return array<string, array{label:string, fields:array<string, array{label:string, secret:bool, help?:string}>}>
     */
    public static function schema(): array
    {
        return [
            'google' => [
                'label'  => 'Google',
                'fields' => [
                    'client_ids'    => ['label' => 'Client ID(s)', 'secret' => false, 'help' => 'Your Google OAuth client ID(s) from the Google Cloud Console. Add your Web, iOS and Android client IDs comma-separated — every platform the app signs in from must be listed.'],
                    'client_secret' => ['label' => 'Client Secret', 'secret' => true, 'optional' => true, 'help' => 'From the same OAuth client in Google Cloud Console. Only used for the server-side authorization-code flow; the mobile ID-token sign-in works with just the Client ID(s).'],
                ],
            ],
            'apple' => [
                'label'  => 'Apple',
                'fields' => [
                    'bundle_ids' => ['label' => 'Bundle ID(s)', 'secret' => false, 'help' => 'Comma-separated app bundle IDs / Services IDs accepted as the token audience.'],
                ],
            ],
            'facebook' => [
                'label'  => 'Facebook',
                'fields' => [
                    'app_id'     => ['label' => 'App ID', 'secret' => false, 'help' => 'Your Facebook app ID from developers.facebook.com.'],
                    'app_secret' => ['label' => 'App Secret', 'secret' => true, 'help' => 'Facebook app secret — used to validate the login token server-side.'],
                ],
            ],
            'tiktok' => [
                'label'  => 'TikTok',
                'fields' => [
                    'client_key'    => ['label' => 'Client Key', 'secret' => false, 'help' => 'Your TikTok app client key from the TikTok developer console.'],
                    'client_secret' => ['label' => 'Client Secret', 'secret' => true, 'help' => 'TikTok app client secret — used to exchange the login code server-side.'],
                    'redirect_uri'  => ['label' => 'Redirect URI', 'secret' => false, 'optional' => true, 'help' => 'Must match the redirect URI registered in the TikTok developer console. Not needed if the app sends an access token directly.'],
                ],
            ],
        ];
    }

    public static function providers(): array
    {
        return array_keys(self::schema());
    }

    public static function isValidProvider(string $provider): bool
    {
        return array_key_exists($provider, self::schema());
    }

    /**
     * Whether this provider is switched on. Google/Apple default ON (they have
     * shipped via env for a long time); Facebook/TikTok default OFF until an
     * admin configures and enables them. An admin toggle always wins.
     */
    public static function isEnabled(string $provider): bool
    {
        $default = in_array($provider, ['google', 'apple'], true);
        return (bool) AppSetting::get(self::key($provider, 'enabled'), $default);
    }

    /**
     * Raw value of one field, decrypting secrets. Returns null when unset.
     * Falls back to the legacy env/config value for the two allow-list fields.
     */
    public static function value(string $provider, string $field): ?string
    {
        $stored = AppSetting::get(self::key($provider, $field));

        if ($stored !== null && $stored !== '') {
            $meta = self::schema()[$provider]['fields'][$field] ?? null;
            if ($meta && ! empty($meta['secret'])) {
                try {
                    return Crypt::decryptString($stored);
                } catch (\Throwable $e) {
                    Log::warning('social_login: could not decrypt ' . $provider . '.' . $field);
                    return null;
                }
            }
            return (string) $stored;
        }

        // Backward-compatible fallbacks for the non-secret allow-lists.
        if ($provider === 'google' && $field === 'client_ids') {
            return implode(',', (array) config('services.google.client_ids'));
        }
        if ($provider === 'apple' && $field === 'bundle_ids') {
            return implode(',', (array) config('services.apple.bundle_ids'));
        }

        return null;
    }

    /** A comma-separated allow-list field parsed to a trimmed array. */
    public static function list(string $provider, string $field): array
    {
        $raw = (string) (self::value($provider, $field) ?? '');
        return array_values(array_filter(array_map('trim', explode(',', $raw))));
    }

    /**
     * Persist a field. Secret fields are encrypted; an empty submitted value
     * clears the field. Group is stamped explicitly (AppSetting::set drops it).
     */
    public static function put(string $provider, string $field, ?string $value): void
    {
        $key  = self::key($provider, $field);
        $meta = self::schema()[$provider]['fields'][$field] ?? null;

        $value = $value === null ? '' : trim($value);
        $store = ($meta && ! empty($meta['secret']) && $value !== '')
            ? Crypt::encryptString($value)
            : $value;

        AppSetting::set($key, $store, 'string');
        AppSetting::where('key', $key)->update(['group' => self::GROUP, 'is_public' => false]);
    }

    public static function setEnabled(string $provider, bool $enabled): void
    {
        $key = self::key($provider, 'enabled');
        AppSetting::set($key, $enabled ? '1' : '0', 'boolean');
        AppSetting::where('key', $key)->update(['group' => self::GROUP, 'is_public' => false]);
    }

    /**
     * Admin-facing view: never leaks secrets. Secret fields report only whether
     * a value is set and a masked hint (last 4 chars). Non-secret fields return
     * their actual value so they stay editable.
     *
     * @return array<string, array{enabled:bool, label:string, fields:array}>
     */
    public static function forAdmin(): array
    {
        $out = [];
        foreach (self::schema() as $provider => $def) {
            $fields = [];
            foreach ($def['fields'] as $field => $meta) {
                $val = self::value($provider, $field);
                if (! empty($meta['secret'])) {
                    $fields[$field] = [
                        'label'    => $meta['label'],
                        'secret'   => true,
                        'optional' => ! empty($meta['optional']),
                        'set'      => $val !== null && $val !== '',
                        'hint'     => $val ? str_repeat('•', max(0, strlen($val) - 4)) . substr($val, -4) : null,
                        'help'     => $meta['help'] ?? null,
                    ];
                } else {
                    $fields[$field] = [
                        'label'    => $meta['label'],
                        'secret'   => false,
                        'optional' => ! empty($meta['optional']),
                        'value'    => $val ?? '',
                        'help'     => $meta['help'] ?? null,
                    ];
                }
            }
            $out[$provider] = [
                'label'   => $def['label'],
                'enabled' => self::isEnabled($provider),
                'fields'  => $fields,
            ];
        }
        return $out;
    }

    private static function key(string $provider, string $field): string
    {
        return self::PREFIX . '.' . $provider . '.' . $field;
    }
}
