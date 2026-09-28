<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Moderation state for hashtags.
 *
 * The admin Hashtags page was read-only because the table had nothing to write
 * to: id, name and videos_count. Blocking a tag is the one control that page
 * actually needs - a hashtag is how abusive or coordinated content finds an
 * audience, and there was no way to stop one from surfacing.
 *
 * Blocking hides a tag from discovery (explore lists, trending, the feed's
 * trending rail). It deliberately does NOT delete the tag or touch the videos
 * carrying it: the posts stay up and remain reachable by their own URLs, so
 * this is a discovery control, not a content takedown. Moderating the posts
 * themselves is what the Reported queue is for.
 *
 * `is_featured` is the opposite lever - pinning a tag the platform wants seen,
 * for campaigns and events.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hashtags', function (Blueprint $table) {
            $table->boolean('is_blocked')->default(false)->after('videos_count');
            $table->boolean('is_featured')->default(false)->after('is_blocked');
            $table->string('blocked_reason', 500)->nullable()->after('is_featured');
            $table->timestamp('blocked_at')->nullable()->after('blocked_reason');
            $table->unsignedBigInteger('blocked_by')->nullable()->after('blocked_at');

            // Every public query filters on is_blocked, so it is worth an index
            // alongside the column those queries already sort by.
            $table->index(['is_blocked', 'videos_count']);
            $table->index('is_featured');
        });
    }

    public function down(): void
    {
        Schema::table('hashtags', function (Blueprint $table) {
            $table->dropIndex(['is_blocked', 'videos_count']);
            $table->dropIndex(['is_featured']);
            $table->dropColumn(['is_blocked', 'is_featured', 'blocked_reason', 'blocked_at', 'blocked_by']);
        });
    }
};
