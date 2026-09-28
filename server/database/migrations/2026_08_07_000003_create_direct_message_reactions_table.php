<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Emoji reactions on a direct message.
 *
 * Space chat already has this (space_message_reactions); direct messages never
 * did. Separate table rather than reusing that one - the foreign key points at
 * a different messages table, and merging them would mean a nullable key per
 * kind and no referential integrity on either.
 *
 * UNIQUE (message_id, user_id): one reaction per person per message, which is
 * how every messenger this is modelled on behaves. Reacting again REPLACES the
 * emoji rather than stacking, so the write is an upsert on that key and the
 * count can never double-count one person.
 *
 * The emoji is stored as the literal grapheme, not a shortcode. It arrives from
 * the client as Unicode, is rendered as Unicode, and a lookup table between the
 * two would be a mapping to maintain for no gain. 32 chars leaves room for a
 * ZWJ sequence with modifiers, which can run long.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('direct_message_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained('direct_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('emoji', 32);
            $table->timestamps();

            $table->unique(['message_id', 'user_id']);
            // Every read is "the reactions on these messages", loaded per page
            // of a thread.
            $table->index('message_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('direct_message_reactions');
    }
};
