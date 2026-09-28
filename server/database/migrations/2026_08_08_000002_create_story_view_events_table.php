<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Story view EVENTS - append-only, one row per watch of one slide.
 *
 * This is the other half of the unique-viewer split. `story_views` answers "how
 * many people watched this story" and must stay at one row per viewer;
 * this table answers "what happened during those watches" and is deliberately
 * unconstrained - ten rewatches of a four-slide story write forty rows here and
 * still leave story_views at exactly one.
 *
 * That separation is the whole point. Slide-level completion and drop-off are
 * impossible to reconstruct from a deduplicated table, and a deduplicated
 * viewer count is impossible to serve cheaply from an append-only one, so they
 * cannot be the same table. Neither is derived from the other at read time:
 * story_views is maintained by UPSERT, this is maintained by INSERT, and the
 * rollup (story_analytics) reads both.
 *
 * There is NO unique constraint here on purpose. A viewer legitimately produces
 * many rows, and adding one would silently collapse exactly the repeat views
 * that make drop-off measurable.
 *
 * `slide_index` is the slide's order_index rather than an FK alone, because
 * drop-off is a question about POSITION ("how many reach slide 3") and survives
 * a slide being deleted, which an FK does not. story_media_id is kept alongside
 * it, nullable, for joining back to the actual media while it still exists.
 *
 * Retention: this table grows without bound by design and is trimmed by the
 * story analytics prune job, not by cascade alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_view_events', function (Blueprint $table) {
            $table->id();

            $table->foreignId('story_id')->constrained('stories')->cascadeOnDelete();
            $table->unsignedBigInteger('viewer_id');
            $table->unsignedBigInteger('story_owner_id');

            // Which slide. Nullable media id (slides can be deleted), plus the
            // positional index that outlives it - see the note above.
            $table->unsignedBigInteger('story_media_id')->nullable();
            $table->unsignedSmallInteger('slide_index')->default(0);

            $table->string('platform', 20)->nullable();
            $table->string('device', 120)->nullable();
            $table->string('session_id', 64)->nullable();

            // Seconds watched on THIS slide, and whether it was watched out.
            $table->unsignedInteger('watch_duration')->default(0);
            $table->boolean('completed')->default(false);

            $table->timestamp('created_at')->useCurrent();

            $table->foreign('viewer_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('story_owner_id')->references('id')->on('users')->cascadeOnDelete();

            // Drop-off is always "this story, by slide" - one composite index
            // serves it and story_id lookups both.
            $table->index(['story_id', 'slide_index'], 'idx_story_view_events_story_slide');
            $table->index('viewer_id', 'idx_story_view_events_viewer_id');
            $table->index('story_owner_id', 'idx_story_view_events_owner_id');
            $table->index('created_at', 'idx_story_view_events_created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_view_events');
    }
};
