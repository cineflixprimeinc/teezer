<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sending a place in a direct message.
 *
 * `message_type` already had every other kind the composer can produce - text,
 * image, video, voice, audio, document, shared_video - but a location has no
 * file behind it, so there was nowhere to put one. These three columns are that
 * somewhere.
 *
 * decimal(10,7) rather than a float: 7 decimal places is roughly a centimetre,
 * which is far past what a phone GPS reports, and decimal stores it exactly
 * instead of accumulating the drift a float would. Latitude needs 2 digits
 * before the point and longitude 3, so (10,7) covers both with room to spare.
 *
 * `location_name` is what the sender's device called the place. It is stored
 * rather than looked up on read: a name resolved months later can differ from
 * the one they actually sent, and the message should say what was sent.
 *
 * No index. These are read as part of a message row that is already being
 * fetched by conversation, never searched by coordinate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('video_id');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->string('location_name', 255)->nullable()->after('longitude');
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'location_name']);
        });
    }
};
