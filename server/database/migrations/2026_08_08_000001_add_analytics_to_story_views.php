<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Story view analytics - the UNIQUE VIEWER row.
 *
 * `story_views` already was the right table: it has carried
 * UNIQUE(story_id, viewer_id) since it was created, which is what makes "one
 * user = one view" true at the database level rather than by convention. This
 * migration does NOT change that contract - it hangs analytics off it.
 *
 * The distinction that drives the whole design:
 *
 *   UNIQUE VIEWERS    = COUNT(*) on this table            -> what the owner sees
 *   TOTAL VIEW EVENTS = SUM(view_events) on this table    -> internal analytics
 *
 * So a viewer who watches the same story ten times stays ONE row here, with
 * view_events = 10. Nothing about the owner-facing count changes as they
 * rewatch, which is the requirement; the rewatch is still recorded, which is
 * what makes drop-off and completion measurable. Per-slide detail lives in
 * story_view_events (next migration) so this table stays one row per viewer.
 *
 * `story_owner_id` is denormalised from stories.user_id. It is redundant - the
 * owner is always reachable by joining stories - but every owner-facing
 * analytics query filters by it, and denormalising turns those from a join into
 * an index scan. It is nullable rather than NOT NULL because backfilling a NOT
 * NULL column on a live table needs an exclusive lock for the length of the
 * backfill; the writer always populates it from here on, and readers COALESCE
 * through the join for any row this backfill somehow missed.
 *
 * `platform` is deliberately free-ish text with a CHECK-free contract enforced
 * in the service, not the schema: a new client (tv, watch, embed) must not
 * require a migration to start reporting.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('story_views', function (Blueprint $table) {
            // Denormalised owner - see the note above on why it is nullable.
            $table->unsignedBigInteger('story_owner_id')->nullable()->after('viewer_id');

            // Where the view happened. ios | android | web | mobile_web | desktop_web.
            $table->string('platform', 20)->nullable()->after('story_owner_id');
            $table->string('device', 120)->nullable()->after('platform');

            // Client-supplied, per-tab/per-app-launch. Used ONLY to attribute
            // concurrent events - never to identify a viewer, which is always
            // the authenticated user id.
            $table->string('session_id', 64)->nullable()->after('device');

            // Aggregates maintained across every rewatch by this viewer.
            $table->unsignedInteger('view_events')->default(1)->after('session_id');
            $table->unsignedInteger('watch_duration')->default(0)->after('view_events');
            $table->boolean('completed')->default(false)->after('watch_duration');
            $table->timestamp('last_viewed_at')->nullable()->after('completed');
        });

        // Correlated subquery rather than UPDATE..FROM: this exact statement is
        // valid on both PostgreSQL (production) and SQLite (the test database),
        // and the test suite migrates from scratch on SQLite.
        DB::statement(<<<'SQL'
            UPDATE story_views
               SET story_owner_id = (SELECT user_id FROM stories WHERE stories.id = story_views.story_id)
             WHERE story_owner_id IS NULL
        SQL);

        // Existing rows predate per-view tracking: their one known view is the
        // one that created the row, so last_viewed_at seeds from viewed_at
        // rather than from now() - which would claim every historical view
        // happened at deploy time and wreck any time-bucketed report.
        DB::statement('UPDATE story_views SET last_viewed_at = viewed_at WHERE last_viewed_at IS NULL');

        // idx_story_views_viewer_id already exists (2026_07_12_000004), and the
        // UNIQUE(story_id, viewer_id) constraint already indexes story_id as its
        // leading column - so neither is recreated here. These two are the ones
        // owner-facing analytics actually needs and nothing has yet.
        $this->index('idx_story_views_story_owner_id', 'story_views (story_owner_id)');
        $this->index('idx_story_views_viewed_at', 'story_views (viewed_at)');
    }

    public function down(): void
    {
        $this->dropIndex('idx_story_views_story_owner_id');
        $this->dropIndex('idx_story_views_viewed_at');

        Schema::table('story_views', function (Blueprint $table) {
            $table->dropColumn([
                'story_owner_id', 'platform', 'device', 'session_id',
                'view_events', 'watch_duration', 'completed', 'last_viewed_at',
            ]);
        });
    }

    /**
     * IF NOT EXISTS so a re-run is a no-op, matching how
     * 2026_07_12_000004_add_missing_foreign_key_indexes creates indexes.
     */
    private function index(string $name, string $target): void
    {
        DB::statement("CREATE INDEX IF NOT EXISTS {$name} ON {$target}");
    }

    private function dropIndex(string $name): void
    {
        DB::statement("DROP INDEX IF EXISTS {$name}");
    }
};
