<?php

namespace App\Http\Controllers\Api\Setup;

use App\Http\Controllers\Controller;
use App\Licensing\Client\LicenseState;
use App\Licensing\Client\LicenseVerifier;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

/**
 * First-run setup wizard for a fresh customer installation (section 20).
 *
 * Everything it writes is LOCAL to that installation - its own database, its own
 * settings, its own admin user. Nothing here talks to teezer.live, and nothing a
 * customer configures can reach our production environment. That separation is
 * section 21, enforced by there being no code path between the two at all.
 *
 * THE LOCK. Every endpoint refuses once setup has completed. Without that, this
 * is a permanently open "create yourself an administrator" endpoint on a public
 * site - by far the most dangerous thing an installer can leave behind. The lock
 * is a settings row plus a real user-table check, so a wiped settings row alone
 * does not reopen it.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class SetupController extends Controller
{
    private const COMPLETED_KEY = 'setup_completed_at';

    /**
     * GET /api/v1/setup/status - unauthenticated by necessity: at this point
     * there is no account to authenticate with.
     */
    public function status(LicenseVerifier $verifier): JsonResponse
    {
        $state = $verifier->state();

        return response()->json([
            'success' => true,
            'data'    => [
                'setup_required' => ! $this->isComplete(),
                'license'        => [
                    'status'  => $state->status,
                    'message' => $state->message,
                    'domain'  => $state->domain,
                    // A licence that is missing or hard-failed must be sorted
                    // out before the wizard is worth running.
                    'ok'      => $state->status === LicenseState::STATUS_DISABLED || ! $state->isHardFailure(),
                ],
                'requirements'   => $this->requirements(),
            ],
        ]);
    }

    /** POST /api/v1/setup/complete */
    public function complete(Request $request, LicenseVerifier $verifier): JsonResponse
    {
        if ($this->isComplete()) {
            return response()->json([
                'success' => false,
                'message' => 'Setup has already been completed for this installation.',
                'code'    => 'SETUP_ALREADY_COMPLETE',
            ], 409);
        }

        // A hard licence failure blocks setup. Not to punish anyone - an
        // installation that cannot verify its licence should be fixed before an
        // administrator and a brand are configured on top of it.
        $state = $verifier->state();

        if ($state->isHardFailure()) {
            return response()->json([
                'success'        => false,
                'message'        => $state->message,
                'code'           => 'LICENSE_INVALID',
                'license_status' => $state->status,
            ], 403);
        }

        $validated = $request->validate([
            'app_name'        => ['required', 'string', 'max:60'],
            'app_description' => ['nullable', 'string', 'max:500'],
            'primary_color'   => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'logo_url'        => ['nullable', 'string', 'max:500'],
            'favicon_url'     => ['nullable', 'string', 'max:500'],
            'admin_site_title'=> ['nullable', 'string', 'max:60'],

            'admin_username'  => ['required', 'string', 'min:3', 'max:30', 'regex:/^[A-Za-z0-9._-]+$/', 'unique:users,username'],
            'admin_email'     => ['required', 'email', 'max:191', 'unique:users,email'],
            // Laravel's own uncompromised() check, so an installer cannot seed
            // the very first administrator with a known-breached password.
            'admin_password'  => ['required', 'confirmed', Password::min(12)->letters()->numbers()->symbols()->uncompromised()],

            'timezone'        => ['required', 'string', 'timezone'],
            'currency'        => ['required', 'string', 'size:3', 'alpha'],
            'language'        => ['required', 'string', 'max:10'],

            'storage_driver'  => ['nullable', 'string', 'in:local,s3,b2,r2'],

            'smtp_host'       => ['nullable', 'string', 'max:191'],
            'smtp_port'       => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_username'   => ['nullable', 'string', 'max:191'],
            'smtp_password'   => ['nullable', 'string', 'max:191'],
            'smtp_encryption' => ['nullable', 'string', 'in:tls,ssl,none'],
            'mail_from_name'  => ['nullable', 'string', 'max:100'],
            'mail_from_email' => ['nullable', 'email', 'max:191'],
        ]);

        $admin = DB::transaction(function () use ($validated) {
            // Re-check inside the transaction. Two simultaneous submissions of
            // the wizard would otherwise both pass the check above and both
            // create an administrator.
            if ($this->isComplete()) {
                return null;
            }

            $admin = User::create([
                'username'          => $validated['admin_username'],
                'email'             => $validated['admin_email'],
                'password'          => Hash::make($validated['admin_password']),
                'name'              => $validated['admin_username'],
                'role'              => 'super_admin',
                'email_verified_at' => now(),
            ]);

            foreach ([
                'app_name'         => $validated['app_name'],
                'app_description'  => $validated['app_description']  ?? null,
                'primary_color'    => $validated['primary_color']    ?? '#FE2C55',
                'secondary_color'  => $validated['secondary_color']  ?? '#25F4EE',
                'logo_url'         => $validated['logo_url']         ?? null,
                'favicon_url'      => $validated['favicon_url']      ?? null,
                'admin_site_title' => $validated['admin_site_title'] ?? $validated['app_name'] . ' Admin',
                'default_timezone' => $validated['timezone'],
                'default_currency' => strtoupper($validated['currency']),
                'default_language' => $validated['language'],
                'storage_driver'   => $validated['storage_driver']   ?? 'local',
            ] as $key => $value) {
                if ($value !== null) {
                    AppSetting::set($key, $value);
                }
            }

            // SMTP goes through the same settings store as everything else, but
            // the PASSWORD is deliberately not written here. Mail credentials
            // belong in .env, which the installer writes with 0600 permissions;
            // putting them in a database row makes them readable by anything
            // that can read the database, including a future SQL-injection bug.
            foreach ([
                'smtp_host'       => $validated['smtp_host']       ?? null,
                'smtp_port'       => $validated['smtp_port']       ?? null,
                'smtp_username'   => $validated['smtp_username']   ?? null,
                'smtp_encryption' => $validated['smtp_encryption'] ?? null,
                'mail_from_name'  => $validated['mail_from_name']  ?? $validated['app_name'],
                'mail_from_email' => $validated['mail_from_email'] ?? null,
            ] as $key => $value) {
                if ($value !== null) {
                    AppSetting::set($key, (string) $value);
                }
            }

            AppSetting::set(self::COMPLETED_KEY, now()->toIso8601String());

            return $admin;
        });

        if ($admin === null) {
            return response()->json([
                'success' => false,
                'message' => 'Setup has already been completed for this installation.',
                'code'    => 'SETUP_ALREADY_COMPLETE',
            ], 409);
        }

        return response()->json([
            'success' => true,
            'message' => 'Setup complete.',
            'data'    => [
                'admin_username' => $admin->username,
                'login_url'      => rtrim((string) config('app.frontend_url', config('app.url')), '/') . '/admin',
                'next_steps'     => [
                    'Sign in with the administrator account you just created.',
                    'Set your SMTP password in .env (MAIL_PASSWORD) and run: php artisan config:cache',
                    'Review Admin - Settings to finish configuring the platform.',
                ],
            ],
        ], 201);
    }

    /**
     * Complete means BOTH the marker row and at least one real administrator.
     * Either alone is forgeable or losable; together they are a sound answer to
     * "has this installation already been set up".
     */
    private function isComplete(): bool
    {
        if (AppSetting::get(self::COMPLETED_KEY) !== null) {
            return true;
        }

        return User::whereIn('role', ['admin', 'super_admin'])->exists();
    }

    /** @return array<int, array{name: string, ok: bool, detail: string}> */
    private function requirements(): array
    {
        $checks = [
            ['name' => 'PHP 8.2+',        'ok' => PHP_VERSION_ID >= 80200,          'detail' => PHP_VERSION],
            ['name' => 'OpenSSL',         'ok' => extension_loaded('openssl'),      'detail' => 'Required to verify the licence'],
            ['name' => 'PDO',             'ok' => extension_loaded('pdo'),          'detail' => 'Database access'],
            ['name' => 'Mbstring',        'ok' => extension_loaded('mbstring'),     'detail' => 'Text handling'],
            ['name' => 'GD or Imagick',   'ok' => extension_loaded('gd') || extension_loaded('imagick'), 'detail' => 'Image processing'],
            ['name' => 'Storage writable','ok' => is_writable(storage_path()),      'detail' => storage_path()],
        ];

        try {
            DB::connection()->getPdo();
            $checks[] = ['name' => 'Database connection', 'ok' => true, 'detail' => 'Connected'];
        } catch (\Throwable) {
            // The message can carry the DSN, host and username. Never returned.
            $checks[] = ['name' => 'Database connection', 'ok' => false, 'detail' => 'Could not connect - check your .env'];
        }

        return $checks;
    }
}
