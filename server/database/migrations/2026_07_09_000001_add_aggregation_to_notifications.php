<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Notification aggregation (Instagram/TikTok-style bundling).
 *
 * Evolves the existing `notifications` table so that repeated events on the same
 * target collapse into ONE unread row instead of creating a new notification per
 * like/comment/follow:
 *
 *   • actor_count        - # of unique actors currently in the group
 *   • latest_activity_at - last time an actor was added (drives list ordering)
 *   • updated_at         - standard mutable timestamp (row was one-shot before)
 *
 * A companion `notification_actors` table keeps the full history of who triggered
 * a group, with a UNIQUE(notification_id, actor_id) guard so the same user can
 * never be counted twice (Like → Unlike → Like, or a double Like). See
 * App\Services\NotificationService::aggregate() / withdraw().
 */
return new class extends Migration
{
    public function up(): void
    {
        $isPg = DB::getDriverName() === 'pgsql';

        Schema::table('notifications', function (Blueprint $table) {
            $table->unsignedInteger('actor_count')->default(1)->after('actor_id');
            $table->timestamp('latest_activity_at')->nullable()->after('is_read');
            $table->timestamp('updated_at')->nullable()->after('created_at');
        });

        // Backfill: every existing row is a group of exactly one actor whose last
        // activity == its creation time, so ordering + counts stay correct.
        DB::table('notifications')->update([
            'actor_count'        => 1,
            'latest_activity_at' => DB::raw('created_at'),
            'updated_at'         => DB::raw('created_at'),
        ]);

        Schema::create('notification_actors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('notification_id')->constrained('notifications')->cascadeOnDelete();
            $table->foreignId('actor_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            // One actor appears at most once per notification - the DB-level
            // dedup that makes Like→Unlike→Like safe without app-side counting.
            $table->unique(['notification_id', 'actor_id']);
            // "Who reacted, newest first" for the actors drawer (paginated).
            $table->index(['notification_id', 'id']);
        });

        // Seed actor history from the current single-actor rows so the actors
        // drawer works for pre-existing notifications too.
        DB::statement(
            'INSERT INTO notification_actors (notification_id, actor_id, created_at)
             SELECT id, actor_id, created_at FROM notifications
             WHERE actor_id IS NOT NULL' .
            ($isPg ? ' ON CONFLICT DO NOTHING' : '')
        );

        // Aggregation lookup + list ordering: "the unread group for (user, type,
        // target)" and "this user's notifications, newest activity first". These
        // back the find-in-aggregate() lookup and the paginated inbox list.
        //
        // Concurrency (one unread group per key) is guaranteed at WRITE time by a
        // Postgres advisory transaction lock on the group key inside
        // NotificationService::aggregate() - NOT by a unique index. That avoids a
        // migration that would fail on the many pre-aggregation duplicate unread
        // rows already in prod, and needs no historical data surgery.
        Schema::table('notifications', function (Blueprint $table) {
            $table->index(['user_id', 'latest_activity_at'], 'notifications_user_activity_idx');
            $table->index(['user_id', 'type', 'entity_type', 'entity_id', 'is_read'], 'notifications_group_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_actors');

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_user_activity_idx');
            $table->dropIndex('notifications_group_lookup_idx');
            $table->dropColumn(['actor_count', 'latest_activity_at', 'updated_at']);
        });
    }
};
