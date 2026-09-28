<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the room screen grew after the flow-chart shipped: a real "raise hand"
 * queue the host can act on, a hearts counter behind the React button, and an
 * in-room chat with reactions.
 *
 * Requests live on the seat, not a separate table: a person has exactly one
 * hand up at a time, and it is the same row the room already locks on join. The
 * three timestamps are a tiny state machine - hand_raised_at pending, then
 * either approved_at (now a speaker) or declined_at (back to listening) - so the
 * host's Requests screen is one indexed query, not a join.
 *
 * Chat is its own pair of tables because a message is not a seat: it outlives
 * the sender leaving the room, and it fans out to everyone, listeners included.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('space_participants', function (Blueprint $table) {
            // The raise-hand queue. Pending = hand_raised_at set while still a
            // listener; the host clears it by approving or declining.
            $table->timestamp('hand_raised_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('declined_at')->nullable();

            // Reactions this person has sent in the room. Denormalised for the
            // same reason the listener count is: the Listeners screen ranks by
            // it on every open, and it is written far less than it is read.
            $table->unsignedInteger('hearts_sent')->default(0);

            // The host's Requests screen reads "hands up in this room, oldest
            // first" - one index covers it.
            $table->index(['space_id', 'hand_raised_at']);
        });

        Schema::create('space_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('space_id')->constrained('spaces')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->text('body');

            // At most one pinned message matters to the UI (the "Pinned by Host"
            // banner), but a boolean is enough: pinning a new one unpins the old
            // in the controller, so we never rely on a partial unique index.
            $table->boolean('is_pinned')->default(false);

            $table->timestamps();

            // The chat pane reads "this room's messages, newest last" and pages
            // backwards from the bottom.
            $table->index(['space_id', 'id']);
        });

        Schema::create('space_message_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('space_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            // The emoji itself, not an id: the picker is a fixed short set and
            // storing the glyph keeps read paths free of a lookup table.
            $table->string('emoji', 16);

            $table->timestamps();

            // One person, one of each emoji per message - tapping again toggles
            // it off rather than stacking.
            $table->unique(['message_id', 'user_id', 'emoji']);
            $table->index('message_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('space_message_reactions');
        Schema::dropIfExists('space_messages');

        Schema::table('space_participants', function (Blueprint $table) {
            $table->dropIndex(['space_id', 'hand_raised_at']);
            $table->dropColumn(['hand_raised_at', 'approved_at', 'declined_at', 'hearts_sent']);
        });
    }
};
