<?php

namespace App\Console\Commands;

use App\Licensing\Client\LicenseStore;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * `teezer update` - the ONLY normal situation in which a customer installation
 * deliberately talks to our infrastructure.
 *
 * This command does the licence half of the flow: it authorises the download
 * and verifies the package. The file-level work (backup, extract, migrate,
 * health check) is done by the shell wrapper bin/teezer, because unpacking a
 * new copy of the application over the top of the PHP process that is currently
 * executing is not something to attempt from inside that process - the class
 * files change underneath it mid-run.
 *
 * So: this authorises and verifies, the wrapper swaps the files. Each half does
 * the part it can do safely.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class TeezerUpdate extends Command
{
    protected $signature = 'teezer:update
                            {--check : Only report whether an update is available}
                            {--version= : Request a specific version instead of the latest}
                            {--channel=stable : Release channel}
                            {--download-to= : Directory to download the package into}
                            {--json : Machine-readable output, for the bin/teezer wrapper}';

    protected $description = 'Check for, authorise and download a Teezer update';

    public function handle(LicenseStore $store): int
    {
        $record = $store->read();

        if ($record === null || empty($record['installation_id'])) {
            return $this->bail('This installation is not activated. Run: php artisan license:activate');
        }

        $licenseKey = (string) config('licensing.client.license_key');

        if ($licenseKey === '') {
            // Per section 17: if we cannot find the stored credential, ask for
            // it rather than failing. An operator running an update by hand is
            // in a position to type it.
            if ($this->option('json') || ! $this->input->isInteractive()) {
                return $this->bail('LICENSE_KEY is not set in .env, and there is no terminal to prompt on.');
            }

            $licenseKey = (string) $this->secret('Licence key');
        }

        if ($licenseKey === '') {
            return $this->bail('A licence key is required to download updates.');
        }

        $endpoint = rtrim((string) config('licensing.client.server_url'), '/') . '/license/release';

        try {
            $response = Http::timeout((int) config('licensing.client.http_timeout', 15))
                ->acceptJson()
                ->post($endpoint, [
                    'license_key'     => $licenseKey,
                    'installation_id' => $record['installation_id'],
                    'domain'          => $record['domain'] ?? '',
                    'version'         => $this->option('version'),
                    'channel'         => $this->option('channel'),
                ]);
        } catch (\Throwable $e) {
            return $this->bail('Could not reach the update server: ' . $e->getMessage());
        }

        $body = $response->json() ?? [];

        if (! ($body['success'] ?? false)) {
            return $this->bail($body['message'] ?? 'Update authorisation was refused.');
        }

        $data = $body['data'];
        $current = $this->currentVersion();

        if ($current !== null && $current === $data['version']) {
            $this->output(['status' => 'up_to_date', 'version' => $current]);

            if (! $this->option('json')) {
                $this->info('Already on the latest version (' . $current . ').');
            }

            return self::SUCCESS;
        }

        if ($this->option('check')) {
            $this->output([
                'status'       => 'update_available',
                'version'      => $data['version'],
                'current'      => $current,
                'is_mandatory' => $data['is_mandatory'] ?? false,
                'notes'        => $data['release_notes'] ?? null,
            ]);

            if (! $this->option('json')) {
                $this->info('Update available: ' . $data['version'] . ' (currently ' . ($current ?? 'unknown') . ')');

                if (! empty($data['release_notes'])) {
                    $this->line('');
                    $this->line($data['release_notes']);
                }
            }

            return self::SUCCESS;
        }

        $directory = $this->option('download-to') ?: storage_path('app/updates');

        if (! is_dir($directory) && ! @mkdir($directory, 0750, true) && ! is_dir($directory)) {
            return $this->bail('Could not create ' . $directory);
        }

        $target = rtrim($directory, '/\\') . '/teezer-' . $data['version'] . '.tar.gz';

        if (! $this->option('json')) {
            $this->info('Downloading ' . $data['version'] . '...');
        }

        // Streamed to disk rather than held in memory: a release package is
        // hundreds of megabytes and PHP's memory_limit is not.
        try {
            $downloaded = Http::timeout(1800)->sink($target)->get($data['download_url']);
        } catch (\Throwable $e) {
            @unlink($target);

            return $this->bail('Download failed: ' . $e->getMessage());
        }

        if (! $downloaded->successful()) {
            @unlink($target);

            return $this->bail('Download failed with HTTP ' . $downloaded->status() . '.');
        }

        // Checksum BEFORE anything is unpacked. A presigned URL is signed by
        // us, but the bytes still travel over someone else's network, and a
        // truncated download is far more likely than a hostile one.
        $actual = hash_file('sha256', $target);

        if (! hash_equals((string) $data['checksum'], (string) $actual)) {
            @unlink($target);

            return $this->bail('Checksum mismatch - the downloaded package was discarded.');
        }

        if (! empty($data['signature']) && ! $this->signatureIsValid((string) $data['checksum'], (string) $data['signature'])) {
            @unlink($target);

            return $this->bail('The release signature could not be verified - the package was discarded.');
        }

        $this->output([
            'status'  => 'downloaded',
            'version' => $data['version'],
            'path'    => $target,
        ]);

        if (! $this->option('json')) {
            $this->line('');
            $this->info('Downloaded and verified: ' . $target);
            $this->line('Run `teezer update` (the wrapper) to back up, apply and migrate.');
        }

        return self::SUCCESS;
    }

    /**
     * The release checksum is signed by the same key that signs licences, so
     * the public key already on this installation verifies it. No extra trust
     * material and no extra distribution problem.
     */
    private function signatureIsValid(string $checksum, string $base64Signature): bool
    {
        $path = (string) config('licensing.client.public_key_path');

        if (! is_file($path)) {
            return false;
        }

        $key = @openssl_pkey_get_public((string) file_get_contents($path));

        if ($key === false) {
            return false;
        }

        $signature = base64_decode($base64Signature, true);

        if ($signature === false) {
            return false;
        }

        return openssl_verify($checksum, $signature, $key, OPENSSL_ALGO_SHA256) === 1;
    }

    private function currentVersion(): ?string
    {
        $file = base_path('VERSION');

        return is_file($file) ? trim((string) file_get_contents($file)) : null;
    }

    private function output(array $payload): void
    {
        if ($this->option('json')) {
            $this->line((string) json_encode($payload));
        }
    }

    private function bail(string $message): int
    {
        if ($this->option('json')) {
            $this->line((string) json_encode(['status' => 'error', 'message' => $message]));
        } else {
            $this->error($message);
        }

        return self::FAILURE;
    }
}
