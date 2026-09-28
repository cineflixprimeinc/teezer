<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets a waitlist signup record that it has been fulfilled.
 *
 * program_waitlist_signups was write-only: the join endpoint created rows and
 * nothing ever read them, so a user who asked to be told when a monetization
 * plan opened was never told. Without a timestamp there is also no way to send
 * the announcement once and only once - the requirement that it must not be
 * repeated needs somewhere to record that it already happened.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('program_waitlist_signups', function (Blueprint $table) {
            $table->timestamp('notified_at')->nullable()->after('program_key');

            // The notifier's own query: "signups for this program that have not
            // been told yet". Partial-index semantics come free from the fact
            // that fulfilled rows stop matching once stamped.
            $table->index(['program_key', 'notified_at'], 'pws_program_notified_idx');
        });
    }

    public function down(): void
    {
        Schema::table('program_waitlist_signups', function (Blueprint $table) {
            $table->dropIndex('pws_program_notified_idx');
            $table->dropColumn('notified_at');
        });
    }
};
