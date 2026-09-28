<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Log;

/**
 * Redis-buffered engagement counters.
 *
 * Hot counters (video views, likes, …) are extremely write-heavy: every play
 * issues an `UPDATE videos SET views_count = views_count + 1` on the *same* row.
 * Under load that serialises on the row lock and churns dead tuples (Postgres
 * MVCC writes a new row version per UPDATE → autovacuum pressure + IO).
 *
 * Instead we accumulate deltas in Redis (`HINCRBY`, O(1), no row lock, no WAL)
 * and a scheduled `counters:flush` drains them into Postgres in ONE batched
 * UPDATE per table per minute. 10k views/min → 1 UPDATE/row instead of 10k.
 *
 * Source of truth for READS stays the existing `*_count` columns (so nothing
 * in the read path changes); they just lag by ≤ the flush interval, which is
 * fine for social counters. `current()` adds the live buffered delta back for
 * the rare response that must show an exact, just-incremented value.
 *
 * Buffer lives on the `default` Redis connection (db0, persistent - NOT the
 * cache db, which can evict under maxmemory and would silently drop counts).
 */
class CounterBuffer
{
    /** Redis connection name - must be a persistent, non-evicting db. */
    private const CONN = 'default';

    private static function conn()
    {
        return Redis::connection(self::CONN);
    }

    private static function hashKey(string $entity, int $id): string
    {
        return "cntr:{$entity}:{$id}";
    }

    private static function dirtyKey(string $entity): string
    {
        return "cntr:dirty:{$entity}";
    }

    /**
     * Buffer a delta for entity#id.field. Pass a negative delta to decrement.
     * O(1), lock-free. Falls back silently to a direct DB update if Redis is
     * unavailable so counting never breaks.
     */
    public static function add(string $entity, int $id, string $field, int $delta = 1): void
    {
        if ($delta === 0) {
            return;
        }
        try {
            $c = self::conn();
            $c->hincrby(self::hashKey($entity, $id), $field, $delta);
            $c->sadd(self::dirtyKey($entity), $id);
        } catch (\Throwable $e) {
            Log::warning('CounterBuffer.add fallback to DB', ['entity' => $entity, 'id' => $id, 'field' => $field, 'err' => $e->getMessage()]);
            self::directDbApply($entity, $id, [$field => $delta]);
        }
    }

    /**
     * DB column value + currently-buffered delta. Use only where a response
     * must reflect an increment that hasn't flushed yet (e.g. the like reply).
     */
    public static function current(string $entity, int $id, string $field, int $dbValue): int
    {
        try {
            $buffered = (int) (self::conn()->hget(self::hashKey($entity, $id), $field) ?? 0);
            return max(0, $dbValue + $buffered);
        } catch (\Throwable $e) {
            return $dbValue;
        }
    }

    /**
     * Drain all buffered deltas for an entity and apply them to $table in one
     * batched UPDATE. $columns is the allow-list of buffer-field → DB-column
     * (identity map here; present so unknown fields can never reach SQL).
     *
     * Returns the number of rows updated. Idempotent and safe to run on a
     * schedule; concurrent adds during a flush are preserved (snapshot via
     * atomic RENAME, re-flagged for the next run).
     */
    public static function flush(string $entity, string $table, array $columns): int
    {
        $c = self::conn();
        $ids = $c->smembers(self::dirtyKey($entity)) ?: [];
        if (!$ids) {
            return 0;
        }

        $rows = [];               // id => [column => delta]
        foreach ($ids as $id) {
            $id = (int) $id;
            // Remove the dirty flag FIRST: a concurrent add after this re-adds
            // the id (re-processed next run) AND its delta is still captured by
            // the RENAME below - so nothing is lost and nothing double-counts.
            $c->srem(self::dirtyKey($entity), $id);

            $tmp = self::hashKey($entity, $id) . ':flush' . substr(md5((string) $id . microtime()), 0, 8);
            try {
                $c->rename(self::hashKey($entity, $id), $tmp); // atomic snapshot; throws if key gone
            } catch (\Throwable $e) {
                continue; // hash was empty/already drained
            }
            $deltas = $c->hgetall($tmp) ?: [];
            $c->del($tmp);
            if ($deltas) {
                $rows[$id] = $deltas;
            }
        }
        if (!$rows) {
            return 0;
        }

        try {
            return self::applyBatch($table, $columns, $rows);
        } catch (\Throwable $e) {
            // The snapshot is already out of Redis; if the UPDATE failed, put the
            // deltas BACK so the next flush retries them - a flush error must
            // never lose counts.
            $c = self::conn();
            foreach ($rows as $id => $deltas) {
                foreach ($deltas as $field => $delta) {
                    if ((int) $delta !== 0) {
                        $c->hincrby(self::hashKey($entity, (int) $id), $field, (int) $delta);
                    }
                }
                $c->sadd(self::dirtyKey($entity), (int) $id);
            }
            Log::error('CounterBuffer.flush re-buffered after applyBatch failure', ['table' => $table, 'err' => $e->getMessage()]);
            throw $e;
        }
    }

    /**
     * ONE UPDATE … FROM (VALUES …) for the whole batch. Clamps each counter at
     * 0 with GREATEST so a decrement can never drive it negative.
     */
    private static function applyBatch(string $table, array $columns, array $rows): int
    {
        // Stable column order; only allow-listed columns reach the SQL.
        $cols = array_values(array_filter($columns, fn ($col) => is_string($col)));
        $cols = array_values(array_unique($cols));

        $valueTuples = [];
        $bindings    = [];
        foreach ($rows as $id => $deltas) {
            $placeholders = ['?'];
            $bindings[]   = $id;
            foreach ($cols as $col) {
                $placeholders[] = '?';
                $bindings[]     = (int) ($deltas[$col] ?? 0);
            }
            $valueTuples[] = '(' . implode(',', $placeholders) . ')';
        }

        // Cast the d.* columns explicitly: PDO binds params as text, so without
        // the ::bigint cast "videos.views_count (bigint) + $param (text)" has no
        // operator. bigint result auto-casts back to int4 columns on assignment.
        $setClauses = [];
        foreach ($cols as $col) {
            $setClauses[] = "\"{$col}\" = GREATEST(0::bigint, t.\"{$col}\" + d.\"{$col}\"::bigint)";
        }

        $colList = implode(',', array_map(fn ($c) => "\"{$c}\"", $cols));
        $sql = "UPDATE {$table} AS t SET " . implode(', ', $setClauses)
             . " FROM (VALUES " . implode(',', $valueTuples) . ") AS d(id,{$colList})"
             . " WHERE t.id = d.id::bigint";

        return DB::update($sql, $bindings);
    }

    /** Redis-down fallback: apply a single delta straight to the row. */
    private static function directDbApply(string $entity, int $id, array $deltas): void
    {
        $table = match ($entity) {
            'video'   => 'videos',
            'profile' => 'profiles',
            'comment' => 'video_comments',
            default   => null,
        };
        if (!$table) {
            return;
        }
        try {
            self::applyBatch($table, array_keys($deltas), [$id => $deltas]);
        } catch (\Throwable $e) {
            Log::error('CounterBuffer.directDbApply failed', ['err' => $e->getMessage()]);
        }
    }
}
