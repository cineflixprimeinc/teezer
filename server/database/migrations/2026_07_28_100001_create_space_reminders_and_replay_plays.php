<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the Spaces tab's Scheduled and Replays sections need to be real.
 *
 * `space_reminders` is the RSVP behind both halves of a scheduled row: the
 * "N going" count is this table, and the Remind button is this user's row in
 * it. One row per (space, user) - the unique index is what makes the button a
 * toggle rather than a counter you can pump.
 *
 * `plays_count` is the replay's own tally. A room's listeners_count stops
 * meaning anything once the room ends, so a replay needs a separate number to
 * show; it is incremented by the replay endpoint, not by the client.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('space_reminders')) {
            Schema::create('space_reminders', function (Blueprint $table) {
                $table->id();
                $table->foreignId('space_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamps();

                // One reminder per person per room - the toggle's guarantee.
                $table->unique(['space_id', 'user_id']);
                // "What am I going to?" - the reverse lookup, for the tab.
                $table->index(['user_id', 'space_id']);
            });
        }

        Schema::table('spaces', function (Blueprint $table) {
            if (! Schema::hasColumn('spaces', 'plays_count')) {
                $table->unsignedInteger('plays_count')->default(0)->after('peak_listeners');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('space_reminders');

        Schema::table('spaces', function (Blueprint $table) {
            if (Schema::hasColumn('spaces', 'plays_count')) {
                $table->dropColumn('plays_count');
            }
        });
    }
};
