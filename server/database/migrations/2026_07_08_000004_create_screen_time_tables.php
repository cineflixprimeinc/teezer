<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Screen Time - permanent storage. Live active-usage is buffered per user in
 * Redis (deltas) and flushed here every 5 minutes by the screen-time:flush
 * command, so per-user DB writes stay cheap at scale.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('screen_time_daily', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->unsignedInteger('total_seconds')->default(0);
            $table->json('breakdown')->nullable();               // { videos, live, ... } seconds
            $table->unsignedInteger('longest_session_seconds')->default(0);
            $table->unsignedInteger('sessions_count')->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'date']);
            $table->index('date');
        });

        Schema::create('screen_time_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->string('activity', 20)->nullable();          // dominant activity for the run
            $table->string('device', 20)->nullable();            // mobile | desktop
            $table->timestamps();
            $table->index(['user_id', 'started_at']);
        });

        Schema::create('screen_time_limits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete()->unique();
            $table->unsignedSmallInteger('goal_minutes')->default(180);
            $table->boolean('daily_limit_enabled')->default(false);
            $table->unsignedSmallInteger('daily_limit_minutes')->default(120);
            $table->boolean('break_enabled')->default(false);
            $table->unsignedSmallInteger('break_interval_minutes')->default(60);
            $table->boolean('bedtime_enabled')->default(false);
            $table->string('bedtime_start', 5)->default('22:00');
            $table->string('bedtime_end', 5)->default('07:00');
            $table->boolean('bedtime_disable_feed')->default(true);
            $table->boolean('bedtime_disable_live')->default(true);
            $table->boolean('bedtime_disable_audio')->default(true);
            $table->boolean('bedtime_disable_upload')->default(true);
            $table->boolean('bedtime_mute_notifications')->default(true);
            $table->boolean('focus_hide_notifications')->default(false);
            $table->boolean('focus_disable_infinite_scroll')->default(false);
            $table->boolean('focus_disable_autoplay')->default(false);
            $table->boolean('focus_hide_recommended')->default(false);
            $table->boolean('focus_pause_messages')->default(false);
            $table->timestamps();
        });

        Schema::create('screen_time_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('period_type', 10);                   // weekly | monthly
            $table->date('period_start');
            $table->date('period_end');
            $table->json('data');
            $table->timestamps();
            $table->index(['user_id', 'period_type', 'period_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('screen_time_reports');
        Schema::dropIfExists('screen_time_limits');
        Schema::dropIfExists('screen_time_sessions');
        Schema::dropIfExists('screen_time_daily');
    }
};
