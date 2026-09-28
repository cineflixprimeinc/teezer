<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('creator_wallets')) {
            Schema::create('creator_wallets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->decimal('available_balance', 12, 2)->default(0);
                $table->decimal('pending_balance', 12, 2)->default(0);
                $table->decimal('lifetime_earnings', 12, 2)->default(0);
                $table->string('currency', 3)->default('USD');
                $table->timestamps();
                $table->unique('user_id');
            });
        }

        if (! Schema::hasTable('creator_earnings')) {
            Schema::create('creator_earnings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('video_id')->nullable()->constrained('videos')->nullOnDelete();
                $table->enum('source', ['ad_revenue', 'live_gift', 'subscription', 'brand_collab', 'series'])
                    ->default('ad_revenue');
                $table->decimal('amount', 12, 2)->default(0);
                $table->string('currency', 3)->default('USD');
                $table->enum('status', ['pending', 'paid', 'on_hold'])->default('pending');
                $table->string('note', 255)->nullable();
                $table->timestamp('earned_at')->useCurrent();
                $table->timestamps();
                $table->index(['user_id', 'earned_at']);
                $table->index(['user_id', 'source']);
                $table->index(['user_id', 'video_id']);
                $table->index(['user_id', 'status']);
            });
        }

        if (! Schema::hasTable('creator_payouts')) {
            Schema::create('creator_payouts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->decimal('amount', 12, 2);
                $table->string('currency', 3)->default('USD');
                $table->enum('status', ['pending', 'processing', 'paid', 'failed'])->default('pending');
                $table->unsignedBigInteger('payout_method_id')->nullable();
                $table->timestamp('scheduled_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->string('failure_reason', 255)->nullable();
                $table->timestamps();
                $table->index(['user_id', 'status']);
                $table->index(['user_id', 'scheduled_at']);
            });
        }

        if (! Schema::hasTable('creator_payout_methods')) {
            Schema::create('creator_payout_methods', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('provider', 50)->default('paypal');
                $table->string('account_email', 255)->nullable();
                $table->string('masked_account', 100)->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();
                $table->index(['user_id', 'is_default']);
            });
        }

        if (! Schema::hasTable('creator_revenue_goals')) {
            Schema::create('creator_revenue_goals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->decimal('monthly_goal', 12, 2)->default(10000);
                $table->string('currency', 3)->default('USD');
                $table->timestamps();
                $table->unique('user_id');
            });
        }

        if (! Schema::hasTable('creator_monetization_status')) {
            Schema::create('creator_monetization_status', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->boolean('account_standing')->default(true);
                $table->boolean('ad_revenue_eligible')->default(false);
                $table->boolean('live_gifts_enabled')->default(false);
                $table->boolean('subscriptions_enabled')->default(false);
                $table->boolean('tax_info_completed')->default(false);
                $table->timestamps();
                $table->unique('user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_monetization_status');
        Schema::dropIfExists('creator_revenue_goals');
        Schema::dropIfExists('creator_payout_methods');
        Schema::dropIfExists('creator_payouts');
        Schema::dropIfExists('creator_earnings');
        Schema::dropIfExists('creator_wallets');
    }
};
