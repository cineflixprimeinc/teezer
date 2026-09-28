<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->timestamp('delivered_at')->nullable()->after('read_at');
        });

        // Anything already read was necessarily delivered.
        DB::table('direct_messages')
            ->whereNotNull('read_at')
            ->whereNull('delivered_at')
            ->update(['delivered_at' => DB::raw('read_at')]);

        // The chat-server sweeps "receiver_id = ? AND delivered_at IS NULL" on every
        // socket connect - a partial index keeps that O(undelivered), not O(all rows).
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX direct_messages_undelivered_idx ON direct_messages (receiver_id) WHERE delivered_at IS NULL');
        } else {
            Schema::table('direct_messages', function (Blueprint $table) {
                $table->index(['receiver_id', 'delivered_at'], 'direct_messages_undelivered_idx');
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS direct_messages_undelivered_idx');
        } else {
            Schema::table('direct_messages', function (Blueprint $table) {
                $table->dropIndex('direct_messages_undelivered_idx');
            });
        }
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn('delivered_at');
        });
    }
};
