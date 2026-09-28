<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-member view of a conversation: pinned, archived, muted.
 *
 * Module 6 of docs/messaging-architecture.md.
 *
 * PER MEMBER, not per conversation, and that is the whole point. Pinning is MY
 * view of OUR thread - you archiving a chat must not archive it for me, and one
 * of us muting must not silence the other. Columns on `conversations` would
 * force exactly that, which is why they are not there.
 *
 * Timestamps rather than booleans throughout:
 *  - pinned_at    orders the pins. Which one you pinned first is the useful
 *                 order, and a boolean cannot express it.
 *  - archived_at  says when, so a thread can later be surfaced as "archived in
 *                 March" without a second column.
 *  - muted_until  is the whole feature. "Mute for 8 hours" is a time, not a
 *                 flag; NULL means not muted and a far-future date means always,
 *                 so one nullable column covers every option with no second
 *                 field to contradict it.
 *
 * Rows are created on first use, not seeded: the table only ever holds threads
 * someone has actually acted on, so it stays a fraction of the conversation
 * count no matter how many conversations exist.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversation_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('conversations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->timestamp('pinned_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamp('muted_until')->nullable();

            $table->timestamps();

            // One row per person per thread. The inbox upserts on this key, so a
            // double tap cannot leave two rows disagreeing about the same thread.
            $table->unique(['conversation_id', 'user_id']);

            // Every read is "my settings for these conversations", loaded once
            // per inbox page.
            $table->index(['user_id', 'pinned_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_settings');
    }
};
