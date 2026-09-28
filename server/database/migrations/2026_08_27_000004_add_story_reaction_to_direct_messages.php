<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * StoryController::react() now creates a real DirectMessage
 * (message_type='story_reaction') so a reaction actually reaches the
 * owner's Inbox, not just a bell notification - same reasoning as
 * story_reply already being a real message. Widens the message_type CHECK
 * constraint the same way 2026_08_27_000001 did for shared_story, so this
 * doesn't repeat that exact bug (Laravel/model-level acceptance without the
 * DB constraint following).
 *
 * NOTE: this constraint is still separately missing 'location', which
 * MessageController::send()'s own validator already accepts - a
 * pre-existing, unrelated gap, left alone here on purpose.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_message_type_check');
            DB::statement("ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_message_type_check
                CHECK (message_type IN ('text','image','video','voice','audio','document','story_reply','shared_video','shared_profile','shared_product','shared_story','story_reaction'))");
        } else {
            DB::statement("
                ALTER TABLE direct_messages
                MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply','shared_video','shared_profile','shared_product','shared_story','story_reaction')
                NOT NULL DEFAULT 'text'
            ");
        }
    }

    public function down(): void
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
};
