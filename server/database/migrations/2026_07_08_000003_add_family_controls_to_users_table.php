<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Family Control - Child Mode + Content Controls settings (JSON column, same
 * pattern as the other preference groups) plus a hashed parent PIN used to gate
 * enabling/disabling Child Mode.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('family_preferences')->nullable()->after('ai_preferences');
            $table->string('family_pin')->nullable()->after('family_preferences'); // bcrypt hash
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['family_preferences', 'family_pin']);
        });
    }
};
