<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * One admin-controlled monetization programme.
 *
 * The app and the website both render whatever this table says, so it is the
 * single place a programme is turned on, put behind "coming soon", hidden, or
 * has its requirements changed. Nothing about a programme is hard-coded in a
 * client any more.
 */
class MonetizationProgram extends Model
{
    public const MODES = ['enabled', 'coming_soon', 'disabled'];

    /**
     * The icons a feature bullet (`features`) can use. A curated lucide-
     * react-native set, not free text: both clients render a bullet's icon
     * from a fixed name->component map, so an admin-typed name outside this
     * list would render nothing. The admin panel's icon picker offers
     * exactly these, same "server owns the picklist" pattern as METRICS.
     */
    public const FEATURE_ICONS = [
        'Gift', 'Wallet', 'Star', 'Trophy', 'Award', 'BarChart3', 'TrendingUp',
        'Users', 'Heart', 'Coins', 'DollarSign', 'Percent', 'CheckCircle2',
        'Zap', 'Shield', 'ShieldCheck', 'Store', 'Package', 'Video', 'Eye',
        'Clock', 'Target', 'Sparkles', 'Rocket', 'Crown', 'Gem', 'ThumbsUp',
        'Handshake', 'Megaphone', 'Flag',
    ];

    /** Clients a programme can ship to. Empty means every one. */
    public const PLATFORMS = ['android', 'ios', 'web', 'api'];

    /** Places inside a client a programme can appear. Empty means every one. */
    public const SURFACES = ['studio', 'upload', 'wallet', 'profile', 'live', 'discover'];

    /**
     * The metrics a requirement can be measured against. A requirement whose
     * key is not in here cannot be evaluated, so the admin form offers exactly
     * these and the update endpoint rejects anything else - an unmeasurable
     * requirement would sit on a creator's checklist forever.
     */
    public const METRICS = [
        'followers'  => ['label' => 'Followers',                'counted' => true],
        'views30'    => ['label' => 'Qualified views (30d)',    'counted' => true],
        'videos'     => ['label' => 'Public videos',            'counted' => true],
        'watch30'    => ['label' => 'Watch minutes (30d)',      'counted' => true],
        'age'        => ['label' => 'Account age (days)',       'counted' => true],
        'views_total'=> ['label' => 'Total views (all time)',   'counted' => true],
        'engagement30' => ['label' => 'Engagement rate % (30d)', 'counted' => true],
        'streak'     => ['label' => 'Posting streak (months)',  'counted' => true],
        'identity'   => ['label' => 'Identity verified',        'counted' => false],
        'age18'      => ['label' => 'Age verified (18+)',        'counted' => false],
        'tax'        => ['label' => 'Tax details on file',       'counted' => false],
        'pledge'     => ['label' => 'Original content pledge',   'counted' => false],
        'merchant'   => ['label' => 'Merchant agreement',        'counted' => false],
        'disclosure' => ['label' => 'Disclosure enabled',        'counted' => false],
        'profile'    => ['label' => 'Profile complete',         'counted' => false],
        'email'      => ['label' => 'Email verified',           'counted' => false],
        'guidelines' => ['label' => 'No active violations',     'counted' => false],
        'strikes'    => ['label' => 'No active strikes',         'counted' => false],
        'brand_safety'=> ['label' => 'No brand-safety flags',    'counted' => false],
        'two_factor' => ['label' => 'Two-factor login enabled',  'counted' => false],
        'region'     => ['label' => 'Region supported',          'counted' => false],
        'unique_account' => ['label' => 'One account per person', 'counted' => false],
    ];

    /**
     * Failures that are BLOCKERS rather than progress.
     *
     * The distinction the spec draws: a follower count a creator has not
     * reached yet is something they can work toward, and colouring it red says
     * they did something wrong. These are different - they need an appeal, a
     * document or a settings change, and no amount of posting clears them.
     */
    public const BLOCKER_METRICS = [
        'strikes', 'brand_safety', 'guidelines', 'identity', 'tax', 'two_factor', 'region',
        'unique_account',
    ];

    /** The action a creator can take on an unmet rule, if there is one. */
    public const METRIC_ACTIONS = [
        'followers'  => 'Grow audience',
        'videos'     => 'Upload a video',
        'views30'    => 'See what performs',
        'watch30'    => 'See what performs',
        'streak'     => 'See schedule',
        'identity'   => 'Verify identity',
        'age18'      => 'Verify identity',
        'email'      => 'Verify email',
        'tax'        => 'Add PAN',
        'two_factor' => 'Enable 2FA',
        'pledge'     => 'Sign pledge',
        'merchant'   => 'Accept terms',
        'disclosure' => 'Enable disclosure',
        'profile'    => 'Complete profile',
        'strikes'    => 'Appeal',
        'unique_account' => 'Contact support',
        'brand_safety' => 'Appeal',
    ];

