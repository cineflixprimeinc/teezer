<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * MessageController::send() already accepts message_type=shared_story (added
 * in a prior session, story_id/story_thumbnail_url columns already existed
 * from story_reply) - but the message_type CHECK constraint below was never
 * widened to match, same class of bug the 2026_08_26 migration's own comment
 * flagged for 'location'. Left unfixed, sending a shared_story message would
 * pass Laravel's own validation and then fail on the raw Postgres constraint
 * violation. Reproduces the constraint's current full list plus the one
 * missing value, same pattern every prior widening of this constraint has
 * used.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_message_type_check');
            DB::statement("ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_message_type_check
                CHECK (message_type IN ('text','image','video','voice','audio','document','story_reply','shared_video','shared_profile','shared_product','shared_story'))");
        } else {
            DB::statement("
                ALTER TABLE direct_messages
                MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply','shared_video','shared_profile','shared_product','shared_story')
                NOT NULL DEFAULT 'text'
            ");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_message_type_check');
            DB::statement("ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_message_type_check
                CHECK (message_type IN ('text','image','video','voice','audio','document','story_reply','shared_video','shared_profile','shared_product'))");
        } else {
            DB::statement("
                ALTER TABLE direct_messages
                MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply','shared_video','shared_profile','shared_product')
                NOT NULL DEFAULT 'text'
            ");
        }
    }
};
