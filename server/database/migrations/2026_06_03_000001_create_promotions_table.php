<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();

            // Campaign settings
            $table->string('objective', 60)->default('more_views');
            // more_views | more_followers | more_profile_visits | more_engagement

            // Audience targeting
            $table->string('country', 100)->nullable();
            $table->string('age_range', 20)->nullable();
            $table->string('gender', 10)->default('all');
            $table->json('interests')->nullable();

            // Budget
            $table->decimal('daily_budget', 12, 2)->default(1.00);
            $table->decimal('total_budget', 12, 2)->default(7.00);
            $table->string('currency', 10)->default('USD');
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->unsignedSmallInteger('duration_days')->default(7);

            // Payment
            $table->string('payment_method', 60)->nullable();
            // teezer_balance | credit_card | e_wallet | bank_transfer

            // Estimated reach (stored at creation time)
            $table->unsignedInteger('est_impressions_min')->nullable();
            $table->unsignedInteger('est_impressions_max')->nullable();
            $table->unsignedInteger('est_views_min')->nullable();
            $table->unsignedInteger('est_views_max')->nullable();
            $table->unsignedInteger('est_profile_visits_min')->nullable();
            $table->unsignedInteger('est_profile_visits_max')->nullable();

            // Lifecycle
            $table->string('status', 30)->default('draft');
            // draft | pending_review | approved | rejected | active | paused | completed

            $table->text('rejection_reason')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
