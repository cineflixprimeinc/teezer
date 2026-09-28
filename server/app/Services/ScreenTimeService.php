<?php

namespace App\Services;

use App\Models\ScreenTimeDaily;
use App\Models\ScreenTimeLimit;
use App\Models\ScreenTimeSession;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

/**
 * Screen Time - tracks ONLY active in-app usage. Client heartbeats add active
 * seconds into a per-(user,day) Redis buffer (cheap, high-frequency); the
 * screen-time:flush command aggregates the buffer into Postgres every 5 minutes
 * (durable). Reads merge the persisted row with the un-flushed Redis delta so
 * they're always current. Live totals are pushed to the user's other devices
 * over RealtimeBus (Socket.IO).
 */
class ScreenTimeService
{
    public const ACTIVITIES = [
        'videos', 'live', 'audio', 'messages', 'profile',
        'upload', 'search', 'notifications', 'settings', 'other',
    ];

    private const DIRTY_SET = 'screentime:dirty';

    private function deltaKey(int $userId, string $date): string
    {
        return "screentime:delta:{$userId}:{$date}";
    }

    /* ── Write path ──────────────────────────────────────────────────────── */

    /** Buffer an active-usage delta reported by a client heartbeat. */
    public function heartbeat(User $user, int $seconds, array $breakdown, int $longest = 0, ?string $device = null): int
    {
        $seconds = max(0, min($seconds, 3600)); // one heartbeat can't legitimately exceed an hour
        $date = Carbon::now()->toDateString();
        $key = $this->deltaKey($user->id, $date);

        if ($seconds > 0) {
            Redis::hincrby($key, 'total', $seconds);
            foreach (self::ACTIVITIES as $a) {
                $v = (int) ($breakdown[$a] ?? 0);
                if ($v > 0) Redis::hincrby($key, $a, min($v, $seconds));
            }
            if ($longest > 0 && $longest > (int) (Redis::hget($key, 'longest') ?: 0)) {
                Redis::hset($key, 'longest', $longest);
            }
            if ($device) Redis::hset($key, 'device', substr($device, 0, 20));
            Redis::expire($key, 60 * 60 * 50); // ~2 days safety net
            Redis::sadd(self::DIRTY_SET, "{$user->id}:{$date}");
        }

        $total = $this->todayTotal($user, $date);

        try {
            RealtimeBus::publish([RealtimeBus::userRoom($user->id)], 'screentime.update', [
                'date'          => $date,
                'total_seconds' => $total,
            ]);
        } catch (\Throwable $e) { /* realtime is best-effort */ }

        return $total;
    }

    /* ── Read path ───────────────────────────────────────────────────────── */

    private function deltaHash(int $userId, string $date): array
    {
        $raw = Redis::hgetall($this->deltaKey($userId, $date)) ?: [];
        $out = [];
        foreach ($raw as $k => $v) $out[$k] = is_numeric($v) ? (int) $v : $v;
        return $out;
    }

    private function persistedSeconds(int $userId, string $date): int
    {
        return (int) ScreenTimeDaily::where('user_id', $userId)->whereDate('date', $date)->value('total_seconds');
    }

    public function todayTotal(User $user, ?string $date = null): int
    {
        $date = $date ?: Carbon::now()->toDateString();
        return $this->persistedSeconds($user->id, $date) + (int) ($this->deltaHash($user->id, $date)['total'] ?? 0);
    }

    public function today(User $user): array
    {
        $date = Carbon::now()->toDateString();
        $row = ScreenTimeDaily::where('user_id', $user->id)->whereDate('date', $date)->first();
        $delta = $this->deltaHash($user->id, $date);

        $breakdown = [];
        $base = $row?->breakdown ?? [];
        foreach (self::ACTIVITIES as $a) {
            $breakdown[$a] = (int) ($base[$a] ?? 0) + (int) ($delta[$a] ?? 0);
        }

        return [
            'date'                    => $date,
            'total_seconds'           => (int) ($row?->total_seconds ?? 0) + (int) ($delta['total'] ?? 0),
            'breakdown'               => $breakdown,
            'longest_session_seconds' => max((int) ($row?->longest_session_seconds ?? 0), (int) ($delta['longest'] ?? 0)),
            'yesterday_seconds'       => $this->persistedSeconds($user->id, Carbon::now()->subDay()->toDateString()),
        ];
    }

