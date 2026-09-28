<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Associates an OTP draft with a logged-in user so account email verification /
 * change-with-OTP can look up the pending code by user (signup drafts leave this
 * null).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('signup_drafts', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->index()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('signup_drafts', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });
    }
};
