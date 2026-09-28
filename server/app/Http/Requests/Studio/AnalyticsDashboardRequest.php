<?php

namespace App\Http\Requests\Studio;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;

/**
 * Validation + date-range resolution for the Studio analytics dashboard.
 *
 * The whole filter bar lands here: preset period, custom range, timezone, and the
 * video/country/device/content-type dropdowns.
 *
 * The reason this is a FormRequest rather than inline $request->get() calls is that
 * these values reach ClickHouse. They are bound as parameters, never interpolated,
 * but a bad range is still worth rejecting early: an unbounded start date would ask
 * ClickHouse to scan every partition we have.
 */
class AnalyticsDashboardRequest extends FormRequest
{
    /** Presets offered by the filter bar. `custom` requires start_date/end_date. */
    private const PRESETS = ['today', '7', '28', '90', 'custom'];

    /** Hard ceiling on a custom range - 13 months, matching the ClickHouse TTL. */
    private const MAX_RANGE_DAYS = 395;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'period'       => ['nullable', 'string', 'in:' . implode(',', self::PRESETS)],
            'start_date'   => ['nullable', 'date', 'required_if:period,custom'],
            'end_date'     => ['nullable', 'date', 'required_if:period,custom', 'after_or_equal:start_date'],
            // NOT validated with Laravel's `timezone` rule - deliberately.
            //
            // That rule checks against PHP's CANONICAL identifier list, which excludes
            // the backwards-compatible aliases browsers still emit. Chrome in Nepal
            // reports "Asia/Katmandu" (legacy spelling; canonical is "Asia/Kathmandu"),
            // and the rule rejected it - 422ing the ENTIRE dashboard. A whole page
            // taken down by a stale timezone alias.
            //
            // The timezone only decides which local hour a view is bucketed into. A
            // bad one should skew the heatmap, never blank the page. So it is accepted
            // as a plain string here and sanitised in timezone(), which validates it,
            // canonicalises it for ClickHouse, and falls back to UTC if it is nonsense.
            'timezone'     => ['nullable', 'string', 'max:64'],
            'video_id'     => ['nullable', 'integer', 'min:1'],
            'country'      => ['nullable', 'string', 'size:2'],
            'device'       => ['nullable', 'string', 'in:mobile,tablet,desktop'],
            'content_type' => ['nullable', 'string', 'in:video,photo,live'],
        ];
    }

    public function messages(): array
    {
        return [
            'end_date.after_or_equal' => 'The end date must not be before the start date.',
        ];
    }

    /**
     * The selected window as [start, end], both Y-m-d.
     *
     * Dates are resolved in the CREATOR's timezone, not the server's. "Today" for a
     * creator in Kathmandu is not the same 24 hours as UTC today, and a dashboard
     * that quietly disagrees with the clock on their wall reads as broken.
     *
     * @return array{0: string, 1: string}
     */
    public function range(): array
    {
        $tz     = $this->timezone();
        $period = (string) ($this->input('period') ?? '28');

        if ($period === 'custom') {
            $start = Carbon::parse($this->input('start_date'), $tz);
            $end   = Carbon::parse($this->input('end_date'), $tz);

            // Clamp rather than reject: a 5-year range is a slip, not an attack, and
            // silently scanning every partition to serve it helps nobody.
            if ($start->diffInDays($end) > self::MAX_RANGE_DAYS) {
                $start = $end->copy()->subDays(self::MAX_RANGE_DAYS);
            }

            return [$start->toDateString(), $end->toDateString()];
        }

        $end = Carbon::now($tz);

        $start = $period === 'today'
            ? $end->copy()
            : $end->copy()->subDays((int) $period - 1);

        return [$start->toDateString(), $end->toDateString()];
    }

    /**
     * The immediately preceding window of the SAME LENGTH, which is what every
     * "vs. previous period" growth chip on the page compares against.
     *
     * @return array{0: string, 1: string}
     */
    public function previousRange(): array
    {
        [$start, $end] = $this->range();

        $startAt = Carbon::parse($start);
        $endAt   = Carbon::parse($end);

        // Inclusive length: a single-day range is 1 day long, not 0.
        $days = $startAt->diffInDays($endAt) + 1;

        return [
            $startAt->copy()->subDays($days)->toDateString(),
            $startAt->copy()->subDay()->toDateString(),
        ];
    }

    /**
     * The creator's timezone, or UTC.
     *
     * Belt and braces on top of the validation rule: even if some client sends a
     * timezone PHP has never heard of, degrade to UTC rather than throw. The
     * timezone only shifts which local hour a view is bucketed into - getting it
     * wrong skews the heatmap slightly. Failing the request instead blanks the
     * whole dashboard, which is a far worse trade.
     */
    public function timezone(): string
    {
        $tz = (string) ($this->input('timezone') ?: 'UTC');

        // CANONICALISE FIRST, then validate - order matters, and getting it backwards
        // is what broke this page twice.
        //
        // The trap: `new \DateTimeZone('Asia/Katmandu')` SUCCEEDS (PHP accepts the
        // legacy alias), but `Carbon::now('Asia/Katmandu')` THROWS. So validating
        // with DateTimeZone lets the alias straight through to Carbon, which then
        // 500s deep inside range(). Whatever validates must be the same thing that
        // ultimately consumes the value - here, Carbon.
        if (class_exists(\IntlTimeZone::class)) {
            $canonical = \IntlTimeZone::getCanonicalID($tz);
            if (is_string($canonical) && $canonical !== '') {
                $tz = $canonical;
            }
        }
        $tz = self::BC_ALIASES[$tz] ?? $tz;

        // Carbon builds the date range AND ClickHouse's toTimeZone() takes this same
        // string. If Carbon is happy, both are.
        try {
            Carbon::now($tz);
        } catch (\Throwable) {
            return 'UTC';
        }

        return $tz;
    }

    /**
     * Fallback alias map for when ext-intl is unavailable. Only the zones our users
     * are actually in - this is a safety net, not a tz database.
     */
    private const BC_ALIASES = [
        'Asia/Katmandu'  => 'Asia/Kathmandu',
        'Asia/Calcutta'  => 'Asia/Kolkata',
        'Asia/Saigon'    => 'Asia/Ho_Chi_Minh',
        'Asia/Rangoon'   => 'Asia/Yangon',
        'Europe/Kiev'    => 'Europe/Kyiv',
        'America/Buenos_Aires' => 'America/Argentina/Buenos_Aires',
    ];

    /**
     * Stable fingerprint of the non-date filters, so two different filter
     * combinations never collide on the same cache key.
     */
    public function filterFingerprint(): string
    {
        $filters = [
            'v' => $this->input('video_id'),
            'c' => $this->input('country'),
            'd' => $this->input('device'),
            't' => $this->input('content_type'),
        ];

        return substr(md5(json_encode($filters)), 0, 12);
    }
}
