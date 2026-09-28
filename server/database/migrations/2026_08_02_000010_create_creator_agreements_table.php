<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Terms a creator has accepted, one row per acceptance.
 *
 * Several monetization requirements are not a number to reach but a promise to
 * make: the original-content pledge on Creator Rewards, the merchant agreement
 * on Affiliate Shop, the disclosure commitment on tagged posts. Without
 * somewhere to record them those requirements could only ever be decorative -
 * a checklist row a creator could look at but never clear.
 *
 * Recorded per acceptance rather than as a boolean on `users` so the answer to
 * "what did they agree to, and when" survives a change to the terms. A new
 * version simply means a new key, and the old acceptance stays as evidence of
 * what was true at the time.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('creator_agreements')) {
            return;
        }

        Schema::create('creator_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            /** e.g. content_pledge, merchant_terms, affiliate_disclosure */
            $table->string('key', 40);
            /** Which wording they accepted, so a re-issue can require re-signing. */
            $table->string('version', 20)->default('1');
            $table->timestamp('accepted_at');
            // Evidence, not analytics: this is the record you would produce if
            // a creator ever disputed having agreed.
            $table->string('ip', 45)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_agreements');
    }
};
