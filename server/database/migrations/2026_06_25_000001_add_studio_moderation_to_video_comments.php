<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creator-Studio comment management:
 *   • is_spam / held_for_review - creator-driven moderation states surfaced in
 *     the Studio "Comments" inbox (Spam, Held for Review tabs).
 *   • creator_seen_at           - read tracking → drives the "Unread" state.
 *   • creator_note              - private per-comment note the creator can jot
 *     down in the moderation panel.
 *   • comment_restricted_users  - per-creator block list. A restricted user's
 *     comments are auto-hidden on that creator's content and they can no longer
 *     comment on it (enforced in CommentController@store).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('video_comments', function (Blueprint $table) {
            $table->boolean('is_spam')->default(false)->index()->after('is_hidden');
            $table->boolean('held_for_review')->default(false)->index()->after('is_spam');
            $table->timestamp('creator_seen_at')->nullable()->after('held_for_review');
            $table->text('creator_note')->nullable()->after('creator_seen_at');
        });

        Schema::create('comment_restricted_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['creator_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('comment_restricted_users');

        Schema::table('video_comments', function (Blueprint $table) {
            $table->dropColumn(['is_spam', 'held_for_review', 'creator_seen_at', 'creator_note']);
        });
    }
};
