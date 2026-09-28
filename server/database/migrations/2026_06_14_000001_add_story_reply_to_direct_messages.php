<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Alter the ENUM to add 'story_reply' value
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_message_type_check');
            DB::statement("ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_message_type_check
                CHECK (message_type IN ('text','image','video','voice','audio','document','story_reply'))");
        } else {
            DB::statement("
                ALTER TABLE direct_messages
                MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply')
                NOT NULL DEFAULT 'text'
            ");
        }

        Schema::table('direct_messages', function (Blueprint $table) {
            $table->unsignedBigInteger('story_id')->nullable()->after('mime_type');
            $table->string('story_thumbnail_url', 1000)->nullable()->after('story_id');
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn(['story_id', 'story_thumbnail_url']);
        });

        DB::statement("
            ALTER TABLE direct_messages
            MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document')
            NOT NULL DEFAULT 'text'
        ");
    }
};
