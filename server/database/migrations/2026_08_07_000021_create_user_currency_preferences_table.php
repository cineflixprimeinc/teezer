<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A user's chosen country / currency / language, and whether they still want
 * detection to decide.
 *
 * `auto_detect` is the whole point of the table. Detection runs on every
 * request and would otherwise silently overwrite a deliberate choice the next
 * time someone travelled or used a VPN. With this row: auto_detect true means
 * "keep detecting"; false means the stored values win until the user turns
 * detection back on. Nothing else may clear it.
 *
 * One row per user, so it is a 1:1 keyed on user_id rather than a settings bag.
 * Guests have no row - their choice lives in a cookie / device storage, because
 * there is no account to hang it on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_currency_preferences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            // Null means "never chosen" - distinct from a chosen value that
            // happens to match what detection would have returned.
            $table->string('country_code', 2)->nullable();
            $table->string('currency_code', 3)->nullable();
            $table->string('language', 8)->nullable();
            $table->boolean('auto_detect')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_currency_preferences');
    }
};
