<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Daily performance rollup, aggregated from ClickHouse into Postgres for advertiser/admin
 * reports. Raw per-event data lives in ClickHouse (reelsoo.events), never here. Foreign keys
 * are intentionally omitted (indexed ids only) so history survives campaign deletion and the
 * high-volume upsert path stays cheap. Nullable grouping columns use 0 / '' defaults so the
 * unique key works with Postgres ON CONFLICT upserts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_stats_daily', function (Blueprint $table) {
            $table->id();
            $table->date('stat_date');

            $table->unsignedBigInteger('ad_account_id')->default(0);
            $table->unsignedBigInteger('campaign_id')->default(0);
            $table->unsignedBigInteger('ad_group_id')->default(0);
            $table->unsignedBigInteger('creative_id')->default(0);
            $table->string('placement', 40)->default('');
            $table->string('country', 2)->default('');

            $table->unsignedBigInteger('impressions')->default(0);
            $table->unsignedBigInteger('reach')->default(0);
            $table->unsignedBigInteger('clicks')->default(0);
            $table->unsignedBigInteger('conversions')->default(0);
            $table->unsignedBigInteger('spend_cents')->default(0);

            $table->timestamps();

            $table->unique(
                ['stat_date', 'campaign_id', 'ad_group_id', 'creative_id', 'placement', 'country'],
                'ad_stats_daily_unique'
            );
            $table->index('ad_account_id');
            $table->index('campaign_id');
            $table->index('stat_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_stats_daily');
    }
};
