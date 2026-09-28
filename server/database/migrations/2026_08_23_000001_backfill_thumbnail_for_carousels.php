<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time repair for photo-carousel posts uploaded before the "choose a
 * cover photo" feature existed (2026-06-22, commit 1ed05bac). Before that
 * date a carousel upload never sent a thumbnail key at all, so its
 * `thumbnail_url` column (which - despite the name - stores an object KEY,
 * not a URL; see VideoResource::toArray()) has sat NULL ever since, with no
 * job that would ever set it retroactively.
 *
 * The profile grid (frontend/src/features/profile/profile-video-grid.tsx)
 * already falls back to the first `media_items` entry with a usable URL when
 * `thumbnail_url` is empty, so this backfill is a courtesy, not a fix the
 * frontend strictly depends on any more - but it means the API's own
 * `thumbnail_url` field (used by feed cards, search results, share previews,
 * anywhere else that reads it directly rather than through that fallback)
 * stops being silently wrong for these posts too.
 *
 * Only ever writes the object_key already sitting in that row's own
 * media_items - never invents one, never touches a row whose media_items
 * genuinely has no usable object_key (those still need a real re-upload).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Postgres's plain `json` column type has no `!=` operator against a
        // string literal ("operator does not exist: json <> unknown"), so
        // "not an empty array" is filtered in PHP after decoding instead of
        // in SQL - whereNotNull alone still narrows this to a small set.
        $rows = DB::table('videos')
            ->whereNull('thumbnail_url')
            ->whereNotNull('media_items')
            ->select('id', 'media_items')
            ->get();

        $updated = 0;
        $candidates = 0;

        foreach ($rows as $row) {
            $items = json_decode($row->media_items, true);
            if (! is_array($items) || empty($items)) continue;
            $candidates++;

            // Same "first item that actually has one" preference the
            // frontend fallback now uses, not blindly index 0.
            usort($items, fn ($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
            $key = null;
            foreach ($items as $item) {
                if (! empty($item['object_key'])) {
                    $key = $item['object_key'];
                    break;
                }
            }
            if ($key === null) continue;

            DB::table('videos')->where('id', $row->id)->update(['thumbnail_url' => $key]);
            $updated++;
        }

        // echo, not Log::info() - this runs from the CLI (php artisan
        // migrate) and storage/logs has had permission issues on this box
        // before (see project notes); stdout needs nothing writable.
        echo "  backfill_thumbnail_for_carousels: set thumbnail_url on {$updated} of {$candidates} candidate carousel rows ({$rows->count()} rows scanned).\n";
    }

    public function down(): void
    {
        // Deliberately irreversible - there is no way to tell a thumbnail_url
        // this migration set apart from one a real cover-picker save set, so
        // rolling back would risk clearing a legitimately-chosen cover too.
    }
};
