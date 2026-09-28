<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Alter the ENUM to add 'shared_video' value
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_message_type_check');
            DB::statement("ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_message_type_check
                CHECK (message_type IN ('text','image','video','voice','audio','document','story_reply','shared_video'))");
        } else {
            DB::statement("
                ALTER TABLE direct_messages
                MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply','shared_video')
                NOT NULL DEFAULT 'text'
            ");
        }

        // No new thumbnail/caption columns needed - a shared_video message reuses the
        // existing generic `thumbnail_url` (the video's own public CDN thumbnail, no
        // r2_key set so DirectMessage::thumbnailUrl() returns it unsigned/permanent),
        // `duration` (video length in seconds) and `body` (the video's caption) columns,
        // the same way `story_reply` reuses columns rather than duplicating them.
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->unsignedBigInteger('video_id')->nullable()->after('story_thumbnail_url');
            $table->foreign('video_id')->references('id')->on('videos')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropForeign(['video_id']);
            $table->dropColumn(['video_id']);
        });

        DB::statement("
            ALTER TABLE direct_messages
            MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply')
            NOT NULL DEFAULT 'text'
        ");
    }
};
