<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('video_id')->unique()->constrained()->cascadeOnDelete();

            // Overall recommendation score
            $table->decimal('score', 10, 4)->default(0);

            // Score components (stored for debugging/tuning)
            $table->decimal('completion_score', 8, 4)->default(0); // completion_avg * 0.4
            $table->decimal('rewatch_score',    8, 4)->default(0); // rewatch_count * 2
            $table->decimal('like_score',       8, 4)->default(0); // like_count * 3
            $table->decimal('comment_score',    8, 4)->default(0); // comment_count * 4
            $table->decimal('share_score',      8, 4)->default(0); // share_count * 6
            $table->decimal('save_score',       8, 4)->default(0); // save_count * 5
            $table->decimal('follow_score',     8, 4)->default(0); // follow_from_video * 8
            $table->decimal('skip_penalty',     8, 4)->default(0); // quick_skips * 5
            $table->decimal('report_penalty',   8, 4)->default(0); // reports * 20

            $table->unsignedInteger('event_count')->default(0);
            $table->timestamp('computed_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

            $table->index('score');
            $table->index('computed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_scores');
    }
};
