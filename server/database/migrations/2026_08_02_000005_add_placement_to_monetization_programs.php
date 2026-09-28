<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Finer placement control than the two visible_app / visible_web flags.
 *
 * `platforms` splits the app in two, because Android and iOS ship on separate
 * review cycles and a programme is routinely live on one before the other.
 * `surfaces` says WHERE inside a client the programme appears, so gifting can
 * be turned off on live streams without touching it on video posts.
 *
 * The old flags stay and are kept in step, so a client that has not been
 * updated keeps working. Both are backfilled from them here.
 */
return new class extends Migration
{
    /** Ships to every client unless an operator narrows it. */
    private const PLATFORMS = ['android', 'ios', 'web', 'api'];
    private const SURFACES  = ['studio', 'upload', 'wallet', 'profile', 'live', 'discover'];

    public function up(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        Schema::table('monetization_programs', function (Blueprint $table) {
            if (! Schema::hasColumn('monetization_programs', 'platforms')) {
                $table->json('platforms')->nullable()->after('visible_web');
            }
            if (! Schema::hasColumn('monetization_programs', 'surfaces')) {
                $table->json('surfaces')->nullable()->after('platforms');
            }
            // A programme can be scheduled to END as well as start - a seasonal
            // campaign should not need someone to remember to switch it off.
            if (! Schema::hasColumn('monetization_programs', 'ends_at')) {
                $table->timestamp('ends_at')->nullable()->after('starts_at');
            }
        });

        // Backfill from the flags that already exist, so nothing changes
        // behaviour the moment this runs.
        foreach (DB::table('monetization_programs')->get(['id', 'visible_app', 'visible_web']) as $row) {
            $platforms = [];
            if ($row->visible_app) { $platforms[] = 'android'; $platforms[] = 'ios'; }
            if ($row->visible_web) { $platforms[] = 'web'; $platforms[] = 'api'; }

            DB::table('monetization_programs')->where('id', $row->id)->update([
                'platforms' => json_encode($platforms),
                'surfaces'  => json_encode(self::SURFACES),
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        Schema::table('monetization_programs', function (Blueprint $table) {
            foreach (['platforms', 'surfaces', 'ends_at'] as $col) {
                if (Schema::hasColumn('monetization_programs', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
