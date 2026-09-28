<?php

namespace App\Services\Studio;

use Illuminate\Support\Facades\DB;

/**
 * The "AI Insights" card.
 *
 * Every insight here is COMPUTED from this creator's own data. The brief listed
 * examples like "videos shorter than 24 seconds get 31% higher completion" - those
 * are illustrations of the shape, not values to hardcode. A card that always says
 * "31%" regardless of the truth is worse than no card: it teaches creators to
 * ignore it, and the first time someone checks the maths it destroys trust in every
 * other number on the page.
 *
 * So each generator returns null when the data does not support a claim. Thin data
 * yields fewer insights, not invented ones. A creator with four videos genuinely
 * has nothing statistically interesting to say about their posting schedule, and
 * saying so honestly (by staying quiet) is the correct behavior.
 */
class StudioInsightGenerator
{
    /** Below this many views, any "X performs better" claim is noise, not signal. */
    private const MIN_VIEWS_FOR_COMPARISON = 30;

    /** Below this, a single video's numbers dominate the whole comparison. */
    private const MIN_VIDEOS_FOR_COMPARISON = 4;

    public function __construct(private readonly StudioAnalyticsQueries $queries) {}

    /**
     * @return array<int, array{type:string, icon:string, text:string}>
     */
    public function generate(int $creatorId, string $start, string $end, string $timezone): array
    {
        $insights = array_filter([
            $this->peakActivityWindow($creatorId, $start, $end, $timezone),
            $this->shortVideoCompletion($creatorId, $start, $end),
            $this->dominantCountry($creatorId, $start, $end),
            $this->bestDayOfWeek($creatorId, $start, $end, $timezone),
            $this->musicLift($creatorId, $start, $end),
        ]);

        return array_values($insights);
    }

    /** "Your audience is most active between 7 PM and 9 PM." */
    private function peakActivityWindow(int $creatorId, string $start, string $end, string $tz): ?array
    {
        $cells = $this->queries->bestTimeHeatmap($creatorId, $start, $end, $tz);
        if ($cells === []) {
            return null;
        }

        $total = array_sum(array_column($cells, 'views'));
        if ($total < self::MIN_VIEWS_FOR_COMPARISON) {
            return null;
        }

        // Collapse to hour-of-day across all days, then take the busiest hour.
        $byHour = [];
        foreach ($cells as $c) {
            $byHour[(int) $c['hour']] = ($byHour[(int) $c['hour']] ?? 0) + (int) $c['views'];
        }

        arsort($byHour);
        $peakHour  = (int) array_key_first($byHour);
        $peakViews = reset($byHour);

        return [
            'type' => 'peak_time',
            'icon' => 'clock',
            'text' => sprintf(
                'Your audience is most active between %s and %s (%d%% of all views).',
                $this->hourLabel($peakHour),
                $this->hourLabel($peakHour + 2),
                (int) round(($peakViews / $total) * 100),
            ),
        ];
    }

    /**
     * "Videos shorter than N seconds receive X% higher completion."
     *
     * Splits this creator's videos at the median duration and compares mean
     * completion between the halves. Returns null unless there are enough videos on
     * BOTH sides for the comparison to mean anything, and unless the gap is large
     * enough to be worth acting on.
     */
    private function shortVideoCompletion(int $creatorId, string $start, string $end): ?array
    {
        $rows = $this->queries->topVideos($creatorId, $start, $end, 100);
        if (count($rows) < self::MIN_VIDEOS_FOR_COMPARISON) {
            return null;
        }

        $durations = DB::table('videos')
            ->whereIn('id', array_column($rows, 'video_id'))
            ->pluck('duration', 'id');

        $withDuration = [];
        foreach ($rows as $r) {
            $d = (int) ($durations[$r['video_id']] ?? 0);
            if ($d > 0 && (float) $r['completion'] > 0) {
                $withDuration[] = ['duration' => $d, 'completion' => (float) $r['completion']];
            }
        }

        if (count($withDuration) < self::MIN_VIDEOS_FOR_COMPARISON) {
            return null;
        }

        $sorted = collect($withDuration)->sortBy('duration')->values();
        $median = (int) $sorted->median('duration');

        $short = $sorted->filter(fn ($v) => $v['duration'] <= $median);
        $long  = $sorted->filter(fn ($v) => $v['duration'] > $median);

        if ($short->isEmpty() || $long->isEmpty()) {
            return null; // every video the same length - nothing to compare
        }

        $shortAvg = $short->avg('completion');
        $longAvg  = $long->avg('completion');

        if ($longAvg <= 0) {
            return null;
        }

        $lift = round((($shortAvg - $longAvg) / $longAvg) * 100);

        // A sub-10% gap on this little data is noise. Don't dress it up as a finding.
        if (abs($lift) < 10) {
            return null;
        }

        return [
            'type' => 'duration',
            'icon' => 'timer',
            'text' => $lift > 0
                ? sprintf('Videos under %ds get %d%% higher completion than your longer ones.', $median, $lift)
                : sprintf('Videos over %ds get %d%% higher completion than your shorter ones.', $median, abs($lift)),
        ];
    }

