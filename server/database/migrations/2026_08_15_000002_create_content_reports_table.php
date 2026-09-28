<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One polymorphic reports table for everything that previously had NO
 * working report system: user profiles, DM conversations, live streams,
 * and Spaces (audio rooms). Deliberately NOT merged with the existing
 * video_reports/comment_reports/story_reports tables - those are live,
 * working, and already have their own admin-review wiring; migrating
 * three years of production report rows onto a new shape to save one
 * table would be exactly the kind of unrequested refactor this codebase's
 * rules say not to do. This is additive: a new table for genuinely new
 * capability, four near-identical one-off tables avoided by making this
 * one polymorphic instead.
 *
 * `reportable_type` is a short literal ('user', 'conversation',
 * 'live_stream', 'space'), not a fully-qualified model class name - one
 * fewer thing a renamed model/namespace could silently break.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_reports', function (Blueprint $table) {
            $table->id();
            $table->string('reportable_type', 20);
            $table->unsignedBigInteger('reportable_id');
            $table->foreignId('reporter_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 40);
            $table->text('details')->nullable();
            $table->json('evidence_keys')->nullable();
            $table->enum('status', ['pending', 'reviewed', 'actioned', 'dismissed'])->default('pending');
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // One report per (person, thing) - resubmitting doesn't queue a
            // second row, same dedup rule video/comment reports already
            // enforce (app-level there; DB-level here, matching story_reports).
            $table->unique(['reportable_type', 'reportable_id', 'reporter_id']);
            $table->index(['reportable_type', 'reportable_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_reports');
    }
};
