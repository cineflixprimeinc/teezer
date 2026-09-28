<?php

namespace App\Services\Moderation;

use App\Models\AppSetting;
use App\Services\Moderation\Contracts\ModerationProvider;
use Illuminate\Support\Facades\Log;

/**
 * Runs content through moderation providers in admin-configured order.
 *
 * This is the piece the platform did not have. Sightengine was configurable and
 * testable but never called by the pipeline, which talks only to the self-hosted
 * Python scanner - so there was no way to add a second opinion, and no answer to
 * "what happens when the scanner is down".
 *
 * Behaviour, and the reasoning for each part:
 *
 *  - FIRST AVAILABLE WINS. Providers are tried in priority order and the first
 *    one that can answer is used. Running all of them would multiply cost for a
 *    result that still has to be reduced to one decision.
 *
 *  - UNAVAILABLE IS NOT SAFE. A provider that could not answer is skipped, not
 *    treated as a clean scan. If every provider is unavailable the chain returns
 *    no verdict and the FAILURE POLICY decides - defaulting to `review`, which
 *    holds content for a human rather than publishing it unchecked. Defaulting
 *    to approve would mean an outage silently disables moderation, which is the
 *    worst failure this system can have.
 *
 *  - BILLABLE PROVIDERS ARE NEVER REDUNDANT, and structurally so: a paid
 *    provider is only reached once everything ranked above it has failed to
 *    answer, which is exactly when paying for it is correct.
 *
 * Policy lives in AppSetting so it is admin-controlled, consistent with how
 * moderation thresholds are already stored.
 */
class ModerationChain
{
    public const POLICY_REVIEW  = 'review';
    public const POLICY_APPROVE = 'approve';
    public const POLICY_REJECT  = 'reject';

    /** @param list<ModerationProvider> $providers */
    public function __construct(private readonly array $providers) {}

    /**
     * Admin-configured provider order, falling back to registration order.
     *
     * Stored as a comma-separated list of provider keys. Unknown keys are
     * ignored and known-but-unlisted providers are appended, so adding a new
     * provider does not require an admin to re-save the ordering before it can
     * ever be used.
     *
     * @return list<ModerationProvider>
     */
    public function ordered(): array
    {
        $configured = array_filter(array_map(
            'trim',
            explode(',', (string) AppSetting::get('moderation_provider_priority', '')),
        ));

        if ($configured === []) {
            return $this->providers;
        }

        $byKey  = [];
        foreach ($this->providers as $provider) {
            $byKey[$provider->key()] = $provider;
        }

        $ordered = [];
        foreach ($configured as $key) {
            if (isset($byKey[$key])) {
                $ordered[] = $byKey[$key];
                unset($byKey[$key]);
            }
        }

        // Anything the admin has not ranked still runs, last.
        return [...$ordered, ...array_values($byKey)];
    }

    /**
     * Classify an image through the chain.
     *
     * @return array{verdict: ?ModerationVerdict, attempts: list<array<string,mixed>>}
     *         `verdict` is null when nothing could answer - the caller applies
     *         failurePolicy(). `attempts` is the full trail for the audit log,
     *         including the providers that were skipped and why.
     */
    public function classifyImage(string $imageUrl): array
    {
        $attempts = [];

        foreach ($this->ordered() as $provider) {
            if (! $provider->supports('image')) {
                $attempts[] = ['provider' => $provider->key(), 'skipped' => 'unsupported media type'];
                continue;
            }

            if (! $provider->isAvailable()) {
                $attempts[] = ['provider' => $provider->key(), 'skipped' => 'disabled or not configured'];
                continue;
            }

            $verdict    = $provider->classifyImage($imageUrl);
            $attempts[] = $verdict->toLog();

            // First answer wins, and returning here is also what keeps billable
            // providers from ever running redundantly: a paid provider is only
            // reached when everything ranked above it failed to answer, which
            // is exactly when paying for it is the right call. (An earlier
            // version of this loop carried a separate "skip billable" flag -
            // it was unreachable, because this return fires first.)
            if ($verdict->available) {
                return ['verdict' => $verdict, 'attempts' => $attempts];
            }

            // Worth a log line: a configured provider failing is an operational
            // problem even though the chain recovers from it.
            Log::warning('Moderation provider unavailable, trying next.', [
                'provider' => $provider->key(),
                'error'    => $verdict->error,
            ]);
        }

        return ['verdict' => null, 'attempts' => $attempts];
    }

    /**
     * What to do when no provider could answer.
     *
     * Defaults to review. An admin can set approve, but that is a deliberate
     * decision to publish unscanned content during an outage, not a default.
     */
    public function failurePolicy(): string
    {
        $policy = (string) AppSetting::get('moderation_failure_policy', self::POLICY_REVIEW);

        return in_array($policy, [self::POLICY_REVIEW, self::POLICY_APPROVE, self::POLICY_REJECT], true)
            ? $policy
            : self::POLICY_REVIEW;
    }

    /** Provider states, for the admin panel. */
    public function status(): array
    {
        return array_map(fn (ModerationProvider $p) => [
            'key'       => $p->key(),
            'label'     => $p->label(),
            'available' => $p->isAvailable(),
            'billable'  => $p->isBillable(),
            'images'    => $p->supports('image'),
        ], $this->ordered());
    }
}
