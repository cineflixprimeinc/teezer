<?php

namespace App\Console\Commands;

use App\Licensing\Server\LicenseSigner;
use App\Models\LicenseRelease;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Uploads a built marketplace package to the PRIVATE B2 bucket and adds it to
 * the release catalogue.
 *
 * Run by the operator after scripts/build-marketplace-release.sh has produced a
 * package AND scripts/check-release-secrets.sh has passed. The command re-runs
 * the secret scan's most important assertion itself (below) rather than trusting
 * that someone remembered to, because publishing a package with a production
 * .env in it is the single worst outcome this whole system can produce.
 *
 * LICENSOR-SIDE ONLY - excluded from the marketplace package.
 */
class LicenseReleasePublish extends Command
{
    protected $signature = 'license:release-publish
                            {file : Path to the built .tar.gz package}
                            {version : Semantic version, e.g. 1.4.0}
                            {--channel=stable : Release channel}
                            {--notes= : Release notes shown to customers}
                            {--mandatory : Mark this release as mandatory}
                            {--publish : Make it downloadable immediately}';

    protected $description = 'Upload a release package to private storage and add it to the catalogue';

    public function handle(LicenseSigner $signer): int
    {
        $file    = (string) $this->argument('file');
        $version = (string) $this->argument('version');
        $channel = (string) $this->option('channel');

        if (! is_file($file)) {
            $this->error('No such file: ' . $file);

            return self::FAILURE;
        }

        if (preg_match('/^\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?$/', $version) !== 1) {
            $this->error('Version must look like 1.4.0 or 1.4.0-beta.1');

            return self::FAILURE;
        }

        if (LicenseRelease::where('version', $version)->where('channel', $channel)->exists()) {
            $this->error('Version ' . $version . ' already exists on the ' . $channel . ' channel.');

            return self::FAILURE;
        }

        if (! $signer->isConfigured()) {
            $this->error('No signing key. Run: php artisan license:keygen');

            return self::FAILURE;
        }

        if (! $this->releaseStorageIsSafe()) {
            return self::FAILURE;
        }

        // Last line of defence before a package leaves the building. Cheap,
        // and the failure it prevents is catastrophic and irreversible.
        if (! $this->packageLooksClean($file)) {
            return self::FAILURE;
        }

        $this->info('Hashing...');
        $checksum = hash_file('sha256', $file);

        if ($checksum === false) {
            $this->error('Could not hash the package.');

            return self::FAILURE;
        }

        $disk   = (string) config('licensing.server.release_disk');
        $prefix = trim((string) config('licensing.server.release_prefix'), '/');
        $key    = $prefix . '/' . $channel . '/reelsoo-' . $version . '.tar.gz';

        $this->info('Uploading to ' . $disk . ':' . $key . ' ...');

        $handle = fopen($file, 'rb');

        if ($handle === false) {
            $this->error('Could not open the package for reading.');

            return self::FAILURE;
        }

        try {
            // Explicitly private. If the bucket's default ever changes, this
            // still refuses to make a release world-readable.
            $uploaded = Storage::disk($disk)->put($key, $handle, ['visibility' => 'private']);
        } finally {
            fclose($handle);
        }

        if (! $uploaded) {
            $this->error('Upload failed.');

            return self::FAILURE;
        }

        $release = LicenseRelease::create([
            'version'         => $version,
            'channel'         => $channel,
            'object_key'      => $key,
            'checksum_sha256' => $checksum,
            'signature'       => $signer->signRaw($checksum),
            'size_bytes'      => filesize($file) ?: null,
            'release_notes'   => $this->option('notes'),
            'is_published'    => (bool) $this->option('publish'),
            'is_mandatory'    => (bool) $this->option('mandatory'),
            'released_at'     => now(),
        ]);

        $this->line('');
        $this->info('Release ' . $version . ' uploaded.');
        $this->line('  Checksum   ' . $checksum);
        $this->line('  Size       ' . number_format((float) $release->size_bytes / 1048576, 1) . ' MB');
        $this->line('  Published  ' . ($release->is_published ? 'yes' : 'no (pass --publish when ready)'));
        $this->line('');
        $this->line('Customers receive a presigned URL valid for '
            . config('licensing.server.release_url_ttl_minutes') . ' minutes. The bucket stays private.');

        return self::SUCCESS;
    }

