<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guideline strikes and brand-safety flags.
 *
 * Two rules in the monetization spec need this and had nothing behind them:
 * "zero active community-guideline strikes, a strike blocks all programmes for
 * 90 days", and "no brand-safety flags in the last 90 days". `users.is_banned`
 * could not serve either - it is a full account ban, so a creator with one
 * strike looked spotless and a banned creator looked identical to one with
 * three.
 *
 * One table with a `type` because the two behave identically - both are issued,
 * both expire after a window, both can be appealed - and differ only in which
 * programmes they gate. Two tables would be the same schema twice.
 *
 * `expires_at` is stored rather than derived so changing the policy window does
 * not silently re-date every strike ever issued.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('creator_strikes')) {
            return;
        }

        Schema::create('creator_strikes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            /** guideline | brand_safety */
            $table->string('type', 20)->default('guideline');
            $table->string('reason', 300);
            /** What it was about - a video, a live, a campaign. */
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();

            $table->timestamp('issued_at');
            /** Stored, not derived: a policy change must not re-date history. */
            $table->timestamp('expires_at');

            /* Appeals. An upheld appeal clears the strike immediately by
               setting `cleared_at`, which is what the eligibility engine reads -
               it never has to interpret an appeal's state. */
            $table->string('appeal_status', 20)->nullable();  // pending|upheld|rejected
            $table->text('appeal_note')->nullable();
            $table->timestamp('appealed_at')->nullable();
            $table->timestamp('cleared_at')->nullable();

            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // "Does this creator have an active strike of this type" - the only
            // question the engine asks, on every evaluation.
            $table->index(['user_id', 'type', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_strikes');
    }
};
