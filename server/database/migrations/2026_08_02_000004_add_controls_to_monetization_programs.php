<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The controls an operator actually needs to run a monetization programme.
 *
 * `mode` alone answers "is it on". These answer the questions that come next:
 * on which surface, in which countries, for how many creators, from when, on
 * what terms, and who reviews the creator before money moves.
 *
 * Every one of them is enforced server-side in
 * StudioMonetizationProgramController, so a client cannot opt itself back in to
 * a programme an operator has restricted.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        Schema::table('monetization_programs', function (Blueprint $table) {
            // ── Where it shows ────────────────────────────────────────────
            // Independent, because a programme is routinely piloted on one
            // surface before the other - the app ships on a store review cycle,
            // the website does not.
            if (! Schema::hasColumn('monetization_programs', 'visible_app')) {
                $table->boolean('visible_app')->default(true)->after('mode');
            }
            if (! Schema::hasColumn('monetization_programs', 'visible_web')) {
                $table->boolean('visible_web')->default(true)->after('visible_app');
            }

            // ── Who it reaches ────────────────────────────────────────────
            // NULL means worldwide. An empty array would mean "nobody", which
            // is what `disabled` is for, so the two never overlap.
            if (! Schema::hasColumn('monetization_programs', 'countries')) {
                $table->json('countries')->nullable()->after('visible_web');
            }
            // Deterministic per creator, so a creator who sees a programme
            // today does not lose it tomorrow at the same percentage.
            if (! Schema::hasColumn('monetization_programs', 'rollout_percent')) {
                $table->unsignedTinyInteger('rollout_percent')->default(100)->after('countries');
            }
            // Before this instant the programme behaves as coming_soon, however
            // its mode reads - so a launch can be staged without a deploy.
            if (! Schema::hasColumn('monetization_programs', 'starts_at')) {
                $table->timestamp('starts_at')->nullable()->after('rollout_percent');
            }

            // ── Terms ─────────────────────────────────────────────────────
            // NULL falls back to the platform-wide admin_coin_settings value,
            // so a programme only carries a number when it genuinely differs.
            if (! Schema::hasColumn('monetization_programs', 'commission_rate')) {
                $table->decimal('commission_rate', 5, 2)->nullable()->after('starts_at');
            }
            if (! Schema::hasColumn('monetization_programs', 'min_payout')) {
                $table->decimal('min_payout', 12, 2)->nullable()->after('commission_rate');
            }
            // Days earnings sit before they become withdrawable.
            if (! Schema::hasColumn('monetization_programs', 'hold_days')) {
                $table->unsignedSmallInteger('hold_days')->default(0)->after('min_payout');
            }

            // ── How a creator gets in ─────────────────────────────────────
            // Off means meeting the requirements raises an application rather
            // than opening the programme.
            if (! Schema::hasColumn('monetization_programs', 'auto_approve')) {
                $table->boolean('auto_approve')->default(true)->after('hold_days');
            }
            if (! Schema::hasColumn('monetization_programs', 'waitlist_enabled')) {
                $table->boolean('waitlist_enabled')->default(false)->after('auto_approve');
            }

            // Free-text the clients surface verbatim - a launch note, an outage
            // notice, a policy change. Empty means show nothing.
            if (! Schema::hasColumn('monetization_programs', 'notice')) {
                $table->string('notice', 300)->nullable()->after('waitlist_enabled');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        Schema::table('monetization_programs', function (Blueprint $table) {
            foreach ([
                'visible_app', 'visible_web', 'countries', 'rollout_percent', 'starts_at',
                'commission_rate', 'min_payout', 'hold_days', 'auto_approve',
                'waitlist_enabled', 'notice',
            ] as $col) {
                if (Schema::hasColumn('monetization_programs', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
