<?php
/**
 * Align the PostgreSQL target schema to the MySQL source by ADDING every
 * source-only column (mapped type, nullable). Needed because production MySQL
 * drifted from the Laravel migrations (extra columns added out-of-band, e.g.
 * user_moderation_settings.block_live_until, users.signup_ip).
 *
 * Run this AFTER building the PG schema (migrate --database=pgsql + applying
 * chat-server/schema.pgsql.sql) and BEFORE `php artisan db:transfer-to-pgsql`,
 * whenever the PG schema is (re)built fresh.
 *
 *   cd server && php scripts/pg_sync_columns.php
 *
 * Requires both the 'mysql' (source) and 'pgsql' (target) connections to be
 * configured in .env (DB_* and DB_PGSQL_*).
 */
$base = dirname(__DIR__);
require $base . '/vendor/autoload.php';
$app = require $base . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$src = \Illuminate\Support\Facades\DB::connection('mysql');
$dst = \Illuminate\Support\Facades\DB::connection('pgsql');
$mysqlDb = $src->getDatabaseName();

function pgType($dt, $ct, $len) {
    $dt = strtolower($dt);
    $ct = strtolower((string) $ct);
    if ($dt === 'tinyint')                                            return strpos($ct, 'tinyint(1)') !== false ? 'boolean' : 'smallint';
    if (in_array($dt, ['smallint', 'mediumint', 'int', 'integer', 'year'])) return 'integer';
    if ($dt === 'bigint')                                             return 'bigint';
    if (in_array($dt, ['decimal', 'numeric']))                       return 'numeric';
    if ($dt === 'float')                                             return 'real';
    if ($dt === 'double')                                            return 'double precision';
    if (in_array($dt, ['char', 'varchar']))                         return $len ? ('varchar(' . $len . ')') : 'varchar(255)';
    if (in_array($dt, ['tinytext', 'text', 'mediumtext', 'longtext'])) return 'text';
    if ($dt === 'date')                                              return 'date';
    if (in_array($dt, ['datetime', 'timestamp']))                   return 'timestamp';
    if ($dt === 'time')                                             return 'time';
    if ($dt === 'json')                                             return 'jsonb';
    if (in_array($dt, ['enum', 'set']))                             return 'varchar(255)';
    if (in_array($dt, ['binary', 'varbinary', 'blob', 'tinyblob', 'mediumblob', 'longblob'])) return 'bytea';
    return 'text';
}

$tables = collect($dst->select(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
))->pluck('table_name');

$added = 0;
$report = [];
foreach ($tables as $t) {
    if (! \Illuminate\Support\Facades\Schema::connection('mysql')->hasTable($t)) {
        continue;
    }
    $pgcols = collect($dst->select(
        "select column_name from information_schema.columns where table_schema='public' and table_name=?",
        [$t]
    ))->pluck('column_name')->all();
    $mycols = $src->select(
        "select COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,CHARACTER_MAXIMUM_LENGTH from information_schema.COLUMNS where TABLE_SCHEMA=? and TABLE_NAME=?",
        [$mysqlDb, $t]
    );
    foreach ($mycols as $c) {
        $name = $c->COLUMN_NAME;
        if (in_array($name, $pgcols)) {
            continue;
        }
        $type = pgType($c->DATA_TYPE, $c->COLUMN_TYPE, $c->CHARACTER_MAXIMUM_LENGTH);
        $dst->statement('ALTER TABLE "' . $t . '" ADD COLUMN IF NOT EXISTS "' . $name . '" ' . $type);
        $report[] = $t . '.' . $name . ' ' . $type;
        $added++;
    }
}

echo "Added {$added} missing columns:\n" . implode("\n", $report) . "\n";