    /**
     * Refuse to upload unless releases have their own private bucket.
     *
     * The failure this prevents: LICENSE_RELEASE_DISK defaulting to the media
     * disk and a 66MB package landing in the bucket that cdn.reelsoo.com proxies
     * straight through (deploy/nginx/reelsoo-media.conf does
     * `proxy_pass https://b2_origin/file/$b2_bucket$uri`). The product source
     * would then be downloadable at a guessable URL with no licence check at
     * all - and nothing would look broken, which is why this is checked here
     * rather than left to whoever writes the .env.
     */
    private function releaseStorageIsSafe(): bool
    {
        $disk = (string) config('licensing.server.release_disk');
        $config = config("filesystems.disks.{$disk}");

        if (! is_array($config)) {
            $this->error("Release disk '{$disk}' is not defined in config/filesystems.php.");

            return false;
        }

        if (empty($config['bucket']) || empty($config['key']) || empty($config['secret'])) {
            $this->error("Release storage is not configured.");
            $this->line('');
            $this->line("  Disk '{$disk}' is missing its bucket or credentials.");
            $this->line('');
            $this->warn('Create a SEPARATE PRIVATE B2 bucket for releases - not the media bucket -');
            $this->warn('with an application key scoped to that bucket alone, then set:');
            $this->line('');
            $this->line('  B2_RELEASES_BUCKET=CHANGE_ME_RELEASES_BUCKET');
            $this->line('  B2_RELEASES_APPLICATION_KEY_ID=...');
            $this->line('  B2_RELEASES_APPLICATION_KEY=...');
            $this->line('');
            $this->line('  php artisan config:cache');

            return false;
        }

        // Same bucket as media is the specific mistake worth naming out loud.
        $mediaBucket = (string) config('filesystems.disks.b2.bucket');

        if ($mediaBucket !== '' && $config['bucket'] === $mediaBucket) {
            $this->error('Refusing to publish: releases and media would share one bucket.');
            $this->line('');
            $this->line("  Both resolve to '{$mediaBucket}', which is proxied publicly by");
            $this->line('  cdn.teezer.live. A release there is downloadable without a licence.');
            $this->line('');
            $this->line('  Use a separate bucket for B2_RELEASES_BUCKET.');

            return false;
        }

        if (($config['visibility'] ?? null) !== 'private') {
            $this->error("Refusing to publish: disk '{$disk}' is not configured private.");

            return false;
        }

        return true;
    }

    /**
     * Refuse to publish a package containing anything that looks like a
     * production secret.
     *
     * Reads the archive's file LIST only (tar -tzf), not its contents: the
     * question here is "is a file that should never ship present at all",
     * which the listing answers, and streaming a multi-hundred-megabyte
     * archive through a content scan to re-answer it would be slow for no gain.
     */
    private function packageLooksClean(string $file): bool
    {
        $listing = [];
        $status  = 0;

        @exec('tar -tzf ' . escapeshellarg($file) . ' 2>&1', $listing, $status);

        if ($status !== 0) {
            $this->warn('Could not read the archive listing to check for secrets.');

            return $this->confirm('Publish anyway?', false);
        }

        $forbidden = [
            '#(^|/)\.env$#',
            '#(^|/)\.env\.(production|local|backup)#',
            '#(^|/)license-signing-key\.pem$#',
            '#(^|/)private\.pem$#',
            '#(^|/)id_rsa$#',
            '#(^|/)id_ed25519$#',
            '#(^|/)\.git/#',
            '#(^|/)storage/app/license/#',
            '#\.(sql|dump)$#',
            '#(^|/)app/Licensing/Server/#',
        ];

        $hits = [];

        foreach ($listing as $entry) {
            foreach ($forbidden as $pattern) {
                if (preg_match($pattern, $entry) === 1) {
                    $hits[] = $entry;
                    break;
                }
            }
        }

        if ($hits !== []) {
            $this->error('This package contains files that must never ship:');

            foreach (array_slice($hits, 0, 30) as $hit) {
                $this->line('  ' . $hit);
            }

            if (count($hits) > 30) {
                $this->line('  ... and ' . (count($hits) - 30) . ' more');
            }

            $this->line('');
            $this->error('Refusing to publish. Rebuild with scripts/build-marketplace-release.sh.');

            return false;
        }

        return true;
    }
}
