<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Top-level campaign: objective + budget + schedule + lifecycle.
 * `promotion_id` is the bridge back to the legacy `promotions` intake (nullable):
 * a promotion projects into exactly one campaign via the PromotionAdMapper adapter,
 * so the existing wizard/promote page keep working unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ad_account_id')->constrained('ad_accounts')->cascadeOnDelete();
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();

            $table->string('name', 150);
            $table->string('objective', 40)->default('reach');
            // reach | video_views | traffic | engagement | followers | conversions | app_installs

            $table->string('status', 30)->default('draft');
            // draft | pending_review | approved | rejected | active | paused | completed | archived

            // Budget (integer cents)
            $table->string('budget_type', 20)->default('daily');   // daily | lifetime
            $table->unsignedBigInteger('daily_budget_cents')->default(0);
            $table->unsignedBigInteger('total_budget_cents')->default(0);
            $table->unsignedBigInteger('spent_cents')->default(0);
            $table->string('currency', 10)->default('USD');

            // Bidding & pacing
            $table->string('bid_strategy', 30)->default('lowest_cost'); // lowest_cost | cost_cap | bid_cap
            $table->string('pacing', 20)->default('standard');          // standard | accelerated

            // Schedule
            $table->timestamp('start_at')->nullable();
            $table->timestamp('end_at')->nullable();

            // Review
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->text('rejection_reason')->nullable();

            $table->jsonb('meta')->nullable();
            $table->timestamps();

            $table->index('ad_account_id');
            $table->index('promotion_id');
            $table->index('status');
            $table->index(['status', 'start_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_campaigns');
    }
};
