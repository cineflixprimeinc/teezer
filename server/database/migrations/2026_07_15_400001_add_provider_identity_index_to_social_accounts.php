<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Social sign-in resolves the user by the provider's immutable subject
 * (provider + provider_id) BEFORE falling back to a verified-email match, so a
 * returning user is never duplicated when their provider email differs from
 * their account email (email change, Apple Hide-My-Email relay, etc.).
 *
 * This adds the composite index that lookup relies on. The table keeps its
 * existing unique(user_id, provider); a user still links each provider once.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->index(['provider', 'provider_id'], 'social_accounts_provider_identity_index');
        });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->dropIndex('social_accounts_provider_identity_index');
        });
    }
};
