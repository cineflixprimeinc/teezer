<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Encrypted TOTP secret (base32). Null until the user starts setup.
            $table->text('two_factor_secret')->nullable()->after('password');
            // Encrypted JSON array of one-time recovery codes.
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            // Set only once a valid code has confirmed the secret. Null = 2FA not active.
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_recovery_codes');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'two_factor_secret',
                'two_factor_recovery_codes',
                'two_factor_confirmed_at',
            ]);
        });
    }
};
