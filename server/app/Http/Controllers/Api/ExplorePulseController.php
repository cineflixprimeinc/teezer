<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\IpCountryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * "Moving today" - the Explore page's pulse card.
 *
 * Four rows, each a real week-over-week movement with the delta that earned it
 * a place. Nothing here is a headline someone wrote: the copy is generated from
 * the numbers, so a row can only appear if the movement actually happened.
 *
 * Rows are dropped rather than faked when their signal cannot be computed - a
 * young install has no prior week to compare against, and inventing "+52%" to
 * fill the card would make the one genuinely useful thing on it untrustworthy.
 * The client renders however many rows come back.
 *
 * Percentages compare a trailing 7-day window against the 7 days before it. A
 * minimum prior volume is required before a percentage is reported at all,
 * because 1 -> 9 is "+800%" and means nothing.
 */
class ExplorePulseController extends Controller
{
    /** Below this many prior-week events a percentage is noise, not signal. */
    private const MIN_PRIOR = 5;

    public function __construct(private readonly IpCountryService $ipCountries) {}

    public function index(Request $request): JsonResponse
    {
        $country = $this->country($request);

        $rows = Cache::remember(
            'explore:pulse:' . Str::slug($country ?: 'global'),
            now()->addMinutes(10),
            fn () => array_values(array_filter([
                $this->risingHashtag(),
                $this->liveActivity(),
                $this->soundsInRotation(),
                $this->localActivity($country),
            ])),
        );

        return response()->json([
            'success'    => true,
            'country'    => $country,
            'updated_at' => now()->toISOString(),
            'data'       => $rows,
        ])->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    }

