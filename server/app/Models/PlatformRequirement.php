<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * One platform-wide requirement, applied on top of every monetization
 * programme's own requirements (age18, account age, no strikes, two-factor,
 * region, one account per person).
 *
 * Used to be a hardcoded `MonetizationProgram::BASELINE` constant so "an
 * operator cannot delete one by accident". Now a real, admin-editable table -
 * the admin explicitly asked to be able to change these, including turning
 * one off entirely. `MonetizationEligibilityService::evaluateProgram()` only
 * ever reads the `enabled` rows, so a disabled one stops applying everywhere,
 * immediately, for every programme.
 */
class PlatformRequirement extends Model
{
    protected $fillable = ['key', 'label', 'sub', 'target', 'enabled', 'sort_order'];

    protected $casts = [
        'target'  => 'float',
        'enabled' => 'boolean',
    ];

    /** Every row, enabled or not - what the admin panel edits. */
    public static function allCached()
    {
        return Cache::remember('platform_requirements:all', 300, fn () =>
            static::orderBy('sort_order')->orderBy('id')->get()
        );
    }

    /** Only the rows actually enforced - what eligibility is measured against. */
    public static function active()
    {
        return static::allCached()->filter(fn ($r) => $r->enabled)->values();
    }

    public static function bustCache(): void
    {
        Cache::forget('platform_requirements:all');
    }

    public function toClientArray(): array
    {
        return [
            'id'      => $this->id,
            'key'     => $this->key,
            'label'   => $this->label,
            'sub'     => $this->sub,
            'target'  => $this->target,
            'enabled' => $this->enabled,
        ];
    }
}
