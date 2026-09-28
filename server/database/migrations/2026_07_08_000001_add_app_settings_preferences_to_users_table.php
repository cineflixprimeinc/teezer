<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * App Preferences settings - one nullable JSON column per group on `users`,
 * matching the existing accessibility_preferences / content_preferences pattern.
 * Powers the mobile Settings › App Preferences pages (Appearance, Messages,
 * Digital Wellbeing, AI Features).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('appearance_preferences')->nullable()->after('accessibility_preferences');
            $table->json('messages_preferences')->nullable()->after('appearance_preferences');
            $table->json('wellbeing_preferences')->nullable()->after('messages_preferences');
            $table->json('ai_preferences')->nullable()->after('wellbeing_preferences');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'appearance_preferences',
                'messages_preferences',
                'wellbeing_preferences',
                'ai_preferences',
            ]);
        });
    }
};