    public function summary(User $user): array
    {
        $today = Carbon::now()->toDateString();
        $delta = (int) ($this->deltaHash($user->id, $today)['total'] ?? 0);

        $week = (int) ScreenTimeDaily::where('user_id', $user->id)
            ->whereBetween('date', [Carbon::now()->subDays(6)->toDateString(), $today])->sum('total_seconds') + $delta;
        $month = (int) ScreenTimeDaily::where('user_id', $user->id)
            ->whereBetween('date', [Carbon::now()->subDays(29)->toDateString(), $today])->sum('total_seconds') + $delta;

        return [
            'today_seconds'           => $this->todayTotal($user, $today),
            'yesterday_seconds'       => $this->persistedSeconds($user->id, Carbon::now()->subDay()->toDateString()),
            'week_seconds'            => $week,
            'month_seconds'           => $month,
            'avg_daily_seconds'       => (int) round($week / 7),
            'longest_session_seconds' => (int) ScreenTimeDaily::where('user_id', $user->id)->max('longest_session_seconds'),
        ];
    }

    public function graph(User $user, int $range): array
    {
        $range = in_array($range, [7, 30, 90], true) ? $range : 7;
        $rows = ScreenTimeDaily::where('user_id', $user->id)
            ->whereDate('date', '>=', Carbon::now()->subDays($range - 1)->toDateString())
            ->pluck('total_seconds', 'date');
        $delta = (int) ($this->deltaHash($user->id, Carbon::now()->toDateString())['total'] ?? 0);

        $out = [];
        for ($i = $range - 1; $i >= 0; $i--) {
            $d = Carbon::now()->subDays($i)->toDateString();
            $secs = (int) ($rows[$d] ?? 0) + ($i === 0 ? $delta : 0);
            $out[] = ['date' => $d, 'total_seconds' => $secs];
        }
        return $out;
    }

    /* ── Limits ──────────────────────────────────────────────────────────── */

    public function limits(User $user): array
    {
        return $this->limitPayload(ScreenTimeLimit::firstOrCreate(['user_id' => $user->id]));
    }

    public function updateLimits(User $user, array $data): array
    {
        $row = ScreenTimeLimit::firstOrCreate(['user_id' => $user->id]);
        $row->fill($data)->save();
        return $this->limitPayload($row);
    }

    private function limitPayload(ScreenTimeLimit $r): array
    {
        return [
            'goal_minutes'                  => (int) $r->goal_minutes,
            'daily_limit_enabled'           => (bool) $r->daily_limit_enabled,
            'daily_limit_minutes'           => (int) $r->daily_limit_minutes,
            'break_enabled'                 => (bool) $r->break_enabled,
            'break_interval_minutes'        => (int) $r->break_interval_minutes,
            'bedtime_enabled'               => (bool) $r->bedtime_enabled,
            'bedtime_start'                 => (string) $r->bedtime_start,
            'bedtime_end'                   => (string) $r->bedtime_end,
            'bedtime_disable_feed'          => (bool) $r->bedtime_disable_feed,
            'bedtime_disable_live'          => (bool) $r->bedtime_disable_live,
            'bedtime_disable_audio'         => (bool) $r->bedtime_disable_audio,
            'bedtime_disable_upload'        => (bool) $r->bedtime_disable_upload,
            'bedtime_mute_notifications'    => (bool) $r->bedtime_mute_notifications,
            'focus_hide_notifications'      => (bool) $r->focus_hide_notifications,
            'focus_disable_infinite_scroll' => (bool) $r->focus_disable_infinite_scroll,
            'focus_disable_autoplay'        => (bool) $r->focus_disable_autoplay,
            'focus_hide_recommended'        => (bool) $r->focus_hide_recommended,
            'focus_pause_messages'          => (bool) $r->focus_pause_messages,
        ];
    }

    /* ── Reports ─────────────────────────────────────────────────────────── */

    public function weekly(User $user): array
    {
        $today = Carbon::now()->toDateString();
        $rows = ScreenTimeDaily::where('user_id', $user->id)
            ->whereBetween('date', [Carbon::now()->subDays(6)->toDateString(), $today])->get();
        $sum = (int) $rows->sum('total_seconds');
        $most = $rows->where('total_seconds', '>', 0)->sortByDesc('total_seconds')->first();
        $least = $rows->where('total_seconds', '>', 0)->sortBy('total_seconds')->first();

        $agg = [];
        foreach ($rows as $r) foreach (($r->breakdown ?? []) as $k => $v) $agg[$k] = ($agg[$k] ?? 0) + (int) $v;
        arsort($agg);
        $fav = array_key_first($agg);

        $prev = (int) ScreenTimeDaily::where('user_id', $user->id)
            ->whereBetween('date', [Carbon::now()->subDays(13)->toDateString(), Carbon::now()->subDays(7)->toDateString()])->sum('total_seconds');

        return [
            'avg_daily_seconds'       => (int) round($sum / 7),
            'most_active_day'         => $most?->date?->toDateString(),
            'least_active_day'        => $least?->date?->toDateString(),
            'longest_session_seconds' => (int) $rows->max('longest_session_seconds'),
            'favorite_activity'       => $fav,
            'trend_pct'               => $prev > 0 ? (int) round((($sum - $prev) / $prev) * 100) : 0,
        ];
    }

