<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Evidence upload for the report flows that already work end-to-end
 * (video/comment/story). Additive only - the reason enums/columns those
 * three tables already have are untouched, so nothing about how they're
 * validated or reviewed today changes; this only gives a reporter an
 * optional way to attach up to a few screenshots/photos as evidence.
 *
 * A JSON array of storage keys rather than a single string column: a
 * report backing a claim ("this screenshot proves the harassment") is
 * often more than one image, and a small array avoids a separate
 * report_evidence table for what is, in practice, a handful of keys per
 * report. Keys, not URLs - the same pattern VerificationRequest uses for
 * identity documents (see its documentUrl()/signedDoc()), because a
 * report can sit unreviewed for a while and a stored URL would go stale;
 * the admin review UI signs each key fresh at read time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_reports', function (Blueprint $table) {
            $table->json('evidence_keys')->nullable()->after('description');
        });
        Schema::table('comment_reports', function (Blueprint $table) {
            $table->json('evidence_keys')->nullable()->after('details');
        });
        Schema::table('story_reports', function (Blueprint $table) {
            $table->json('evidence_keys')->nullable()->after('reason');
        });
    }

    public function down(): void
    {
        Schema::table('video_reports', function (Blueprint $table) {
            $table->dropColumn('evidence_keys');
        });
        Schema::table('comment_reports', function (Blueprint $table) {
            $table->dropColumn('evidence_keys');
        });
        Schema::table('story_reports', function (Blueprint $table) {
            $table->dropColumn('evidence_keys');
        });
    }
};
