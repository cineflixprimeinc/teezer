<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The close-friends list.
 *
 * `close_friends` has been a story visibility since the stories table was
 * created, but there was never anywhere to put the list itself, so
 * StoryController::canViewStory failed closed on it - a story shared that way
 * reached nobody but its author. This is the missing half.
 *
 * One row per (owner, friend). Deliberately NOT symmetric: this is the owner's
 * private list of who they trust, exactly like Instagram's, and the friend is
 * never told they are on it. That is also why there is no status column - being
 * on someone's list is not a relationship needing consent, it is a filter the
 * owner applies to their own posts.
 *
 * The unique pair is the correctness guarantee: adding someone twice must not
 * make them "more" of a close friend, and the list is replaced wholesale on
 * save, so a duplicate would survive the diff.
 *
 * Cascade on delete: a deleted account must not linger on anyone's list, and a
 * deleted owner's list has no meaning.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('close_friends', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('friend_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'friend_id']);
            // Every read is "is this viewer on this owner's list", which this
            // covers from the left.
            $table->index(['user_id', 'friend_id'], 'close_friends_owner_friend_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('close_friends');
    }
};
