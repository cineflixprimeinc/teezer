<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `speaker_slots` used to allow null ("Unlimited"). The stage only holds so
 * many live mics at once, so unlimited was never actually enforced anywhere
 * (see SpaceModerationController::promote() / Space::joinRole()) - rather
 * than keep shipping a cap that does nothing, every room now always carries
 * a real number. Backfills any existing null rows to the same 100 the create
 * form and validation now treat as the max.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('spaces')->whereNull('speaker_slots')->update(['speaker_slots' => 100]);
    }

    public function down(): void
    {
        // Data backfill only - nothing to reverse.
    }
};
