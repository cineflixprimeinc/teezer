<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Removes the `SpaceDemoSeeder` rows (reserved id range 900001-900999, see
 * that seeder's own docblock - it has been deleted from the repo). Spaces is
 * a real, shipped feature now; the admin panel and app should only ever show
 * rooms a real user actually created. Cascades to `space_participants` the
 * same way AdminSpaceController::destroy() does.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('spaces')->whereBetween('id', [900001, 900999])->delete();
    }

    public function down(): void
    {
        // Deleting demo data is not reversible, nor should it be.
    }
};