    public function monthly(User $user): array
    {
        $today = Carbon::now()->toDateString();
        $total = (int) ScreenTimeDaily::where('user_id', $user->id)
            ->whereBetween('date', [Carbon::now()->subDays(29)->toDateString(), $today])->sum('total_seconds');

        $weekly = [];
        for ($w = 3; $w >= 0; $w--) {
            $ws = Carbon::now()->subDays(($w * 7) + 6)->toDateString();
            $we = Carbon::now()->subDays($w * 7)->toDateString();
            $weekly[] = [
                'week_start'    => $ws,
                'total_seconds' => (int) ScreenTimeDaily::where('user_id', $user->id)->whereBetween('date', [$ws, $we])->sum('total_seconds'),
            ];
        }

        $prev = (int) ScreenTimeDaily::where('user_id', $user->id)
            ->whereBetween('date', [Carbon::now()->subDays(59)->toDateString(), Carbon::now()->subDays(30)->toDateString()])->sum('total_seconds');

        return [
            'total_seconds'     => $total,
            'avg_daily_seconds' => (int) round($total / 30),
            'weekly'            => $weekly,
            'trend_pct'         => $prev > 0 ? (int) round((($total - $prev) / $prev) * 100) : 0,
        ];
    }

    private function dominant(array $breakdown): ?string
    {
        $best = null; $bestV = 0;
        foreach (self::ACTIVITIES as $a) {
            $v = (int) ($breakdown[$a] ?? 0);
            if ($v > $bestV) { $bestV = $v; $best = $a; }
        }
        return $best;
    }

    /* ── Aggregation (screen-time:flush, every 5 minutes) ────────────────── */

    public function flush(): int
    {
        $members = Redis::smembers(self::DIRTY_SET) ?: [];
        $count = 0;

        foreach ($members as $member) {
            [$userId, $date] = array_pad(explode(':', (string) $member, 2), 2, null);
            $userId = (int) $userId;
            if (!$userId || !$date) { Redis::srem(self::DIRTY_SET, $member); continue; }

            $delta = $this->deltaHash($userId, $date);
            if (empty($delta) || (int) ($delta['total'] ?? 0) <= 0) {
                Redis::del($this->deltaKey($userId, $date));
                Redis::srem(self::DIRTY_SET, $member);
                continue;
            }

            DB::transaction(function () use ($userId, $date, $delta) {
                $row = ScreenTimeDaily::firstOrNew(['user_id' => $userId, 'date' => $date]);
                $row->total_seconds = (int) $row->total_seconds + (int) ($delta['total'] ?? 0);
                $bd = $row->breakdown ?? [];
                foreach (self::ACTIVITIES as $a) $bd[$a] = (int) ($bd[$a] ?? 0) + (int) ($delta[$a] ?? 0);
                $row->breakdown = $bd;
                $row->longest_session_seconds = max((int) $row->longest_session_seconds, (int) ($delta['longest'] ?? 0));
                $row->sessions_count = (int) $row->sessions_count + 1;
                $row->save();

                ScreenTimeSession::create([
                    'user_id'          => $userId,
                    'started_at'       => Carbon::parse($date)->isToday() ? Carbon::now()->subSeconds((int) ($delta['total'] ?? 0)) : Carbon::parse($date),
                    'ended_at'         => Carbon::parse($date)->isToday() ? Carbon::now() : Carbon::parse($date)->endOfDay(),
                    'duration_seconds' => (int) ($delta['total'] ?? 0),
                    'activity'         => $this->dominant($delta),
                    'device'           => is_string($delta['device'] ?? null) ? $delta['device'] : null,
                ]);
            });

            Redis::del($this->deltaKey($userId, $date));
            Redis::srem(self::DIRTY_SET, $member);
            $count++;
        }

        return $count;
    }
}