    /**
     * Rules every programme carries, on top of its own.
     *
     * The spec calls these baseline account rules: a creator is ineligible for
     * ANY programme unless all of them hold. Kept here rather than copied into
     * each programme's requirement list so raising the platform bar is one
     * change, not five, and so an operator cannot delete one by accident while
     * editing a single programme.
     */
    public const BASELINE = [
        ['key' => 'age18',      'label' => 'Age verified (18+)',  'sub' => 'Confirmed by identity verification', 'target' => null],
        ['key' => 'age',        'label' => 'Account age',          'sub' => 'At least 30 days old',               'target' => 30],
        ['key' => 'strikes',    'label' => 'No active strikes',    'sub' => 'A strike blocks all programmes for 90 days', 'target' => null],
        ['key' => 'two_factor', 'label' => 'Two-factor login',     'sub' => 'Required on a monetized account',    'target' => null],
        ['key' => 'region',     'label' => 'Region supported',     'sub' => 'Payouts to an account in your own name', 'target' => null],
        ['key' => 'unique_account', 'label' => 'One account per person', 'sub' => 'Duplicate or shared accounts are rejected', 'target' => null],
    ];

    protected $fillable = [
        'key', 'label', 'description', 'mode', 'requirements', 'unlocks', 'sort_order',
        'visible_app', 'visible_web', 'countries', 'rollout_percent', 'starts_at',
        'commission_rate', 'min_payout', 'hold_days', 'auto_approve', 'waitlist_enabled',
        'notice', 'platforms', 'surfaces', 'ends_at', 'cta_label',
        'hero_title', 'hero_description', 'features',
    ];

    protected $casts = [
        'requirements'     => 'array',
        'unlocks'          => 'array',
        'countries'        => 'array',
        'sort_order'       => 'integer',
        'visible_app'      => 'boolean',
        'visible_web'      => 'boolean',
        'rollout_percent'  => 'integer',
        'hold_days'        => 'integer',
        'auto_approve'     => 'boolean',
        'waitlist_enabled' => 'boolean',
        'starts_at'        => 'datetime',
        'ends_at'          => 'datetime',
        'platforms'        => 'array',
        'surfaces'         => 'array',
        'commission_rate'  => 'float',
        'min_payout'       => 'float',
        'features'         => 'array',
    ];

    /** The platform-wide kill switch. Off hides monetization on both surfaces. */
    public static function masterEnabled(): bool
    {
        return (bool) (int) AdminCoinSetting::getValue('monetization_enabled', 1);
    }

    /* ── Gating ─────────────────────────────────────────────────────────── */

    /** Visible on this surface at all? `disabled` is invisible everywhere. */
    public function visibleOn(string $surface): bool
    {
        if ($this->mode === 'disabled') {
            return false;
        }
        return $surface === 'web' ? (bool) $this->visible_web : (bool) $this->visible_app;
    }

    /**
     * Ships to this client? An empty list means every platform - the same
     * "unset is permissive" rule `countries` uses, so an operator never has to
     * tick four boxes to mean "no restriction".
     */
    public function onPlatform(?string $platform): bool
    {
        $list = $this->platforms;
        if (empty($list) || ! $platform) return true;

        return in_array(strtolower($platform), array_map('strtolower', $list), true);
    }

    /** Appears on this screen? Empty means everywhere in the client. */
    public function onScreen(?string $screen): bool
    {
        $list = $this->surfaces;
        if (empty($list) || ! $screen) return true;

        return in_array(strtolower($screen), array_map('strtolower', $list), true);
    }

    /** A programme past its end date is over, whatever its mode says. */
    public function hasEnded(): bool
    {
        return $this->ends_at && $this->ends_at->isPast();
    }

    /**
     * Is this creator inside the rollout?
     *
     * Deterministic on (user, programme): a creator who is inside at 40% stays
     * inside at 60%, and never flickers between page loads. A random draw would
     * hand someone a programme one minute and take it back the next.
     */
    public function inRollout(int $userId): bool
    {
        $pct = max(0, min(100, (int) $this->rollout_percent));
        if ($pct >= 100) return true;
        if ($pct <= 0)   return false;

        return (crc32($this->key . ':' . $userId) % 100) < $pct;
    }

