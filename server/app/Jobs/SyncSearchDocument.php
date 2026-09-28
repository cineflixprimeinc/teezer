<?php

namespace App\Jobs;

use App\Models\AudioTrack;
use App\Models\Hashtag;
use App\Models\User;
use App\Models\Video;
use App\Services\SearchService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Keep one Typesense document in step with one Postgres row.
 *
 * Indexing used to happen INSIDE the web request: each observer called Typesense
 * directly, with a 2s connect timeout, and swallowed any error. That put a
 * network round trip on the critical path of every video and user write, and -
 * because the error was swallowed - a Typesense hiccup silently drifted the index
 * with no way to notice or repair it.
 *
 * This job moves that work onto the queue. It carries only a TYPE and an ID, not
 * a serialized model, and re-reads the row itself: a job that sat in the queue
 * while the row changed must index what the row is NOW, not what it was when the
 * job was created.
 *
 * Failures are allowed to surface here (the queue retries, then records it in
 * `failed_jobs`), and `search:reconcile` sweeps up anything still missing.
 */
class SyncSearchDocument implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 30;
    public int $timeout = 30;

    public const TYPE_VIDEO = 'video';
    public const TYPE_USER = 'user';
    public const TYPE_HASHTAG = 'hashtag';
    public const TYPE_SOUND = 'sound';

    public function __construct(
        public readonly string $type,
        public readonly int $id,
        /** 'upsert' | 'remove' */
        public readonly string $action = 'upsert',
    ) {}

    /**
     * De-duplicate bursts. A video edited three times in a second only needs the
     * last state indexed, and the queue may hold all three by then.
     */
    public function uniqueId(): string
    {
        return "search:{$this->type}:{$this->id}:{$this->action}";
    }

    public function handle(SearchService $search): void
    {
        if ($this->action === 'remove') {
            match ($this->type) {
                self::TYPE_VIDEO   => $search->removeVideo($this->id),
                self::TYPE_USER    => $search->removeUser($this->id),
                self::TYPE_HASHTAG => $search->removeHashtag($this->id),
                self::TYPE_SOUND   => $search->removeSound($this->id),
                default            => null,
            };
            return;
        }

        // Re-read rather than trusting anything captured at dispatch time.
        $model = match ($this->type) {
            self::TYPE_VIDEO   => Video::with(['user', 'hashtags'])->find($this->id),
            self::TYPE_USER    => User::find($this->id),
            self::TYPE_HASHTAG => Hashtag::find($this->id),
            self::TYPE_SOUND   => AudioTrack::find($this->id),
            default            => null,
        };

        // Row deleted between dispatch and run: make the index agree.
        if (! $model) {
            match ($this->type) {
                self::TYPE_VIDEO   => $search->removeVideo($this->id),
                self::TYPE_USER    => $search->removeUser($this->id),
                self::TYPE_HASHTAG => $search->removeHashtag($this->id),
                self::TYPE_SOUND   => $search->removeSound($this->id),
                default            => null,
            };
            return;
        }

        match ($this->type) {
            self::TYPE_VIDEO   => $search->upsertVideo($model),
            self::TYPE_USER    => $search->upsertUser($model),
            self::TYPE_HASHTAG => $search->upsertHashtag($model),
            self::TYPE_SOUND   => $search->upsertSound($model),
            default            => null,
        };
    }

    /**
     * Search being briefly stale is not worth alarming about - `search:reconcile`
     * will pick the row up on its next pass. Logged so a persistent outage is
     * still visible.
     */
    public function failed(\Throwable $e): void
    {
        Log::warning('search.index_failed', [
            'type'   => $this->type,
            'id'     => $this->id,
            'action' => $this->action,
            'error'  => $e->getMessage(),
        ]);
    }
}
