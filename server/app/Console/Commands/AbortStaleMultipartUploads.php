<?php

namespace App\Console\Commands;

use App\Services\MediaPresignService;
use Illuminate\Console\Command;

/**
 * Abort multipart uploads nobody ever finished.
 *
 * A client that calls multipart/create and multipart/sign but never reaches
 * multipart/complete or multipart/abort - a crash, a closed tab, a
 * deliberately abandoned upload used to run up storage costs - leaves every
 * part it already sent sitting in the bucket. B2 bills those parts like any
 * other stored bytes, and they're invisible in a normal object listing (they
 * aren't a real object yet), so nothing else in this app would ever notice or
 * clean them up.
 *
 * There is no "pending upload" table to query (MediaPresignService's own
 * docblock explains why: B2 is the source of truth for what's in progress),
 * so this asks B2 directly via listMultipartUploads and aborts anything older
 * than the grace window - long enough that a real user resuming a slow/
 * interrupted upload the next day is unaffected (the whole point of
 * multipart's resumability), short enough that abandoned parts don't sit
 * around indefinitely.
 *
 *   php artisan videos:abort-stale-multipart-uploads
 *   php artisan videos:abort-stale-multipart-uploads --hours=48 --dry-run
 */
class AbortStaleMultipartUploads extends Command
{
    protected $signature = 'videos:abort-stale-multipart-uploads
                            {--hours=48 : Abort uploads initiated longer ago than this}
                            {--dry-run  : List what would be aborted, abort nothing}';

    protected $description = 'Abort in-progress multipart uploads nobody ever completed or cancelled';

    /** The three directories MultipartUploadController::directoryFor() ever issues. */
    private const DIRECTORIES = ['videos/original', 'stories', 'thumbnails'];

    public function handle(MediaPresignService $presign): int
    {
        $hours   = max(1, (int) $this->option('hours'));
        $cutoff  = now()->subHours($hours);
        $dryRun  = (bool) $this->option('dry-run');
        $aborted = 0;
        $skipped = 0;

        foreach (self::DIRECTORIES as $directory) {
            try {
                $uploads = $presign->listInProgressMultipartUploads($directory);
            } catch (\Throwable $e) {
                $this->error("Could not list uploads under {$directory}: {$e->getMessage()}");
                continue;
            }

            foreach ($uploads as $u) {
                $initiated = $u['Initiated'] instanceof \DateTimeInterface
                    ? \Illuminate\Support\Carbon::instance($u['Initiated'])
                    : \Illuminate\Support\Carbon::parse((string) $u['Initiated']);

                if ($initiated->greaterThan($cutoff)) {
                    $skipped++;
                    continue;
                }

                $this->line(($dryRun ? '[dry-run] would abort ' : 'aborting ') . "{$u['Key']} (initiated {$initiated->diffForHumans()})");

                if (!$dryRun) {
                    try {
                        $presign->abortMultipartUpload($u['Key'], $u['UploadId']);
                    } catch (\Throwable $e) {
                        $this->error("  failed: {$e->getMessage()}");
                        continue;
                    }
                }

                $aborted++;
            }
        }

        $this->info(($dryRun ? 'Would abort' : 'Aborted') . " {$aborted} stale upload(s); {$skipped} still within the {$hours}h grace window.");

        return self::SUCCESS;
    }
}
