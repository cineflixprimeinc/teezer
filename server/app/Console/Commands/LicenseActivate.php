<?php

namespace App\Console\Commands;

use App\Licensing\Client\LicenseStore;
use App\Licensing\Client\LicenseVerifier;
use App\Licensing\Support\DomainNormalizer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Registers this installation with the licence server and stores the signed
 * token locally. Called by install.sh, and re-runnable by hand.
 *
 * This is ONE of only three moments a customer installation ever talks to us
 * (the others being the scheduled heartbeat and an explicit update). After it
 * completes, the installation verifies its licence entirely offline.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class LicenseActivate extends Command
{
    protected $signature = 'license:activate
                            {--purchase-code= : Marketplace purchase code}
                            {--license-key= : Licence key from teezer.live/activate-license}
                            {--domain= : The domain this installation serves}
                            {--non-interactive : Fail instead of prompting for missing values}';

    protected $description = 'Activate this Teezer installation against the licence server';

    public function handle(LicenseStore $store, LicenseVerifier $verifier): int
    {
        // Secrets come in as options rather than arguments so they do not end
        // up in a shell history file as positional text, and the installer
        // pipes them on stdin rather than passing them at all where it can.
        $purchaseCode = (string) ($this->option('purchase-code') ?: $this->promptSecret('Purchase code'));
        $licenseKey   = (string) ($this->option('license-key')   ?: $this->promptSecret('Licence key'));
        $domain       = (string) ($this->option('domain')        ?: $this->promptDomain());

        if ($purchaseCode === '' || $licenseKey === '' || $domain === '') {
            $this->error('Purchase code, licence key and domain are all required.');

            return self::FAILURE;
        }

        $normalizedDomain = DomainNormalizer::normalize($domain);

        if ($normalizedDomain === null) {
            $this->error('"' . $domain . '" is not a valid domain name.');

            return self::FAILURE;
        }

        // Generated once and then reused. Re-running activation on the same box
        // must present the SAME installation id, or the licence server sees a
        // second installation and refuses.
        $installationId = $store->installationId() ?? LicenseStore::generateInstallationId();

        $endpoint = rtrim((string) config('licensing.client.server_url'), '/') . '/license/install';

        $this->info('Contacting the licence server...');

        try {
            $response = Http::timeout((int) config('licensing.client.http_timeout', 15))
                ->acceptJson()
                ->post($endpoint, [
                    'purchase_code'   => $purchaseCode,
                    'license_key'     => $licenseKey,
                    'domain'          => $normalizedDomain,
                    'installation_id' => $installationId,
                    'version'         => $this->currentVersion(),
                    'php_version'     => PHP_VERSION,
                    'server_os'       => php_uname('s') . ' ' . php_uname('r'),
                ]);
        } catch (\Throwable $e) {
            // The exception message can contain the full request URL but never
            // the body, so this is safe to print. Still no secrets echoed.
            $this->error('Could not reach the licence server: ' . $e->getMessage());
            $this->line('Check outbound HTTPS from this server, then run: php artisan license:activate');

            return self::FAILURE;
        }

        $body = $response->json() ?? [];

        if (! $response->successful() || ! ($body['success'] ?? false)) {
            $this->error($body['message'] ?? 'Activation failed.');

            if (! empty($body['code'])) {
                $this->line('Reason: ' . $body['code']);
            }

            return self::FAILURE;
        }

        $written = $store->write([
            'token'              => $body['data']['token'],
            'installation_id'    => $installationId,
            'domain'             => $normalizedDomain,
            'license_id'         => $body['data']['license_id'] ?? null,
            'activated_at'       => now()->toIso8601String(),
            'last_verified_at'   => now()->toIso8601String(),
            'last_verify_status' => 'active',
        ]);

        if (! $written) {
            $this->error('Activation succeeded but the licence file could not be written to '
                . $store->path() . '. Check directory permissions and re-run.');

            return self::FAILURE;
        }

        $verifier->forget();
        $state = $verifier->verify();

        $this->line('');
        $this->info('Activated.');
        $this->line('  Domain          ' . $normalizedDomain);
        $this->line('  Installation    ' . $installationId);
        $this->line('  Licence file    ' . $store->path());
        $this->line('  Local check     ' . $state->status);
        $this->line('');

        if ($state->status !== 'valid') {
            $this->warn('The licence was issued but does not verify locally yet: ' . $state->message);
            $this->warn('This usually means APP_URL does not match the licensed domain.');

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function promptSecret(string $label): string
    {
        if ($this->option('non-interactive')) {
            return '';
        }

        // secret() so the value is not echoed to the terminal or captured by a
        // scrollback buffer or screen recording.
        return (string) $this->secret($label);
    }

    private function promptDomain(): string
    {
        $default = DomainNormalizer::normalize((string) config('app.url')) ?? '';

        if ($this->option('non-interactive')) {
            return $default;
        }

        return (string) $this->ask('Domain', $default);
    }

    private function currentVersion(): ?string
    {
        $file = base_path('VERSION');

        return is_file($file) ? trim((string) file_get_contents($file)) : null;
    }
}
