<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Story shares - the fourth owner-facing counter, alongside views, reactions
 * and replies.
 *
 * There was no share tracking of any kind before this, which is why the
 * analytics sheet could never show a Shares number: the data did not exist to
 * show. Resharing itself already existed as a story SETTING
 * (stories.allow_resharing) - what was missing was the record of it happening.
 *
 * Deliberately NOT unique per (story, sharer). Sharing is a repeatable act -
 * sending a story to three friends is three shares, and a person who shares
 * twice has genuinely shared twice. This is the opposite of the view rule, and
 * the difference is intentional: a view is a state ("has seen it"), a share is
 * an event ("sent it"). Applying view semantics here would report 1 share for
 * someone who sent the story to a whole group chat.
 *
 * `channel` records HOW it was shared so the owner can tell a copied link from
 * a DM. `target_user_id` is set only for in-app shares to a specific person and
 * stays null for copy-link and external shares, where there is no knowable
 * recipient - null here means "unknown recipient", never "no recipient".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_shares', function (Blueprint $table) {
            $table->id();

            $table->foreignId('story_id')->constrained('stories')->cascadeOnDelete();
            $table->unsignedBigInteger('sharer_id');
            $table->unsignedBigInteger('story_owner_id');

            // dm | copy_link | external | repost. Validated in the service, not
            // by a CHECK constraint, so a new surface does not need a migration.
            $table->string('channel', 20)->default('copy_link');

            // Only meaningful for `dm`; see the note above on null.
            $table->unsignedBigInteger('target_user_id')->nullable();

            $table->string('platform', 20)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('sharer_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('story_owner_id')->references('id')->on('users')->cascadeOnDelete();
            // Nullable FK: if the recipient deletes their account the share
            // still happened, so the row survives with an unknown target rather
            // than cascading away and silently lowering a historical count.
            $table->foreign('target_user_id')->references('id')->on('users')->nullOnDelete();

            $table->index('story_id', 'idx_story_shares_story_id');
            $table->index('sharer_id', 'idx_story_shares_sharer_id');
            $table->index('story_owner_id', 'idx_story_shares_owner_id');
            $table->index('created_at', 'idx_story_shares_created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_shares');
    }
};
