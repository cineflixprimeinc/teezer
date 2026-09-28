<?php

namespace App\Observers\Analytics;

use App\Services\Analytics\EventStream;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared base for the like / save / share / comment observers.
 *
 * All four are the same shape, so they share this rather than four near-identical
 * copies that drift apart the first time someone fixes a bug in one of them.
 *
 * `deleted` is where the signed-delta model earns its keep. Postgres records an
 * unlike by DELETEing the row - destroying the fact it ever happened, which is why
 * AggregateCreatorAnalytics warns that a missed nightly run loses history for good.
 * Here the deletion is ITSELF an event, with delta = -1. ClickHouse can therefore
 * reconstruct a history that Postgres has already thrown away, and `sum(delta)`
 * gives the true net at any point in time.
 */
abstract class AnalyticsEngagementObserver
{
    /** ClickHouse event type for this engagement. */
    abstract protected function type(): string;

    /** Event type for the undo, or null when the action cannot be undone. */
    protected function undoType(): ?string
    {
        return 'un' . $this->type();
    }

    public function created(Model $model): void
    {
        $this->emit($model, $this->type(), 1);
    }

    public function deleted(Model $model): void
    {
        $undo = $this->undoType();
        if ($undo === null) {
            return;
        }

        $this->emit($model, $undo, -1);
    }

    private function emit(Model $model, string $type, int $delta): void
    {
        $videoId = (int) ($model->video_id ?? 0);
        if ($videoId === 0) {
            return;
        }

        EventStream::push([
            // Derived from the row's primary key AND the event type, never
            // generated randomly - a random id is unique per call, so a replayed
            // emit would carry a different one and be counted twice.
            //
            // The type is part of the key because a like and its unlike share a
            // row id: without it, the unlike would look like a replay of the
            // like and be dropped, permanently over-reporting that creator.
            'event_id'   => $type . ':' . $model->getKey(),
            'type'       => $type,
            'video_id'   => $videoId,
            'creator_id' => EventStream::creatorFor($videoId),
            'user_id'    => (int) ($model->user_id ?? 0),
            'delta'      => $delta,
        ]);
    }
}
