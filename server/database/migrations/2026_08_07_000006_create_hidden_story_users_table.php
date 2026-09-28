<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Hide story from" - people who must never see your stories.
 *
 * Per AUTHOR, not per story. The brief describes it as a setting on the upload
 * page, but the useful behaviour is the one Instagram has: you hide someone once
 * and they stay hidden, rather than re-picking them on every post. A per-story
 * list would mean forgetting once is enough to expose everything.
 *
 * It SUBTRACTS from whatever visibility was chosen, never adds:
 *   everyone      + hidden John  → everyone except John
 *   followers     + hidden Alex  → followers except Alex
 *   close_friends + hidden Sarah → close friends except Sarah
 * So it composes with the visibility rule rather than replacing it, which is why
 * it is a separate table and not another visibility value.
 *
 * Blocked users are NOT stored here. A block already hides everything both ways
 * and is enforced elsewhere; duplicating it would mean two sources of truth that
 * can disagree, and unblocking someone would leave them hidden by a row nobody
 * remembers creating.
 *
 * Indexed (author, hidden) because every read is "is this viewer hidden by this
 * author" - the same shape as close_friends, and answered the same way.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hidden_story_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('hidden_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'hidden_user_id']);
            $table->index(['user_id', 'hidden_user_id'], 'hidden_story_users_pair_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hidden_story_users');
    }
};
