<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Memory for the ongoing conditions.
 *
 * The spec's regression rules are not "are you eligible right now" - the engine
 * already answers that on every read. They are "how many months in a row have
 * you fallen short": two consecutive failed months removes enrolment from
 * Creator Rewards, two missed posting months closes Subscriptions to new
 * joiners, two unfulfilled briefs remove a creator from the marketplace for 180
 * days.
 *
 * None of that can be derived from live metrics, because live metrics have no
 * memory of last month. These columns are that memory, written once a month by
 * `monetization:monthly-review`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('creator_program_status')) {
            return;
        }

        Schema::table('creator_program_status', function (Blueprint $table) {
            if (! Schema::hasColumn('creator_program_status', 'consecutive_failed_months')) {
                $table->unsignedSmallInteger('consecutive_failed_months')->default(0)->after('percent');
            }
            /** "2026-08" - so a re-run in the same month cannot double-count. */
            if (! Schema::hasColumn('creator_program_status', 'last_month_key')) {
                $table->string('last_month_key', 7)->nullable()->after('consecutive_failed_months');
            }
            /**
             * Set when enrolment is removed. While `reenrol_after` is in the
             * future the programme stays locked EVEN IF the creator qualifies
             * again - which is what "removed for 180 days" means, and what a
             * purely computed engine could never express.
             */
            if (! Schema::hasColumn('creator_program_status', 'enrolment_removed_at')) {
                $table->timestamp('enrolment_removed_at')->nullable()->after('suspended_at');
            }
            if (! Schema::hasColumn('creator_program_status', 'reenrol_after')) {
                $table->timestamp('reenrol_after')->nullable()->after('enrolment_removed_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('creator_program_status')) {
            return;
        }

        Schema::table('creator_program_status', function (Blueprint $table) {
            foreach (['consecutive_failed_months', 'last_month_key', 'enrolment_removed_at', 'reenrol_after'] as $c) {
                if (Schema::hasColumn('creator_program_status', $c)) {
                    $table->dropColumn($c);
                }
            }
        });
    }
};
