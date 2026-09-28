<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Spaces - live audio rooms (the mobile app's Spaces tab, and Audio Rooms in
 * the admin panel).
 *
 * listeners_count / speakers_count are denormalised counters rather than a
 * count() over space_participants: the admin list and the app's room cards show
 * them for every row, and a live platform reads them far more often than it
 * writes them. peak_listeners is kept because it is the number that matters
 * once a room has ended and the live count has drained to zero.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spaces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('host_id')->constrained('users')->cascadeOnDelete();

            $table->string('title');
            $table->text('description')->nullable();
            $table->string('topic', 40)->nullable();

            // scheduled -> live -> ended is the whole lifecycle; a room that is
            // pulled by a moderator is ended with ended_by_admin_id set, so the
            // reason it stopped survives.
            $table->string('status', 12)->default('scheduled');

            $table->unsignedInteger('listeners_count')->default(0);
            $table->unsignedInteger('speakers_count')->default(0);
            $table->unsignedInteger('peak_listeners')->default(0);

            $table->boolean('is_recorded')->default(false);
            $table->string('recording_url', 500)->nullable();

            $table->timestamp('scheduled_for')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();

            $table->foreignId('ended_by_admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ended_reason', 255)->nullable();

            $table->timestamps();

            // The admin list is "live rooms first, newest first", and the app
            // browses by topic - both are covered here.
            $table->index(['status', 'created_at']);
            $table->index(['topic', 'status']);
            $table->index('host_id');
        });

        Schema::create('space_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('space_id')->constrained('spaces')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->string('role', 10)->default('listener'); // host | speaker | listener
            $table->boolean('muted')->default(true);

            $table->timestamp('joined_at')->nullable();
            $table->timestamp('left_at')->nullable();
            $table->timestamps();

            // One row per person per room - rejoining updates that row rather
            // than stacking duplicates the counters would then over-count.
            $table->unique(['space_id', 'user_id']);
            $table->index(['space_id', 'role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('space_participants');
        Schema::dropIfExists('spaces');
    }
};
