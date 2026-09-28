<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Guarantee one ad account per user at the DB level so the OAuth/consent flow
 * (and AdAccountService::forUser firstOrCreate) can never race two rows.
 * Any pre-existing duplicates are collapsed to the earliest row first.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Collapse duplicates: keep the lowest id per user_id, drop the rest.
        DB::statement('DELETE FROM ad_accounts a USING ad_accounts b WHERE a.user_id = b.user_id AND a.id > b.id');

        Schema::table('ad_accounts', function (Blueprint $table) {
            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('ad_accounts', function (Blueprint $table) {
            $table->dropUnique(['user_id']);
        });
    }
};
