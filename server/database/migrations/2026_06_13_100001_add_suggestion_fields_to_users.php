<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'last_active_at')) {
                $table->timestamp('last_active_at')->nullable()->after('updated_at');
            }
            if (!Schema::hasColumn('users', 'trust_score')) {
                $table->decimal('trust_score', 4, 3)->default(0.800)->after('last_active_at');
                $table->index('trust_score');
            }
        });

        // Backfill last_active_at from updated_at for existing users
        \Illuminate\Support\Facades\DB::statement(
            'UPDATE users SET last_active_at = updated_at WHERE last_active_at IS NULL'
        );
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach (['last_active_at', 'trust_score'] as $col) {
                if (Schema::hasColumn('users', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
