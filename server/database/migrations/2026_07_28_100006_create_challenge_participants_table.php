<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The lightweight "Join" tap on a challenge - an RSVP/intent row, separate
 * from actually posting a video entry. One row per (challenge, user); the
 * unique index is what makes join() a toggle rather than a counter anyone
 * can pump (same guarantee as space_reminders).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('challenge_participants')) {
            Schema::create('challenge_participants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('challenge_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('joined_at');

                $table->unique(['challenge_id', 'user_id']);
                // "What have I joined?" - the reverse lookup.
                $table->index(['user_id', 'challenge_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('challenge_participants');
    }
};