    /** The hashtag whose usage grew most, week over week. */
    private function risingHashtag(): ?array
    {
        $row = DB::table('video_hashtags as hv')
            ->join('hashtags as h', 'h.id', '=', 'hv.hashtag_id')
            ->join('videos as v', 'v.id', '=', 'hv.video_id')
            ->whereNull('v.deleted_at')
            ->where('v.status', 'published')
            ->where('v.created_at', '>=', now()->subDays(14))
            ->groupBy('h.id', 'h.name')
            ->select([
                'h.name',
                DB::raw("COUNT(*) FILTER (WHERE v.created_at >= NOW() - INTERVAL '7 days') AS recent"),
                DB::raw("COUNT(*) FILTER (WHERE v.created_at <  NOW() - INTERVAL '7 days') AS prior"),
                DB::raw("SUM(v.views_count) AS views"),
            ])
            ->havingRaw("COUNT(*) FILTER (WHERE v.created_at >= NOW() - INTERVAL '7 days') > 0")
            ->orderByRaw("
                CASE WHEN COUNT(*) FILTER (WHERE v.created_at < NOW() - INTERVAL '7 days') >= ?
                     THEN (COUNT(*) FILTER (WHERE v.created_at >= NOW() - INTERVAL '7 days'))::numeric
                          / COUNT(*) FILTER (WHERE v.created_at < NOW() - INTERVAL '7 days')
                     ELSE 0 END DESC,
                COUNT(*) FILTER (WHERE v.created_at >= NOW() - INTERVAL '7 days') DESC
            ", [self::MIN_PRIOR])
            ->first();

        if (! $row) {
            return null;
        }

        return [
            'kind'     => 'hashtag',
            'icon'     => 'hash',
            'title'    => "#{$row->name} is climbing fast",
            'subtitle' => $this->compact((int) $row->views) . ' views · '
                . $this->compact((int) $row->recent) . ' new videos this week',
            'delta'    => $this->delta((int) $row->recent, (int) $row->prior),
            'target'   => ['type' => 'hashtag', 'value' => $row->name],
        ];
    }

    /** Who has been going live, and whether that is up on last week. */
    private function liveActivity(): ?array
    {
        if (! DB::getSchemaBuilder()->hasTable('spaces')) {
            return null;
        }

        $row = DB::table('spaces as s')
            ->join('users as u', 'u.id', '=', 's.host_id')
            ->where('s.created_at', '>=', now()->subDays(14))
            ->groupBy('u.id', 'u.name', 'u.username')
            ->select([
                'u.name', 'u.username',
                DB::raw("COUNT(*) FILTER (WHERE s.created_at >= NOW() - INTERVAL '7 days') AS recent"),
                DB::raw("COUNT(*) FILTER (WHERE s.created_at <  NOW() - INTERVAL '7 days') AS prior"),
                DB::raw('SUM(COALESCE(s.listeners_count, 0)) AS listeners'),
            ])
            ->havingRaw("COUNT(*) FILTER (WHERE s.created_at >= NOW() - INTERVAL '7 days') > 0")
            ->orderByRaw("COUNT(*) FILTER (WHERE s.created_at >= NOW() - INTERVAL '7 days') DESC")
            ->first();

        if (! $row) {
            return null;
        }

        $times = (int) $row->recent;
        $who   = $row->name ?: ('@' . $row->username);

        return [
            'kind'     => 'live',
            'icon'     => 'radio',
            'title'    => "{$who} went live {$times} time" . ($times === 1 ? '' : 's'),
            'subtitle' => 'Spaces · ' . $this->compact((int) $row->listeners) . ' listening this week',
            'delta'    => $this->delta($times, (int) $row->prior),
            'target'   => ['type' => 'profile', 'value' => $row->username],
        ];
    }

    /** How much of this week's posting is riding the top sounds. */
    private function soundsInRotation(): ?array
    {
        if (! DB::getSchemaBuilder()->hasTable('music_tracks')) {
            return null;
        }

        $row = DB::table('videos as v')
            ->whereNotNull('v.music_track_id')
            ->whereNull('v.deleted_at')
            ->where('v.status', 'published')
            ->where('v.created_at', '>=', now()->subDays(14))
            ->select([
                DB::raw("COUNT(*) FILTER (WHERE v.created_at >= NOW() - INTERVAL '7 days') AS recent"),
                DB::raw("COUNT(*) FILTER (WHERE v.created_at <  NOW() - INTERVAL '7 days') AS prior"),
                DB::raw('COUNT(DISTINCT v.music_track_id) AS tracks'),
            ])
            ->first();

        if (! $row || (int) $row->recent === 0) {
            return null;
        }

        return [
            'kind'     => 'sounds',
            'icon'     => 'music',
            'title'    => 'Editing sounds are back in rotation',
            'subtitle' => $this->compact((int) $row->recent) . ' videos using '
                . (int) $row->tracks . ' sound' . ((int) $row->tracks === 1 ? '' : 's'),
            'delta'    => $this->delta((int) $row->recent, (int) $row->prior),
            'target'   => ['type' => 'tab', 'value' => 'sounds'],
        ];
    }

    /**
     * Posting activity in the viewer's own country. Matched on the country
     * segment of videos.location - the same free-text column the Nearby section
     * groups on - so this row only appears for viewers whose country actually
     * has creators tagging locations in it.
     */
    private function localActivity(?string $country): ?array
    {
        if (! $country) {
            return null;
        }

        $row = DB::table('videos as v')
            ->whereNull('v.deleted_at')
            ->where('v.status', 'published')
            ->whereNotNull('v.location')
            ->whereRaw('LOWER(v.location) LIKE ?', ['%' . Str::lower($country)])
            ->where('v.created_at', '>=', now()->subDays(14))
            ->select([
                DB::raw("COUNT(*) FILTER (WHERE v.created_at >= NOW() - INTERVAL '7 days') AS recent"),
                DB::raw("COUNT(*) FILTER (WHERE v.created_at <  NOW() - INTERVAL '7 days') AS prior"),
            ])
            ->first();

        if (! $row || (int) $row->recent === 0) {
            return null;
        }

        return [
            'kind'     => 'local',
            'icon'     => 'pin',
            'title'    => "{$country} creators posting more",
            'subtitle' => $this->compact((int) $row->recent) . ' videos this week nearby',
            'delta'    => $this->delta((int) $row->recent, (int) $row->prior),
            'target'   => ['type' => 'nearby', 'value' => $country],
        ];
    }

    /**
     * Percent change, or null when the prior week is too small to divide by.
     * Null is rendered as no badge at all - an honest "we cannot say" rather
     * than a number the data does not support.
     */
    private function delta(int $recent, int $prior): ?int
    {
        if ($prior < self::MIN_PRIOR) {
            return null;
        }
        return (int) round((($recent - $prior) / $prior) * 100);
    }

    private function compact(int $n): string
    {
        if ($n >= 1_000_000_000) return rtrim(rtrim(number_format($n / 1_000_000_000, 1), '0'), '.') . 'B';
        if ($n >= 1_000_000)     return rtrim(rtrim(number_format($n / 1_000_000, 1), '0'), '.') . 'M';
        if ($n >= 1_000)         return rtrim(rtrim(number_format($n / 1_000, 1), '0'), '.') . 'K';
        return (string) $n;
    }

    /** Same precedence the Nearby section uses, so the page agrees with itself. */
    private function country(Request $request): ?string
    {
        $user = $request->user();
        if ($user) {
            $name = $user->selected_country_name ?: $user->country ?: $user->detected_country_name ?: null;
            if ($name) {
                return (string) $name;
            }
        }

        $detected = $this->ipCountries->lookup($request);
        return $detected['countryName'] ?? null;
    }
}
