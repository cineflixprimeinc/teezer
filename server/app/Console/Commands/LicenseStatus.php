<?php

namespace App\Console\Commands;

use App\Licensing\Client\LicenseState;
use App\Licensing\Client\LicenseStore;
use App\Licensing\Client\LicenseVerifier;
use Illuminate\Console\Command;

/**
 * Shows this installation's licence status. Purely local - it does not contact
 * the licence server, which is what makes it useful when the licence server is
 * exactly the thing you are trying to rule out.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class LicenseStatus extends Command
{
    protected $signature = 'license:status {--json : Machine-readable output}';

    protected $description = 'Show the local licence status for this installation';

    public function handle(LicenseStore $store, LicenseVerifier $verifier): int
    {
        $verifier->forget();
        $state = $verifier->verify();

        if ($this->option('json')) {
            $this->line((string) json_encode($state->jsonSerialize(), JSON_PRETTY_PRINT));

            return $state->allowsService() ? self::SUCCESS : self::FAILURE;
        }

        $this->line('');
        $this->line('  Status            ' . strtoupper($state->status));
        $this->line('  ' . $state->message);
        $this->line('');
        $this->line('  Licence ID        ' . ($state->licenseId ?? '-'));
        $this->line('  Licensed domain   ' . ($state->domain ?? '-'));
        $this->line('  Configured domain ' . ($verifier->configuredDomain() ?? '-'));
        $this->line('  Installation      ' . ($state->installationId ?? '-'));
        $this->line('  Owner             ' . ($state->username ?? '-'));
        $this->line('  Token expires     ' . ($state->expiresAt ?? '-'));
        $this->line('  Last verified     ' . ($state->lastVerifiedAt ?? 'never'));
        $this->line('  Licence file      ' . $store->path());
        $this->line('');

        // The single most common real-world failure, called out explicitly
        // rather than left for someone to work out from two similar strings.
        if ($state->status === LicenseState::STATUS_MISMATCH) {
            $this->warn('The licensed domain and the configured domain do not match.');
            $this->line('Set APP_URL to your licensed domain, run `php artisan config:cache`, and try again.');
            $this->line('');
        }

        if ($state->status === LicenseState::STATUS_MISSING) {
            $this->line('Run: php artisan license:activate');
            $this->line('');
        }

        return $state->allowsService() ? self::SUCCESS : self::FAILURE;
    }
}
