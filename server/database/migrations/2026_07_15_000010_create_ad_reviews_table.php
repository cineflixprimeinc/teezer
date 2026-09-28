<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Moderation audit log: who approved/rejected which campaign or creative, and why.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_reviews', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 20); // campaign | creative
            $table->unsignedBigInteger('subject_id');

            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('decision', 20); // approved | rejected | changes_requested
            $table->text('reason')->nullable();
            $table->jsonb('policy_flags')->nullable();

            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
            $table->index('reviewer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_reviews');
    }
};
