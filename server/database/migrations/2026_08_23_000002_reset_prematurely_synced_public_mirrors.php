<?php

use App\Jobs\SyncPublicMediaMirror;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Repairs every video whose public_mirror_synced_at was set by the old,
 * buggy PublicMediaMirrorService::verifyReachable() - which only ever
 * checked video_url's mirrored copy, never thumbnail_url's - so a post with
 * a thumbnail whose mirror hadn't propagated yet got marked synced anyway.
 * VideoResource immediately started serving thumbnail_url via the unsigned
 * /public/ path once that flag was set, which 404s at origin for exactly
 * that thumbnail, permanently (nothing ever re-checked it afterward).
 *
 * Confirmed live in production (2026-08-23): all 4 videos with
 * public_mirror_synced_at set at the time had a thumbnail_url whose
 * /public/ mirror 404s, while the ORIGINAL (signed, non-mirrored) object
 * exists on B2 and loads fine.
 *
 * Resetting public_mirror_synced_at to null here does two things at once:
 *  1. VideoResource falls back to the signed thumbnail_url/video_url
 *     immediately - the profile grid's tiles are correct on the next page
 *     load, no waiting on anything.
 *  2. The next call to PublicMediaMirrorService::sync() for that video
 *     (any edit triggers one via VideoObserver, or an operator can dispatch
 *     SyncPublicMediaMirror directly) re-verifies with the now-fixed logic
 *     that checks BOTH video_url and thumbnail_url, and only re-sets the
 *     flag once both are genuinely reachable.
 *
 * Scoped to rows that actually have a thumbnail_url at all - a video with
 * no thumbnail was never exposed to this bug (verifyReachable() had nothing
 * thumbnail-related to skip checking).
 */
return new class extends Migration
{
    public function up(): void
    {
        $ids = DB::table('videos')
            ->whereNotNull('public_mirror_synced_at')
            ->whereNotNull('thumbnail_url')
            ->pluck('id');

        DB::table('videos')->whereIn('id', $ids)->update([
            'public_mirror_synced_at'    => null,
            'public_mirror_hls_ready_at' => null,
        ]);

        // Re-queue each one so it actually gets fixed, not just left signed
        // forever - SyncPublicMediaMirror takes up to ~2.6 minutes per video
        // (the retry/backoff in the now-corrected verifyReachable()), so
        // this dispatches to the 'transcoding' queue rather than running
        // inline in the migration itself. Takes the plain id, same as every
        // other dispatch site (VideoObserver) - the job re-reads the row
        // fresh inside the service rather than trusting a captured instance.
        foreach ($ids as $id) {
            SyncPublicMediaMirror::dispatch($id)->onQueue('transcoding');
        }

        echo "  reset_prematurely_synced_public_mirrors: cleared and re-queued public_mirror_synced_at on " . $ids->count() . " video(s).\n";
    }

    public function down(): void
    {
        // Deliberately irreversible - there is no way to tell which of these
        // rows would have legitimately re-synced by the time of a rollback.
    }
};
