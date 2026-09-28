<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pinning a message can now be for a chosen duration (24h/7d/30d) instead of
 * only "pinned forever until someone unpins it". Null means forever, same as
 * conversation_settings.muted_until's own "no end date" convention.
 *
 * No cron/scheduled job needed: DirectMessage::isPinned()'s accessor treats
 * an expired pinned_until as unpinned at read time, same lazy-expiry
 * approach conversation_settings.muted_until already uses in
 * updateConversationSettings()'s own response.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->timestamp('pinned_until')->nullable()->after('pinned_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn('pinned_until');
        });
    }
};
