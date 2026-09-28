<?php

namespace App\Console\Commands;

use App\Licensing\Client\LicenseStore;
use App\Licensing\Client\LicenseVerifier;
use App\Licensing\Support\LicenseTokenCodec;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The ONLY scheduled outbound licence call, and the only mechanism by which a
 * revocation reaches an installation that is otherwise fully self-sufficient.
 *
 * Runs daily by default (routes/console.php). It does two things:
 *   - renews the signed token, so a healthy installation silently rolls
 *     forward and never enters its grace window
 *   - records whatever the licence server says about status, which is what
 *     LicenseVerifier reads to discover a revocation offline
 *
 * IT NEVER BREAKS THE SITE. If the licence server is unreachable, this exits 0
 * having changed nothing: the existing token stays valid until it expires, then
 * grace, then stale - and stale defaults to warn, not block. Section 14 in one
 * sentence: our downtime is never the customer's outage.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class LicenseHeartbeat extends Command
{
    protected $signature = 'license:heartbeat {--quiet-fail : Always exit 0, for cron}';

    protected $description = 'Re-verify this installation with the licence server (scheduled)';

    public function handle(LicenseStore $store, LicenseVerifier $verifier): int
    {
        if (! config('licensing.client.enabled')) {
            // This is the licensor's own installation. Nothing to do.
            return self::SUCCESS;
        }

        $record = $store->read();

        if ($record === null || empty($record['token'])) {
            $this->warn('No licence file - nothing to verify. Run: php artisan license:activate');

            return $this->option('quiet-fail') ? self::SUCCESS : self::FAILURE;
        }

        // The licence KEY is not in the licence file, by design - the file
        // holds only the signed token. The key lives in the environment, put
        // there by the installer, so a leaked licence file is not a licence.
        $licenseKey = (string) config('licensing.client.license_key');

        if ($licenseKey === '') {
            $this->warn('LICENSE_KEY is not set; cannot heartbeat. The installation keeps running on its existing token.');

            return $this->option('quiet-fail') ? self::SUCCESS : self::FAILURE;
        }

        $endpoint = rtrim((string) config('licensing.client.server_url'), '/') . '/license/verify';

        try {
            $response = Http::timeout((int) config('licensing.client.http_timeout', 15))
                ->acceptJson()
                ->post($endpoint, [
                    'license_key'     => $licenseKey,
                    'installation_id' => $record['installation_id'] ?? '',
                    'domain'          => $record['domain'] ?? '',
                    'version'         => $this->currentVersion(),
                ]);
        } catch (\Throwable $e) {
            // Deliberately not an error-level log: an unreachable licence
            // server is an expected, survivable condition, and logging it as an
            // error would page somebody for our own downtime.
            Log::info('Licence heartbeat could not reach the licence server.', ['error' => $e->getMessage()]);
            $this->warn('Licence server unreachable. The installation continues on its existing licence.');

            return self::SUCCESS;
        }

        $body = $response->json() ?? [];
        $data = $body['data'] ?? [];
        $status = strtolower((string) ($data['status'] ?? ''));

        if (($body['success'] ?? false) && ! empty($data['token'])) {
            // Only accept a token that actually parses and is for us. A
            // malformed or hostile response must never clobber a working
            // licence file.
            $decoded = LicenseTokenCodec::decode((string) $data['token']);

            if ($decoded === null) {
                $this->warn('The licence server returned a token that could not be parsed. Keeping the existing licence.');

                return self::SUCCESS;
            }

            $record['token']              = $data['token'];
            $record['last_verified_at']   = now()->toIso8601String();
            $record['last_verify_status'] = $status !== '' ? $status : 'active';
            $record['last_verify_message'] = $body['message'] ?? null;

            $store->write($record);
            $verifier->forget();

            $this->info('Licence verified. Valid until ' . ($data['expires_at'] ?? 'unknown') . '.');

            return self::SUCCESS;
        }

        // A negative verdict (revoked / suspended) is recorded locally so the
        // verifier picks it up. Still no data is touched, nothing is deleted,
        // and the site is not redirected anywhere.
        if ($status !== '') {
            $store->touchVerification($status, $body['message'] ?? null);
            $verifier->forget();

            $this->error('Licence status: ' . $status . '. ' . ($body['message'] ?? ''));

            return $this->option('quiet-fail') ? self::SUCCESS : self::FAILURE;
        }

        $this->warn('Licence server gave an inconclusive answer. Keeping the existing licence.');

        return self::SUCCESS;
    }

    private function currentVersion(): ?string
    {
        $file = base_path('VERSION');

        return is_file($file) ? trim((string) file_get_contents($file)) : null;
    }
}
