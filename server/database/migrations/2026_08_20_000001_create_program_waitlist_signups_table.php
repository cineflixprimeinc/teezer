<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A creator tapping "Notify me when eligible" / "Join the waitlist" on a
 * coming-soon programme (Rewards, Subscriptions, Brand Marketplace today).
 *
 * `monetization_programs.waitlist_enabled` has existed since
 * 2026_08_02_000004 as an admin toggle, but nothing ever wrote a row anywhere
 * - the button called it did nothing but switch tabs (StudioProgrammeScreen's
 * onPress). This table is what makes that real: tapping the button now
 * registers interest, once, per creator per programme.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('program_waitlist_signups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('program_key', 40);
            $table->timestamps();

            $table->unique(['user_id', 'program_key']);
            $table->index('program_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('program_waitlist_signups');
    }
};
