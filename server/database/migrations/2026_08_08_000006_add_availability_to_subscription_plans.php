<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Plan availability - where, when and to whom a plan can be bought.
 *
 * Until now "availability" was three booleans (is_enabled, is_popular,
 * is_default) and every surface decided the rest for itself. These columns move
 * that decision to the record, so one answer is computed server-side by
 * PlanAvailabilityService and every client - website, app, and anything built
 * later - inherits it by calling the same endpoint rather than reimplementing
 * the rules.
 *
 * `status` is the authoritative lifecycle field, but `is_enabled` is KEPT and
 * mirrored (is_enabled = status === 'active'). The enabled() scope and several
 * readers already depend on it, and having two switches that can disagree is
 * exactly the bug this migration is supposed to prevent. The admin controller
 * writes both together; nothing writes is_enabled alone.
 *
 * Every column is nullable or defaulted so existing plans stay valid without a
 * backfill, and a plan that sets none of them behaves exactly as it does today:
 * all platforms, everywhere, for everyone, forever.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            /* Lifecycle. Four states rather than a boolean, because "hide from
               new buyers but keep existing subscribers billing" is a real and
               distinct thing from "disabled", and collapsing them loses money. */
            $table->string('status', 32)->default('active')->after('is_enabled');

            /* Where it can be bought. JSON because the list grows - a future
               surface (tv, watch, embed) must not need a migration to appear. */
            $table->json('platforms')->nullable()->after('status');

            /* Which placements show it. Separate from status: a plan can be
               live and purchasable but deliberately absent from the upsell
               modal. */
            $table->json('visibility')->nullable()->after('platforms');

            /* Who may buy it. */
            $table->string('purchase_eligibility', 40)->default('everyone')->after('visibility');

            /* Requirements the buyer's ACCOUNT must meet - verified email,
               minimum age, and so on. */
            $table->json('requirements')->nullable()->after('purchase_eligibility');

            /* Time window. Null start = already available; null end = no expiry.
               Stored as timestamps, compared in UTC, so a schedule means the
               same instant everywhere. */
            $table->timestamp('available_from')->nullable()->after('requirements');
            $table->timestamp('available_until')->nullable()->after('available_from');

            /* Geography. `mode` decides how `countries` is read, so an empty
               list is never ambiguous: include+[] sells nowhere, exclude+[]
               sells everywhere, and neither is a special case in the resolver. */
            $table->string('countries_mode', 16)->default('all')->after('available_until');
            $table->json('countries')->nullable()->after('countries_mode');

            /* Switching plans. */
            $table->json('upgrade_rules')->nullable()->after('countries');
            $table->json('downgrade_rules')->nullable()->after('upgrade_rules');

            /* What happens to people already on this plan when it stops being
               sold. Defaults to the only non-destructive answer. */
            $table->string('existing_subscriber_behavior', 40)->default('keep_and_renew')->after('downgrade_rules');

            // Every availability read filters on status first.
            $table->index('status', 'idx_subscription_plans_status');
        });

        /* Seed status from the switch it replaces, so nothing changes
           behaviour on deploy: a plan that was enabled is active, one that was
           not is disabled. Doing this in SQL rather than in PHP keeps it to one
           statement and works identically on Postgres and SQLite. */
        DB::statement("UPDATE subscription_plans SET status = CASE WHEN is_enabled THEN 'active' ELSE 'disabled' END");
    }

    public function down(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropIndex('idx_subscription_plans_status');
            $table->dropColumn([
                'status', 'platforms', 'visibility', 'purchase_eligibility', 'requirements',
                'available_from', 'available_until', 'countries_mode', 'countries',
                'upgrade_rules', 'downgrade_rules', 'existing_subscriber_behavior',
            ]);
        });
    }
};
