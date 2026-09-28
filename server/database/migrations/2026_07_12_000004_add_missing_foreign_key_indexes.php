<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Index the foreign keys that were missing one.
 *
 * WHY, precisely - because "add indexes to go faster" is the wrong reason and leads
 * people to index everything:
 *
 *  1. Postgres does NOT auto-index a foreign key (it only auto-indexes primary keys and
 *     unique constraints). Ours were unindexed.
 *
 *  2. An unindexed FK means that deleting ONE parent row forces a SEQUENTIAL SCAN of the
 *     whole child table, to check nothing still references it. Delete a user today and
 *     Postgres scans `followers`, `video_likes`, `notifications` and 58 other tables end
 *     to end. At 10 rows that is free. At 10 million rows it is a table-locking disaster,
 *     and it arrives without warning the day the table gets big.
 *
 *  3. The same columns are what every JOIN and "give me X's likes / followers / messages"
 *     query filters on. Those are seq scans too, today.
 *
 * This does NOT make anything measurably faster right now - the whole database is 23 MB
 * and has a 100% cache hit ratio, so everything is already served from RAM. It removes a
 * cliff that would otherwise be hit later, at the worst possible moment.
 *
 * Scoped to tables that actually GROW with usage. Admin-only tables (admin_user_notes,
 * cms_pages, menu_items…) are deliberately skipped: they will never hold enough rows for
 * a scan to cost anything, and an index there is pure write overhead for no return.
 */
return new class extends Migration
{
    /**
     * CREATE INDEX CONCURRENTLY cannot run inside a transaction, and Laravel wraps
     * Postgres migrations in one by default. CONCURRENTLY is what lets this run against a
     * live database without locking writes on the table.
     */
    public $withinTransaction = false;

    /** @var array<string, string> index name => table(column) */
    private const INDEXES = [
        // Social graph - the hottest reads in the product.
        'idx_followers_following_id'        => 'followers (following_id)',
        'idx_blocked_users_blocked_id'      => 'blocked_users (blocked_id)',

        // Engagement.
        'idx_video_likes_user_id'           => 'video_likes (user_id)',
        'idx_video_saves_user_id'           => 'video_saves (user_id)',
        'idx_video_shares_video_id'         => 'video_shares (video_id)',
        'idx_comment_likes_user_id'         => 'comment_likes (user_id)',
        'idx_comment_reactions_user_id'     => 'comment_reactions (user_id)',
        'idx_comment_mentions_by_user_id'   => 'comment_mentions (mentioned_by_user_id)',
        'idx_video_hashtags_hashtag_id'     => 'video_hashtags (hashtag_id)',

        // Notifications - already 437 rows and grows with every interaction.
        'idx_notifications_actor_id'        => 'notifications (actor_id)',
        'idx_notifications_comment_id'      => 'notifications (comment_id)',
        'idx_notification_actors_actor_id'  => 'notification_actors (actor_id)',

        // Watch telemetry - the fastest-growing tables you have.
        'idx_video_watch_events_video_id'   => 'video_watch_events (video_id)',
        'idx_psl_suggested_user_id'         => 'profile_suggestion_logs (suggested_user_id)',
        'idx_psd_suggested_user_id'         => 'profile_suggestion_dismissals (suggested_user_id)',

        // Chat.
        'idx_conversations_user_b_id'       => 'conversations (user_b_id)',
        'idx_conversations_initiated_by'    => 'conversations (initiated_by)',
        'idx_chat_messages_reply_to_id'     => 'chat_messages (reply_to_id)',

        // Stories.
        'idx_story_views_viewer_id'         => 'story_views (viewer_id)',
        'idx_story_messages_sender_id'      => 'story_messages (sender_id)',
        'idx_story_messages_receiver_id'    => 'story_messages (receiver_id)',
        'idx_story_messages_story_id'       => 'story_messages (story_id)',
        'idx_story_reactions_user_id'       => 'story_reactions (user_id)',

        // Money.
        'idx_gift_transactions_sender_id'   => 'gift_transactions (sender_id)',
        'idx_gift_transactions_receiver_id' => 'gift_transactions (receiver_id)',
        'idx_gift_transactions_gift_id'     => 'gift_transactions (gift_id)',
        'idx_wallet_transactions_wallet_id' => 'wallet_transactions (wallet_id)',
        'idx_creator_earnings_video_id'     => 'creator_earnings (video_id)',
        'idx_video_monetization_video_id'   => 'video_monetization (video_id)',
        'idx_coin_orders_package_id'        => 'coin_orders (package_id)',

        // Creator / media.
        'idx_playlist_videos_video_id'      => 'playlist_videos (video_id)',
        'idx_audio_favorites_track_id'      => 'audio_favorites (audio_track_id)',
        'idx_highlights_user_id'            => 'highlights (user_id)',
        'idx_promotions_user_id'            => 'promotions (user_id)',
        'idx_promotions_video_id'           => 'promotions (video_id)',
        'idx_creator_progress_level_id'     => 'creator_progress (current_level_id)',

        // Reports - scanned by moderators, and by the user-deletion cascade.
        'idx_user_reports_reported_user_id' => 'user_reports (reported_user_id)',
        'idx_user_reports_reporter_id'      => 'user_reports (reporter_id)',
        'idx_video_reports_reporter_id'     => 'video_reports (reporter_id)',
        'idx_comment_reports_reporter_id'   => 'comment_reports (reporter_user_id)',

        // Verification - the admin 360 tab filters by user_id.
        'idx_verification_requests_user_id' => 'verification_requests (user_id)',
        'idx_screen_time_limits_user_id'    => 'screen_time_limits (user_id)',
    ];

    public function up(): void
    {
        foreach (self::INDEXES as $name => $target) {
            // Skip tables this database does not have. IF NOT EXISTS guards the INDEX,
            // not the TABLE - so a missing table aborts the whole migration run rather
            // than being skipped.
            //
            // `chat_messages` is the concrete case: it is owned by the standalone chat
            // service and no migration in this repo creates it, so it is present in an
            // environment that has run that service and absent on a freshly migrated
            // database. Without this guard, `migrate` on a new box dies here having
            // applied 177 of the migrations - which is exactly what happened when the
            // stack was rebuilt on new servers.
            $table = strtok($target, ' (');
            if (! Schema::hasTable($table)) {
                continue;
            }

            // IF NOT EXISTS so a re-run is a no-op, and so this survives a table that
            // already picked the index up from another migration.
            DB::statement("CREATE INDEX CONCURRENTLY IF NOT EXISTS {$name} ON {$target}");
        }
    }

    public function down(): void
    {
        foreach (array_keys(self::INDEXES) as $name) {
            DB::statement("DROP INDEX CONCURRENTLY IF EXISTS {$name}");
        }
    }
};
