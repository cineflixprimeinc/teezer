<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Convert the json columns queried with the PostgreSQL @> containment operator
 * to jsonb. @> (which replaces MySQL JSON_CONTAINS in the app-layer rewrites)
 * only works on jsonb, not json. These three columns are the exact targets:
 *
 *   - users.categories                     ← ProfileSuggestionService: u.categories @> ?::jsonb
 *   - users.interests                      ← ProfileSuggestionService: u.interests @> ?::jsonb
 *   - direct_messages.deleted_for_user_ids ← MessageController: NOT (deleted_for_user_ids @> ?::jsonb)
 *
 * MySQL has no jsonb type and JSON_CONTAINS works on its native json, so this
 * migration is a no-op on MySQL (driver-branched).
 */
return new class extends Migration
{
    /** @var array<int,array{0:string,1:string}> [table, column] pairs */
    private array $columns = [
        ['users', 'categories'],
        ['users', 'interests'],
        ['direct_messages', 'deleted_for_user_ids'],
    ];

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return; // MySQL keeps native json; JSON_CONTAINS works there unchanged.
        }

        foreach ($this->columns as [$table, $column]) {
            if (Schema::hasColumn($table, $column)) {
                // USING handles the json→jsonb cast; NULLs pass through unchanged.
                DB::statement("ALTER TABLE {$table} ALTER COLUMN {$column} TYPE jsonb USING {$column}::jsonb");
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        foreach ($this->columns as [$table, $column]) {
            if (Schema::hasColumn($table, $column)) {
                DB::statement("ALTER TABLE {$table} ALTER COLUMN {$column} TYPE json USING {$column}::json");
            }
        }
    }
};
