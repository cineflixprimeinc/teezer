<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('video_monetization')) {
            Schema::create('video_monetization', function (Blueprint $table) {
                $table->id();
                $table->foreignId('video_id')->constrained('videos')->cascadeOnDelete()->unique();

                // Eligibility & review
                $table->string('eligibility_status', 30)->default('not_eligible');
                $table->string('review_status', 30)->default('pending');
                $table->timestamp('reviewed_on')->nullable();
                $table->timestamp('next_review')->nullable();

                // Revenue programs
                $table->boolean('ad_revenue_sharing')->default(false);
                $table->boolean('creator_fund_active')->default(false);
                $table->boolean('tips_gifts_enabled')->default(false);
                $table->boolean('subscriptions_eligible')->default(false);
                $table->boolean('brand_partnerships_eligible')->default(false);
                $table->boolean('shop_product_tagging')->default(false);

                // Brand / affiliate
                $table->string('paid_promotion_disclosure', 30)->default('not_required');
                $table->boolean('affiliate_links_enabled')->default(false);
                $table->boolean('brand_deals_allowed')->default(false);
                $table->boolean('auto_claim_brand_mentions')->default(false);

                // Revenue metrics
                $table->decimal('total_earnings', 10, 2)->default(0);
                $table->decimal('rpm', 8, 4)->default(0);
                $table->decimal('cpm', 8, 4)->default(0);
                $table->decimal('revenue', 10, 2)->default(0);
                $table->decimal('next_payout', 10, 2)->default(0);
                $table->date('payout_date')->nullable();
                $table->string('payout_method', 30)->nullable();
                $table->string('payout_currency', 10)->default('USD');
                $table->string('payout_status', 30)->default('up_to_date');

                // Geo
                $table->json('allowed_regions')->nullable();
                $table->json('blocked_regions')->nullable();

                // Policy
                $table->string('policy_status', 30)->default('compliant');
                $table->text('monetization_notes')->nullable();

                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('video_monetization');
    }
};
