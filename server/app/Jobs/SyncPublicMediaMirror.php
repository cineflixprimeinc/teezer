<?php

namespace App\Jobs;

use App\Models\Video;
use App\Services\PublicMediaMirrorService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Queued wrapper around PublicMediaMirrorService::sync(), dispatched from
 * VideoObserver whenever a field that can move the public/private boundary -
 * or the mirrored bytes themselves - changes.
 *
 * Runs on the `media-mirror` queue (see deploy/pm2/ecosystem.worker.config.js),
 * not the default one: a real HLS-prefix copy for a multi-minute video can be
 * dozens to hundreds of objects, which would exceed the default queue's 120s
 * worker timeout. Keeping it off `transcoding` prevents B2 copy/verification
 * work from delaying the FFmpeg jobs that make fresh uploads playable.
 */
class SyncPublicMediaMirror implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Same margin-below-the-worker-timeout pattern as TranscodeVideoToHls's own 3500-vs-3600. */
    public int $timeout = 3500;

    /**
     * Higher than a typical job's tries: PublicMediaMirrorService::sync()
     * throws when its own internal verification retries (~2.6 minutes) don't
     * confirm the mirror is actually reachable yet, so each try here buys
     * another such window. Observed in production that B2 propagation for a
     * freshly-copied object can take considerably longer than one window -
     * six tries at a 60s backoff spreads verification out over roughly
     * 20+ minutes total before giving up and landing in failed_jobs, closer
     * to the worst case actually seen rather than the couple of minutes a
     * single retry would give.
     */
    public int $tries   = 6;
    public int $backoff = 60;

    /**
     * One sync per video at a time, same reasoning as TranscodeVideoToHls's
     * own uniqueFor - a worker restart must not let two syncs race and
     * interleave copies/deletes for the same video. Long enough to cover the
     * full multi-try verification window above (a released/retried attempt
     * must stay covered by the same lock, or a concurrent dispatch could
     * race it) rather than TranscodeVideoToHls's reasoning of "shouldn't
     * outlive a rapid double-transition" - 1800s covers six 60s-spaced tries
     * plus their own verification time with room to spare.
     */
    public int $uniqueFor = 1800;

    public function __construct(
        /** ID only for the normal case, re-read fresh inside the service - a job that sat in the queue while the row changed must act on what the row is NOW. */
        public readonly int $videoId,
        /**
         * Set only when dispatched for a forceDelete() (hard delete). By the
         * time this job runs, the row is genuinely gone - even
         * Video::withTrashed()->find() finds nothing once forceDelete() has
         * run, unlike a soft-delete where the row still exists with
         * deleted_at set. VideoObserver::deleted() captures these values from
         * the in-memory model (still populated at event-fire time even
         * though the DB row is already gone) so purge still has something to
         * act on.
         */
        public readonly bool $isHardDelete = false,
        public readonly ?string $deletedVideoUrl = null,
        public readonly ?string $deletedThumbnailUrl = null,
        public readonly array $deletedQualityKeys = [],
    ) {
    }

    public function uniqueId(): string
    {
        return "public-mirror-{$this->videoId}";
    }

    public function handle(PublicMediaMirrorService $mirror): void
    {
        if ($this->isHardDelete) {
            $mirror->purgeByKeys($this->videoId, $this->deletedVideoUrl, $this->deletedThumbnailUrl, $this->deletedQualityKeys);
            return;
        }

        // withTrashed(): a soft-delete must still reach purge(), not silently
        // no-op because the default query scope excludes it.
        $video = Video::withTrashed()->find($this->videoId);
        if (! $video) {
            return;
        }

        $stateBeforeSync = PublicMediaMirrorService::isPublic($video);

        $mirror->sync($video);

        // Self-heal a dropped concurrent dispatch: ShouldBeUnique silently
        // drops any dispatch that lands while this one is still running, so a
        // status flip that arrived mid-copy would otherwise leave the mirror
        // wrong until some unrelated field edit happens to fire the Observer
        // again. Re-check once and re-dispatch if the state moved.
        $video = Video::withTrashed()->find($this->videoId);
        if ($video && PublicMediaMirrorService::isPublic($video) !== $stateBeforeSync) {
            self::dispatch($this->videoId)->onQueue('media-mirror');
        }
    }
}
