<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add two new boolean columns to user_moderation_settings
        Schema::table('user_moderation_settings', function (Blueprint $table) {
            $table->boolean('disable_commenting_on_others')->default(false)->after('disable_commenting');
            $table->boolean('disable_following_others')->default(false)->after('disable_commenting_on_others');
        });

        // Extend the restriction_type enum in user_admin_restrictions
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE user_admin_restrictions DROP CONSTRAINT IF EXISTS user_admin_restrictions_restriction_type_check');
            DB::statement("ALTER TABLE user_admin_restrictions ADD CONSTRAINT user_admin_restrictions_restriction_type_check CHECK (restriction_type IN (
                'restrict_uploads','post_approval_required','block_live_access','disable_draft_creation',
                'disable_commenting_on_uploads','disable_commenting_on_others','disable_following_others'))");
        } else {
            DB::statement("ALTER TABLE user_admin_restrictions MODIFY restriction_type ENUM(
                'restrict_uploads',
                'post_approval_required',
                'block_live_access',
                'disable_draft_creation',
                'disable_commenting_on_uploads',
                'disable_commenting_on_others',
                'disable_following_others'
            ) NOT NULL");
        }
    }

    public function down(): void
    {
        Schema::table('user_moderation_settings', function (Blueprint $table) {
            $table->dropColumn(['disable_commenting_on_others', 'disable_following_others']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE user_admin_restrictions DROP CONSTRAINT IF EXISTS user_admin_restrictions_restriction_type_check');
            DB::statement("ALTER TABLE user_admin_restrictions ADD CONSTRAINT user_admin_restrictions_restriction_type_check CHECK (restriction_type IN (
                'restrict_uploads','post_approval_required','block_live_access','disable_draft_creation',
                'disable_commenting_on_uploads'))");
        } else {
            DB::statement("ALTER TABLE user_admin_restrictions MODIFY restriction_type ENUM(
                'restrict_uploads',
                'post_approval_required',
                'block_live_access',
                'disable_draft_creation',
                'disable_commenting_on_uploads'
            ) NOT NULL");
        }
    }
};