    /** NULL or empty countries means worldwide. */
    public function allowsCountry(?string $iso2): bool
    {
        $list = $this->countries;
        if (empty($list)) return true;
        if (! $iso2)      return false;

        return in_array(strtoupper($iso2), array_map('strtoupper', $list), true);
    }

    /** A programme scheduled for later behaves as coming_soon until then. */
    public function hasStarted(): bool
    {
        return ! $this->starts_at || $this->starts_at->isPast();
    }

    /**
     * The mode a creator should be treated as being in, after the controls that
     * can only ever narrow it: a rollout they are outside, a country they are
     * not in, or a start date in the future all read as `coming_soon` rather
     * than as an error - the programme is real, it is just not theirs yet.
     */
    public function effectiveMode(int $userId, ?string $iso2): string
    {
        if ($this->mode === 'disabled') return 'disabled';
        if ($this->hasEnded())          return 'disabled';
        if (! self::masterEnabled())    return 'coming_soon';
        if (! $this->hasStarted())      return 'coming_soon';
        if (! $this->allowsCountry($iso2)) return 'coming_soon';
        if (! $this->inRollout($userId))   return 'coming_soon';

        return $this->mode;
    }

    /* ── Reads ──────────────────────────────────────────────────────────── */

    /**
     * Every programme, ordered, cached for five minutes.
     *
     * Cached because both clients fetch this on every Monetization open and the
     * rows change a handful of times a year. `bustCache()` is called on every
     * write, so the cache can never serve a stale mode after an admin toggles
     * one - which would be the difference between a programme being live and
     * not.
     */
    public static function allCached()
    {
        return Cache::remember('monetization_programs:all', 300, fn () =>
            static::orderBy('sort_order')->orderBy('id')->get()
        );
    }

    /** Programmes this surface may render. */
    public static function visibleOnSurface(string $surface)
    {
        return static::allCached()->filter(fn ($p) => $p->visibleOn($surface))->values();
    }

    public static function bustCache(): void
    {
        Cache::forget('monetization_programs:all');
    }

    /* ── Shape sent to the clients ──────────────────────────────────────── */

    /**
     * `counted` is resolved here rather than in each client, so the app and the
     * website can never disagree about whether a requirement is a number or a
     * yes/no.
     */
    public function toClientArray(): array
    {
        $reqs = collect($this->requirements ?? [])
            ->filter(fn ($r) => isset($r['key']) && array_key_exists($r['key'], self::METRICS))
            ->map(fn ($r) => [
                'key'     => $r['key'],
                'label'   => $r['label'] ?? self::METRICS[$r['key']]['label'],
                'target'  => isset($r['target']) && $r['target'] !== null ? (float) $r['target'] : null,
                'counted' => self::METRICS[$r['key']]['counted'],
            ])
            ->values()
            ->all();

        return [
            'key'              => $this->key,
            'label'            => $this->label,
            'description'      => $this->description,
            'mode'             => $this->mode,
            'requirements'     => $reqs,
            'unlocks'          => array_values($this->unlocks ?? []),
            'sort_order'       => $this->sort_order,
            'visible_app'      => (bool) $this->visible_app,
            'visible_web'      => (bool) $this->visible_web,
            'countries'        => $this->countries ?: [],
            'rollout_percent'  => (int) $this->rollout_percent,
            'starts_at'        => $this->starts_at?->toIso8601String(),
            'ends_at'          => $this->ends_at?->toIso8601String(),
            'platforms'        => $this->platforms ?: [],
            'surfaces'         => $this->surfaces ?: [],
            'commission_rate'  => $this->commission_rate,
            'min_payout'       => $this->min_payout,
            'hold_days'        => (int) $this->hold_days,
            'auto_approve'     => (bool) $this->auto_approve,
            'waitlist_enabled' => (bool) $this->waitlist_enabled,
            'notice'           => $this->notice,
            // Null means "use the client's own default label for this
            // programme" - see the 2026_08_20_000002 migration's docblock.
            'cta_label'        => $this->cta_label,
            // Null means "use the client's own default pitch copy" - see the
            // 2026_08_20_000003 migration's docblock.
            'hero_title'       => $this->hero_title,
            'hero_description' => $this->hero_description,
            'features'         => collect($this->features ?? [])
                ->filter(fn ($f) => in_array($f['icon'] ?? null, self::FEATURE_ICONS, true) && !empty($f['title']))
                ->map(fn ($f) => ['icon' => $f['icon'], 'title' => $f['title'], 'desc' => $f['desc'] ?? ''])
                ->values()
                ->all(),
        ];
    }
}
