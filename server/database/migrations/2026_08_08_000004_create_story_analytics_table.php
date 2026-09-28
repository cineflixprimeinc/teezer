<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Story analytics rollup - a DERIVED table, never a source of truth.
 *
 * Every number here is reconstructible from story_views, story_view_events,
 * story_reactions, story_messages and story_shares, and the prune/rebuild job
 * does exactly that. It exists because the owner-facing analytics call would
 * otherwise run five aggregates across five tables on every open, for every
 * story, on a surface people poll while watching.
 *
 * The ordering rule that keeps it honest, applied by StoryAnalyticsService:
 *
 *   1. write the source row (story_views / story_reactions / ...)  <- truth
 *   2. update this rollup                                         <- cache
 *   3. update Redis                                               <- cache
 *
 * A crash between 1 and 2 leaves this table stale but not wrong-forever: the
 * rebuild job recomputes from source and the values converge. A crash between 2
 * and 3 is invisible because Redis is read-through with this table behind it.
 * The failure mode is always "briefly stale", never "permanently drifted", and
 * never "the source row was lost". This is why counters here are recomputed by
 * aggregate rather than incremented blindly - an increment that runs twice is
 * wrong forever, while a recount is self-healing.
 *
 * `reactions_breakdown` is a JSON map of reaction_type => count, kept here so
 * the breakdown is one read rather than a GROUP BY per open. Same rule: derived
 * from story_reactions, rebuildable, never authoritative.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_analytics', function (Blueprint $table) {
            $table->id();

            // One rollup row per story. UNIQUE so the upsert has a conflict
            // target and two concurrent recomputes cannot create two rows.
            $table->foreignId('story_id')->unique()->constrained('stories')->cascadeOnDelete();
            $table->unsignedBigInteger('story_owner_id');

            // What the owner is shown. unique_viewers is THE headline number.
            $table->unsignedBigInteger('unique_viewers')->default(0);
            $table->unsignedBigInteger('reaction_count')->default(0);
            $table->unsignedBigInteger('reply_count')->default(0);
            $table->unsignedBigInteger('share_count')->default(0);

            // Internal analytics - deliberately separate from unique_viewers so
            // the two can never be confused at read time.
            $table->unsignedBigInteger('total_view_events')->default(0);
            $table->unsignedBigInteger('completion_count')->default(0);
            $table->unsignedBigInteger('total_watch_seconds')->default(0);

            // reaction_type => count. Derived from story_reactions.
            $table->json('reactions_breakdown')->nullable();

            // When the numbers above were last recomputed from source. Lets the
            // rebuild job find rollups that have gone quiet.
            $table->timestamp('recomputed_at')->nullable();
            $table->timestamps();

            $table->foreign('story_owner_id')->references('id')->on('users')->cascadeOnDelete();

            $table->index('story_owner_id', 'idx_story_analytics_owner_id');
            $table->index('recomputed_at', 'idx_story_analytics_recomputed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_analytics');
    }
};