    /** "Your audience is mostly from Nepal." */
    private function dominantCountry(int $creatorId, string $start, string $end): ?array
    {
        $countries = $this->queries->audience($creatorId, $start, $end, 'country', 3);
        if ($countries === []) {
            return null;
        }

        $top = $countries[0];
        if ((float) $top['pct'] < 30) {
            return null; // genuinely spread out - "mostly from X" would be false
        }

        return [
            'type' => 'geography',
            'icon' => 'globe',
            'text' => sprintf(
                '%s%% of your audience is in %s.',
                (int) round((float) $top['pct']),
                $this->countryName($top['name']),
            ),
        ];
    }

    /** "Videos posted on Friday gain 23% more views." */
    private function bestDayOfWeek(int $creatorId, string $start, string $end, string $tz): ?array
    {
        $cells = $this->queries->bestTimeHeatmap($creatorId, $start, $end, $tz);
        if ($cells === []) {
            return null;
        }

        $byDay = [];
        foreach ($cells as $c) {
            $byDay[(int) $c['dow']] = ($byDay[(int) $c['dow']] ?? 0) + (int) $c['views'];
        }

        if (count($byDay) < 3) {
            return null; // not enough distinct days to call one "best"
        }

        $total = array_sum($byDay);
        if ($total < self::MIN_VIEWS_FOR_COMPARISON) {
            return null;
        }

        arsort($byDay);
        $bestDay   = (int) array_key_first($byDay);
        $bestViews = reset($byDay);
        $average   = $total / count($byDay);

        if ($average <= 0) {
            return null;
        }

        $lift = round((($bestViews - $average) / $average) * 100);
        if ($lift < 15) {
            return null;
        }

        $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        return [
            'type' => 'best_day',
            'icon' => 'calendar',
            'text' => sprintf('%s gets %d%% more views than your average day.', $days[$bestDay] ?? 'Monday', $lift),
        ];
    }

    /**
     * "Videos with trending music perform 18% better."
     *
     * Compares mean views of videos that used a library track against those that did
     * not. Null unless the creator actually has both kinds - most don't, and inventing
     * a music insight for a creator who has never used a track is exactly the kind of
     * confident nonsense this class exists to avoid.
     */
    private function musicLift(int $creatorId, string $start, string $end): ?array
    {
        $rows = DB::table('videos')
            ->where('user_id', $creatorId)
            ->whereNull('deleted_at')
            ->whereBetween('created_at', [$start, $end . ' 23:59:59'])
            ->select([
                DB::raw('audio_track_id IS NOT NULL AS has_music'),
                DB::raw('AVG(views_count) AS avg_views'),
                DB::raw('COUNT(*) AS n'),
            ])
            ->groupBy(DB::raw('audio_track_id IS NOT NULL'))
            ->get();

        if ($rows->count() < 2) {
            return null; // all-music or no-music: nothing to compare against
        }

        $withMusic    = $rows->firstWhere('has_music', true);
        $withoutMusic = $rows->firstWhere('has_music', false);

        if (! $withMusic || ! $withoutMusic
            || (int) $withMusic->n < 2 || (int) $withoutMusic->n < 2
            || (float) $withoutMusic->avg_views <= 0) {
            return null;
        }

        $lift = round(((((float) $withMusic->avg_views) - ((float) $withoutMusic->avg_views))
            / ((float) $withoutMusic->avg_views)) * 100);

        if (abs($lift) < 10) {
            return null;
        }

        return [
            'type' => 'music',
            'icon' => 'music',
            'text' => $lift > 0
                ? sprintf('Videos with music perform %d%% better than those without.', $lift)
                : sprintf('Videos without music perform %d%% better than those with.', abs($lift)),
        ];
    }

    private function hourLabel(int $hour): string
    {
        $hour %= 24;
        $suffix  = $hour < 12 ? 'AM' : 'PM';
        $display = $hour % 12 === 0 ? 12 : $hour % 12;

        return "{$display} {$suffix}";
    }

    /** ISO-2 → display name for the handful of countries we actually see. */
    private function countryName(string $iso): string
    {
        static $names = [
            'NP' => 'Nepal', 'IN' => 'India', 'US' => 'the United States',
            'CN' => 'China', 'TW' => 'Taiwan', 'KZ' => 'Kazakhstan',
            'TR' => 'Turkey', 'GB' => 'the United Kingdom', 'AE' => 'the UAE',
            'AU' => 'Australia', 'CA' => 'Canada', 'DE' => 'Germany',
            'FR' => 'France', 'JP' => 'Japan', 'BR' => 'Brazil',
        ];

        return $names[strtoupper($iso)] ?? strtoupper($iso);
    }
}
