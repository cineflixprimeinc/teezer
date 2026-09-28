<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('moderation_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('nsfw_pending_threshold', 4, 2)->default(0.65);
            $table->decimal('nsfw_reject_threshold', 4, 2)->default(0.85);
            $table->decimal('nudity_pending_threshold', 4, 2)->default(0.65);
            $table->decimal('nudity_reject_threshold', 4, 2)->default(0.85);
            $table->unsignedSmallInteger('video_default_frame_interval_seconds')->default(2);
            $table->unsignedSmallInteger('video_default_scan_duration_seconds')->default(120);
            $table->unsignedSmallInteger('video_full_scan_frame_interval_seconds')->default(1);
            $table->boolean('auto_reject_enabled')->default(true);
            $table->boolean('admin_review_required_for_high_risk')->default(true);
            $table->boolean('moderation_enabled')->default(true);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });

        // Seed default row
        DB::table('moderation_settings')->insert([
            'nsfw_pending_threshold'                  => 0.65,
            'nsfw_reject_threshold'                   => 0.85,
            'nudity_pending_threshold'                => 0.65,
            'nudity_reject_threshold'                 => 0.85,
            'video_default_frame_interval_seconds'    => 2,
            'video_default_scan_duration_seconds'     => 120,
            'video_full_scan_frame_interval_seconds'  => 1,
            'auto_reject_enabled'                     => true,
            'admin_review_required_for_high_risk'     => true,
            'moderation_enabled'                      => true,
            'created_at'                              => now(),
            'updated_at'                              => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('moderation_settings');
    }
};
