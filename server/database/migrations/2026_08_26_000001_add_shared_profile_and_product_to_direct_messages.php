<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sharing a Teezer profile or a Shop product through DM, same pattern as
 * shared_video (2026_07_27_100001): no new upload, just a reference column
 * plus a message_type the client renders as a card.
 *
 * NOTE: the message_type CHECK constraint below reproduces its CURRENT actual
 * list (text,image,video,voice,audio,document,story_reply,shared_video) -
 * deliberately NOT adding 'location', even though MessageController::send()'s
 * validation already accepts it. 2026_08_07_000001_add_location_to_direct_
 * messages only added the lat/long/location_name columns and never updated
 * this constraint, so a location message currently 500s on the raw Postgres
 * constraint violation rather than being rejected cleanly - a real,
 * pre-existing bug, unrelated to this change, left exactly as found.
 */
return new class extends Migration
{
    public function up(): void
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

        Schema::table('direct_messages', function (Blueprint $table) {
            // shared_profile: the profile card's avatar/username/name come from
            // the live User row on read (never stale), same reasoning as
            // shared_video reusing the video's own thumbnail rather than a copy.
            $table->foreignId('shared_user_id')->nullable()->after('location_name')
                ->constrained('users')->nullOnDelete();
            // shared_product: image/name/price/shop name are read live from the
            // Product row too - nothing duplicated onto the message.
            $table->foreignId('product_id')->nullable()->after('shared_user_id')
                ->constrained('products')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shared_user_id');
            $table->dropConstrainedForeignId('product_id');
        });

        DB::statement("
            ALTER TABLE direct_messages
            MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply','shared_video')
            NOT NULL DEFAULT 'text'
        ");
    }
};
