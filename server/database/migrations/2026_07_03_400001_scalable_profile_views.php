<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Convert profile_views from row-per-view to one upsert row per (owner, viewer)
 * with first_viewed_at / last_viewed_at / view_count, and add the 3-way
 * profile-view privacy enum on users. Indexes tuned for the cursor-paginated
 * "who viewed me" list (owner + last_viewed_at) and reverse lookups (viewer).
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── users: 3-way visibility enum, backfilled from the legacy boolean ──
        if (!Schema::hasColumn('users', 'profile_view_privacy')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('profile_view_privacy', 20)->default('everyone')->after('profile_view_history');
            });
            DB::table('users')->update([
                'profile_view_privacy' => DB::raw("CASE WHEN profile_view_history THEN 'everyone' ELSE 'private' END"),
            ]);
        }

        if (!Schema::hasTable('profile_views')) {
            return;
        }

        // ── profile_views: new aggregate columns ──
        Schema::table('profile_views', function (Blueprint $table) {
            if (!Schema::hasColumn('profile_views', 'first_viewed_at')) $table->timestamp('first_viewed_at')->nullable();
            if (!Schema::hasColumn('profile_views', 'last_viewed_at'))  $table->timestamp('last_viewed_at')->nullable();
            if (!Schema::hasColumn('profile_views', 'view_count'))      $table->unsignedInteger('view_count')->default(1);
        });

        $pg = DB::getDriverName() === 'pgsql';

        // Seed first/last from the existing per-row timestamp.
        DB::statement('UPDATE profile_views SET first_viewed_at = viewed_at, last_viewed_at = viewed_at WHERE first_viewed_at IS NULL');

        if ($pg) {
            // Collapse historical rows into one per (owner, viewer): the survivor
            // keeps the count and the min/max window; older duplicates are dropped
            // so the unique index below can be created.
            DB::statement('
                CREATE TEMP TABLE pv_agg AS
                SELECT profile_user_id, viewer_id,
                       MIN(viewed_at) AS first_v, MAX(viewed_at) AS last_v, COUNT(*) AS cnt
                FROM profile_views
                WHERE viewer_id IS NOT NULL
                GROUP BY profile_user_id, viewer_id
            ');
            DB::statement('
                DELETE FROM profile_views pv
                USING (
                    SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY profile_user_id, viewer_id ORDER BY viewed_at DESC, id DESC
                    ) AS rn
                    FROM profile_views
                    WHERE viewer_id IS NOT NULL
                ) d
                WHERE pv.id = d.id AND d.rn > 1
            ');
            DB::statement('
                UPDATE profile_views pv
                SET first_viewed_at = a.first_v, last_viewed_at = a.last_v, view_count = a.cnt
                FROM pv_agg a
                WHERE pv.profile_user_id = a.profile_user_id AND pv.viewer_id = a.viewer_id
            ');
            DB::statement('DROP TABLE IF EXISTS pv_agg');
        }

        // ── indexes for the hot paths ──
        Schema::table('profile_views', function (Blueprint $table) {
            // Upsert target + "did viewer see owner" lookups.
            $table->unique(['profile_user_id', 'viewer_id'], 'profile_views_owner_viewer_unique');
            // Cursor-paginated recent-viewers list (owner, last_viewed_at DESC).
            $table->index(['profile_user_id', 'last_viewed_at'], 'profile_views_owner_recent_idx');
            // Reverse lookups + retention scans.
            $table->index('viewer_id', 'profile_views_viewer_idx');
            $table->index('last_viewed_at', 'profile_views_last_viewed_idx');
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('profile_views')) {
            Schema::table('profile_views', function (Blueprint $table) {
                $table->dropUnique('profile_views_owner_viewer_unique');
                $table->dropIndex('profile_views_owner_recent_idx');
                $table->dropIndex('profile_views_viewer_idx');
                $table->dropIndex('profile_views_last_viewed_idx');
                $table->dropColumn(['first_viewed_at', 'last_viewed_at', 'view_count']);
            });
        }
        if (Schema::hasColumn('users', 'profile_view_privacy')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('profile_view_privacy');
            });
        }
    }
};
