<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A gift sent on a post leaves a comment.
 *
 * Gifting was invisible on the post itself: coins moved, the creator got a
 * notification, and the thread everyone else was reading showed nothing. These
 * columns let a comment BE the gift - the client draws the gift's own animated
 * artwork instead of the body text, and because it is a real comment row it is
 * counted, moderated, replied to and deleted like any other.
 *
 * `gift_id` points at the catalog rather than copying a name, so renaming a
 * gift updates every comment that sent it. `gift_coins` is snapshotted, because
 * what someone spent is a fact about that moment and must not move when the
 * catalog is repriced.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('video_comments')) {
            return;
        }

        Schema::table('video_comments', function (Blueprint $table) {
            if (! Schema::hasColumn('video_comments', 'gift_id')) {
                $table->unsignedBigInteger('gift_id')->nullable()->after('image_path');
                // Only ever queried alongside its video, and only to find the
                // handful of gift rows in a thread.
                $table->index(['video_id', 'gift_id']);
            }
            if (! Schema::hasColumn('video_comments', 'gift_coins')) {
                $table->unsignedBigInteger('gift_coins')->nullable()->after('gift_id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('video_comments')) {
            return;
        }

        Schema::table('video_comments', function (Blueprint $table) {
            if (Schema::hasColumn('video_comments', 'gift_id')) {
                $table->dropIndex(['video_id', 'gift_id']);
                $table->dropColumn('gift_id');
            }
            if (Schema::hasColumn('video_comments', 'gift_coins')) {
                $table->dropColumn('gift_coins');
            }
        });
    }
};
