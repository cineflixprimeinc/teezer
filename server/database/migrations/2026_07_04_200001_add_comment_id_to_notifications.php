<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a "commented on your video" / "mentioned you in a comment" notification
 * point at the EXACT comment (root or reply), not just the video - so tapping
 * it can open the comments sheet scrolled to, and highlighting, that specific
 * comment instead of just landing on the video with the comments closed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->unsignedBigInteger('comment_id')->nullable()->after('entity_id');
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->foreign('comment_id')->references('id')->on('video_comments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropForeign(['comment_id']);
            $table->dropColumn('comment_id');
        });
    }
};
