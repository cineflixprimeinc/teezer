<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            // On PG the enum is varchar+CHECK; values are unchanged, only the default.
            DB::statement("ALTER TABLE users ALTER COLUMN message_privacy SET DEFAULT 'everyone'");
        } else {
            Schema::table('users', function (Blueprint $table) {
                $table->enum('message_privacy', ['everyone', 'friends', 'followers', 'no_one'])
                      ->default('everyone')
                      ->change();
            });
        }

        // Update existing users whose message_privacy was set to the old default 'friends'
        // by the database (i.e., they never explicitly changed it). We can't distinguish
        // these from users who manually chose 'friends', so we only reset NULL values.
        // The column had a NOT NULL default so there are no NULLs to update - no-op.
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE users ALTER COLUMN message_privacy SET DEFAULT 'friends'");
        } else {
            Schema::table('users', function (Blueprint $table) {
                $table->enum('message_privacy', ['everyone', 'friends', 'followers', 'no_one'])
                      ->default('friends')
                      ->change();
            });
        }
    }
};
