<?php

namespace App\Console\Commands;

use App\Services\CounterBuffer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Drains Redis-buffered engagement deltas into Postgres.
 *
 * Scheduled every minute (routes/console.php). Each entity is one batched
 * UPDATE regardless of how many rows changed, so DB write load is bounded by
 * (distinct rows touched / minute), not by raw event volume.
 *
 * Allow-listed columns per entity - only these can ever be written by a flush.
 */
class FlushCounters extends Command
{
    protected $signature = 'counters:flush';
    protected $description = 'Flush Redis-buffered engagement counters into Postgres (batched).';

    /** entity => [table, [buffer-field => db-column]] */
    private const MAP = [
        'video' => ['videos', [
            'views_count'        => 'views_count',
            'likes_count'        => 'likes_count',
            'saves_count'        => 'saves_count',
            'shares_count'       => 'shares_count',
            'total_watch_seconds'=> 'total_watch_seconds',
        ]],
        'profile' => ['profiles', [
            'total_likes'     => 'total_likes',
            'total_followers' => 'total_followers',
            'total_following' => 'total_following',
            'profile_views'   => 'profile_views',
        ]],
    ];

    public function handle(): int
    {
        $total = 0;
        foreach (self::MAP as $entity => [$table, $columns]) {
            try {
                $n = CounterBuffer::flush($entity, $table, $columns);
                $total += $n;
                if ($n > 0) {
                    $this->info("flushed {$entity}: {$n} rows");
                }
            } catch (\Throwable $e) {
                Log::error('counters:flush failed', ['entity' => $entity, 'err' => $e->getMessage()]);
                $this->error("{$entity}: {$e->getMessage()}");
            }
        }
        $this->info("counters:flush done ({$total} rows total)");
        return self::SUCCESS;
    }
}
