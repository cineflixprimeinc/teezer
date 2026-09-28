<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Copy all data from a MySQL connection into a PostgreSQL connection.
 *
 * Handles the things pgloader would: tinyint(1) -> boolean coercion, json text
 * -> jsonb, FK-safe load (session_replication_role = replica), chunked reads,
 * identity-sequence reset, and a row-count parity gate that fails the command
 * on any mismatch.
 *
 * Designed for the MySQL -> Postgres cutover: restore the production dump into a
 * staging MySQL, point the `mysql` connection at it, and run this against the
 * (already migrated, empty) `pgsql` target. See docs/postgres-cutover-runbook.md.
 *
 * Usage:
 *   php artisan db:transfer-to-pgsql                 # full transfer + parity
 *   php artisan db:transfer-to-pgsql --dry-run       # parity check only, no writes
 *   php artisan db:transfer-to-pgsql --from=mysql --to=pgsql --chunk=2000
 */
class TransferToPgsql extends Command
{
    protected $signature = 'db:transfer-to-pgsql
        {--from=mysql : Source connection name (MySQL)}
        {--to=pgsql : Target connection name (PostgreSQL)}
        {--chunk=1000 : Rows per chunk when reading tables that have an id column}
        {--dry-run : Only run the row-count parity check; do not truncate, copy, or reset sequences}';

    protected $description = 'Copy all table data from a MySQL connection into a PostgreSQL connection, then verify row-count parity.';

    /** Tables never transferred (framework migration ledger). */
    private array $skip = ['migrations'];

    public function handle(): int
    {
        $from  = (string) $this->option('from');
        $to    = (string) $this->option('to');
        $chunk = max(1, (int) $this->option('chunk'));
        $dry   = (bool) $this->option('dry-run');

        $src = DB::connection($from);
        $dst = DB::connection($to);

        if ($dst->getDriverName() !== 'pgsql') {
            $this->error("Target connection [{$to}] is not pgsql (got {$dst->getDriverName()}). Aborting.");
            return self::FAILURE;
        }

        // Target table list (Postgres public schema), minus skipped tables.
        $tables = collect($dst->select(
            "select table_name from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
        ))->pluck('table_name')
          ->reject(fn ($t) => in_array($t, $this->skip, true))
          ->values();

        $this->info(($dry ? '[DRY RUN] ' : '')."Source=[{$from}]  Target=[{$to}]  tables=".$tables->count()
            .'  (skipping: '.implode(',', $this->skip).')');

        // Data-safety guard: every SOURCE table must exist on the TARGET, otherwise
        // its data would be silently skipped (the copy iterates target tables). This
        // catches non-Laravel tables (e.g. the chat_* set) whose PG schema wasn't
        // created - apply chat-server/schema.pgsql.sql before transferring.
        $targetSet = $tables->all();
        $missingInTarget = collect(Schema::connection($from)->getTableListing())
            ->map(fn ($t) => str_contains($t, '.') ? substr($t, strrpos($t, '.') + 1) : $t)
            ->reject(fn ($t) => in_array($t, $this->skip, true))
            ->reject(fn ($t) => in_array($t, $targetSet, true))
            ->values();
        if ($missingInTarget->isNotEmpty()) {
            $this->error('ABORT - source tables missing on target (their data would be lost): '
                .$missingInTarget->implode(', '));
            $this->error('Create their schema on the target first (e.g. apply chat-server/schema.pgsql.sql), then re-run.');
            return self::FAILURE;
        }

        if (! $dry) {
            $this->runTransfer($src, $dst, $tables, $chunk);
        } else {
            $this->warn('Dry run: no truncate / copy / sequence reset performed. Parity check only.');
        }

        return $this->parity($src, $dst, $tables, $from, $to);
    }

