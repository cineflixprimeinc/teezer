<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdminCoinSetting;
use App\Models\CreatorProgramStatus;
use App\Models\MonetizationProgram;
use App\Services\IsoCountries;
use App\Services\MonetizationEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * GET /studio/monetization/programs
 *
 * What the app and the website render on the Monetization tab: the programmes
 * an operator has left visible, each with every requirement ALREADY MEASURED
 * against this creator, and the status they should see.
 *
 * All the thinking lives in MonetizationEligibilityService. This controller
 * only decides which surface is asking and where the caller is - so the phone,
 * the website and the background job can never reach different conclusions
 * about who may earn.
 *
 * No creator applies for anything. Meeting every requirement of an enabled
 * programme IS the unlock, measured on the spot.
 */
class StudioMonetizationProgramController extends Controller
{
    public function __construct(private readonly MonetizationEligibilityService $eligibility)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Anything unrecognised is treated as the app, the stricter default.
        $surface = $request->query('surface') === 'web' ? 'web' : 'app';

        /* Country, in the order the platform already trusts it elsewhere.
           `profiles.country` does not exist - reading it returned null on every
           request, so region gating silently never applied. `selected_country_code`
           already IS the admin-overridden value when one exists - CountryService::
           adminOverride() writes the real code straight into it (plus the separate
           `admin_country_override` BOOLEAN flag, "was this ever overridden", which
           is not a code and must never be read as one - it used to sit first in
           this cascade, so an overridden account resolved `$country` to `true`/1
           instead of a real ISO code, silently breaking region gating for every
           admin-overridden account). */
        $country = $user->selected_country_code
            ?: $user->detected_country_code
            ?: $user->country
            ?: $request->header('CF-IPCountry');

        $metrics  = $this->eligibility->metrics($user);
        $defaults = [
            'commission_rate' => (float) AdminCoinSetting::getValue('commission_rate', 30),
            'min_payout'      => (float) AdminCoinSetting::getValue('min_withdrawal_usd', 50),
        ];

        // When each programme was first unlocked, for the ones that have been.
        $history = CreatorProgramStatus::where('user_id', $user->id)
            ->pluck('unlocked_at', 'program_key');

        // Which coming-soon programmes this creator already asked to be
        // notified about - see ProgramWaitlistSignup's own docblock.
        $waitlisted = \App\Models\ProgramWaitlistSignup::where('user_id', $user->id)
            ->pluck('program_key')
            ->all();

        $programs = MonetizationProgram::visibleOnSurface($surface)
            ->map(function (MonetizationProgram $p) use ($metrics, $user, $country, $defaults, $history, $waitlisted) {
                $row = $this->eligibility->evaluateProgram($p, $metrics, $user->id, $country);

                return array_merge($row, [
                    // Terms fall back to the platform-wide settings, so a client
                    // never has to know which layer a number came from.
                    'commission_rate' => $p->commission_rate ?? $defaults['commission_rate'],
                    'min_payout'      => $p->min_payout ?? $defaults['min_payout'],
                    'unlocked_at'     => $history[$p->key] ?? null,
                    'waitlisted'      => in_array($p->key, $waitlisted, true),
                    /* Where the programme runs, named rather than coded.
                       This is not an operator secret - a creator asking "is
                       this available here" deserves an answer, and without one
                       a region lock reads as an unexplained lock. The ROLLOUT
                       percentage stays hidden: that is a launch decision, and
                       telling someone they lost a coin flip helps nobody. */
                    'availability'    => empty($p->countries)
                        ? ['worldwide' => true, 'countries' => []]
                        : [
                            'worldwide' => false,
                            'countries' => collect($p->countries)
                                ->map(fn ($c) => ['code' => $c, 'name' => IsoCountries::nameFor($c)])
                                ->values(),
                        ],
                    // Operator-only controls are not a creator's business.
                    'countries'       => null,
                    'rollout_percent' => null,
                    'visible_app'     => null,
                    'visible_web'     => null,
                    'platforms'       => null,
                    'surfaces'        => null,
                ]);
            })
            ->values();

        return response()->json([
            'success' => true,
            'data'    => [
                'enabled'  => MonetizationProgram::masterEnabled(),
                'surface'  => $surface,
                'programs' => $programs,
                'metrics'  => $metrics,
            ],
        ]);
    }

    /**
     * POST /studio/monetization/programs/{key}/waitlist
     *
     * "Notify me when eligible" / "Join the waitlist" - registers interest in
     * a programme, once, idempotently. Any creator may join regardless of
     * where they currently stand on requirements: the whole point of a
     * waitlist is for people who are not eligible (or the programme is not
     * even open) yet to say "tell me when it is".
     *
     * Requires the admin to have `waitlist_enabled` on for this programme -
     * a client showing a "Notify me" button for one that doesn't offer it
     * would be a client bug, but the endpoint refuses it either way rather
     * than silently accepting a signup nobody will ever act on.
     */
    public function joinWaitlist(Request $request, string $key): JsonResponse
    {
        // Global Reelsoo Control - keyed on the specific programme, not the
        // whole waitlist route (other programmes' waitlists must stay
        // unaffected), so this can't be a route-name middleware entry.
        $globalControls = app(\App\Services\GlobalControls\GlobalControlService::class);
        if ($key === 'rewards' && ! $globalControls->isEnabled('creator_rewards_enabled')) {
            return response()->json($globalControls->deniedResponse('creator_rewards_enabled'), 403);
        }

        $program = MonetizationProgram::where('key', $key)->first();
        if (! $program || ! $program->waitlist_enabled) {
            return response()->json(['success' => false, 'message' => 'This programme is not accepting waitlist signups.'], 422);
        }

        \App\Models\ProgramWaitlistSignup::firstOrCreate([
            'user_id'     => $request->user()->id,
            'program_key' => $key,
        ]);

        return response()->json(['success' => true, 'data' => ['waitlisted' => true]]);
    }
}
