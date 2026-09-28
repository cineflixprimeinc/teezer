<?php

namespace App\Observers\Analytics;

use App\Models\VideoView;
use App\Services\Analytics\EventStream;

/**
 * Mirrors every VideoView row into the ClickHouse event stream.
 *
 * This hooks the MODEL, not the controllers, and that is the whole point. A view is
 * already recorded from two places (VideoController::recordView and
 * WatchController::countView), and any future code path that creates a VideoView
 * will know nothing about this pipeline. Hooking controllers means each one is a
 * chance to forget - and a forgotten path is invisible: the number is simply lower
 * than the truth, and nobody notices until a creator asks why their views are wrong.
 *
 * Hooking the model makes it structurally impossible to miss: if the row is written,
 * the event is emitted. It also means video_views and ClickHouse cannot silently
 * disagree about what a view is.
 */
class AnalyticsVideoViewObserver
{
    public function created(VideoView $view): void
    {
        $videoId = (int) $view->video_id;

        EventStream::push([
            // Derived from the row's primary key, not generated.
            //
            // A random id would be unique per CALL, which is useless: if this
            // observer ever fired twice for the same view, the two events would
            // carry different ids and both would be counted. Keying on the row
            // means the same VideoView can only ever produce the same event id,
            // so a replay is recognisable as one no matter what caused it.
            'event_id'      => 'vv:' . $view->getKey(),
            'type'          => 'view',
            'video_id'      => $videoId,
            'creator_id'    => EventStream::creatorFor($videoId),
            'user_id'       => (int) ($view->user_id ?? 0),
            'delta'         => 1,
            'watch_seconds' => (int) ($view->watch_duration ?? 0),
            // Postgres stores the country NAME ('Nepal'); older rows hold the raw
            // Cloudflare code ('NP'). Canonicalise to ISO-2 here so ClickHouse never
            // sees the same country spelled two ways and split across two rows.
            'country'       => EventStream::isoCountry($view->country),
            'city'          => (string) ($view->city ?? ''),
            'source'        => (string) ($view->source ?? ''),
            'device_type'   => (string) ($view->device_type ?? ''),
            'ip_hash'       => EventStream::hashIp($view->ip_address),
        ]);
    }
}