    private function runTransfer($src, $dst, $tables, int $chunk): void
    {
        // Boolean columns per target table, so we can coerce 0/1/"0"/"1" -> bool.
        $boolCols = [];
        foreach ($dst->select(
            "select table_name, column_name from information_schema.columns
             where table_schema = 'public' and data_type = 'boolean'") as $r) {
            $boolCols[$r->table_name][$r->column_name] = true;
        }

        $dst->statement('SET session_replication_role = replica'); // FK + identity triggers off during load

        try {
            // Truncate ALL targets up front. Laravel's pgsql truncate uses CASCADE, so
            // a per-table truncate mid-loop could let a later parent (e.g. users) wipe
            // already-loaded child rows (profiles, cms_pages). One pass first avoids that.
            $this->line('Truncating all target tables (cascade-safe, up front)...');
            foreach ($tables as $t) {
                $dst->table($t)->truncate();
            }

            $bar = $this->output->createProgressBar($tables->count());
            $bar->start();

            foreach ($tables as $t) {
                if (Schema::connection($src->getName())->hasTable($t)) {
                    $bset  = $boolCols[$t] ?? [];
                    $hasId = Schema::connection($dst->getName())->hasColumn($t, 'id');

                    $insert = function (array $rows) use ($dst, $t, $bset): void {
                        if (! $rows) {
                            return;
                        }
                        $batch = [];
                        foreach ($rows as $row) {
                            $a = (array) $row;
                            foreach ($bset as $col => $_) {
                                if (array_key_exists($col, $a) && $a[$col] !== null) {
                                    $a[$col] = (bool) $a[$col]; // tinyint(1)/"0"/"1" -> bool
                                }
                            }
                            $batch[] = $a;
                        }
                        foreach (array_chunk($batch, 500) as $c) {
                            $dst->table($t)->insert($c);
                        }
                    };

                    if ($hasId) {
                        $src->table($t)->orderBy('id')->chunkById($chunk, fn ($rows) => $insert($rows->all()));
                    } else {
                        $insert($src->table($t)->get()->all());
                    }
                }
                $bar->advance();
            }
            $bar->finish();
            $this->newLine(2);
        } finally {
            $dst->statement('SET session_replication_role = DEFAULT');
        }

        // Reset identity sequences to MAX(id)+1 for every table with an id sequence.
        $this->line('Resetting sequences...');
        $fixed = 0;
        foreach ($tables as $t) {
            if (! Schema::connection($dst->getName())->hasColumn($t, 'id')) {
                continue;
            }
            $seq = $dst->selectOne("select pg_get_serial_sequence(?, 'id') as s", [$t])->s ?? null;
            if (! $seq) {
                continue;
            }
            $dst->statement("select setval('".$seq."', coalesce((select max(id) from \"$t\"), 0) + 1, false)");
            $fixed++;
        }
        $this->line("Sequences reset: {$fixed}");
    }

    private function parity($src, $dst, $tables, string $from, string $to): int
    {
        $this->newLine();
        $this->info('Row-count parity:');

        $rows = [];
        $mismatch = 0;
        $totalTarget = 0;

        foreach ($tables as $t) {
            $m = Schema::connection($from)->hasTable($t) ? (int) $src->table($t)->count() : 0;
            $p = (int) $dst->table($t)->count();
            $totalTarget += $p;
            $ok = $m === $p;
            if (! $ok) {
                $mismatch++;
            }
            if ($m > 0 || $p > 0) {
                $rows[] = [$t, $m, $p, $ok ? 'OK' : 'MISMATCH'];
            }
        }

        $this->table(["table ({$from})", 'source', "target ({$to})", 'status'], $rows);
        $this->line("Tables checked: {$tables->count()}   rows in target: {$totalTarget}   mismatches: {$mismatch}");

        if ($mismatch > 0) {
            $this->error("Parity FAILED: {$mismatch} table(s) do not match.");
            return self::FAILURE;
        }

        $this->info('Parity OK: all tables match.');
        return self::SUCCESS;
    }
}
