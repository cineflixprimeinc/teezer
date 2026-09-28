<?php

namespace App\Database;

use Illuminate\Database\PostgresConnection;

/**
 * Laravel's base Connection::prepareBindings() unconditionally casts every PHP
 * bool binding to an int (0/1) before it reaches PDO - correct for MySQL/SQLite's
 * tinyint-backed booleans, but wrong for Postgres's native `boolean` columns, which
 * don't implicitly compare against an integer ("operator does not exist: boolean =
 * integer"). Leaving the raw PHP bool alone isn't enough either: with emulated
 * prepares (required here for PgBouncer transaction-pooling compatibility - see
 * config/database.php), PDO string-casts bindings before interpolating them into
 * the SQL text, and PHP's `(string) false` is `''`, which Postgres rejects as an
 * invalid boolean literal. Casting to the words 'true'/'false' is valid Postgres
 * boolean input in every binding mode.
 */
class PostgresBooleanConnection extends PostgresConnection
{
    public function prepareBindings(array $bindings)
    {
        $grammar = $this->getQueryGrammar();

        foreach ($bindings as $key => $value) {
            if ($value instanceof \DateTimeInterface) {
                $bindings[$key] = $value->format($grammar->getDateFormat());
            } elseif (is_bool($value)) {
                $bindings[$key] = $value ? 'true' : 'false';
            }
        }

        return $bindings;
    }
}
