<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A creator's standing on each monetization programme.
 *
 * This is a SNAPSHOT, not the source of truth. Eligibility is recomputed on
 * every read by MonetizationEligibilityService; this table exists for the three
 * things a computed value cannot give you:
 *
 *   - history: when a creator first unlocked something, and when they lost it
 *   - transitions: the job compares to what is stored to know what to notify on
 *   - lists: "every creator active on Gifts" without measuring the whole table
 *
 * Because it is never what a creator is shown, a missed event can leave a row
 * stale without any user-visible consequence - the next read still measures.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('creator_program_status')) {
            return;
        }

        Schema::create('creator_program_status', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The programme's key, not its id: a programme can be renamed or
            // reseeded without orphaning a creator's history.
            $table->string('program_key', 40);

            $table->string('status', 20)->default('locked');
            $table->unsignedSmallInteger('met_count')->default(0);
            $table->unsignedSmallInteger('total_count')->default(0);
            $table->unsignedTinyInteger('percent')->default(0);

            /** First time this creator ever had the programme. Never cleared. */
            $table->timestamp('unlocked_at')->nullable();
            /** Set when access is withdrawn, cleared when it comes back. */
            $table->timestamp('suspended_at')->nullable();
            $table->timestamp('evaluated_at')->nullable();

            $table->timestamps();

            $table->unique(['user_id', 'program_key']);
            // "Everyone active on X", which is the only cross-creator query
            // this table is meant to answer.
            $table->index(['program_key', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_program_status');
    }
};
