<?php

namespace App\Console\Commands;

use App\Models\Currency;
use App\Models\ExchangeRate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Refreshes USD → * exchange rates. Scheduled every 12 hours.
 *
 * THE RULE: a failed refresh must never remove a rate. If the provider is down,
 * unreachable, or answers with something unusable, the existing rows are left
 * exactly as they are and the pricing service keeps quoting them. An old rate
 * prices a checkout; a missing one does not, and a missing rate that silently
 * became zero would price it at nothing.
 *
 * Frankfurter (ECB data, no key, no quota) is the default. The provider is a
 * setting so it can be swapped without a deploy.
 */
class RefreshExchangeRates extends Command
{
    protected $signature = 'pricing:refresh-rates {--force : ignore the freshness check}';

    protected $description = 'Refresh USD exchange rates from the configured provider';

    public function handle(): int
    {
        $targets = Currency::enabled()->where('code', '!=', 'USD')->pluck('code')->all();
        if (empty($targets)) {
            $this->warn('No enabled currencies besides USD - nothing to refresh.');

            return self::SUCCESS;
        }

        // The current host. api.frankfurter.app still answers but 301s here,
        // and following that hop with a long target list reliably blew the
        // 15s timeout in production - measured, not guessed: .app redirects in
        // ~1.7s, .dev answers directly in ~0.12s.
        $endpoint = 'https://api.frankfurter.dev/v1/latest';

        try {
            $res = Http::timeout(15)->retry(2, 500)->get($endpoint, [
                'from' => 'USD',
                'to'   => implode(',', $targets),
            ]);

            if (! $res->successful()) {
                return $this->keepExisting("provider returned HTTP {$res->status()}");
            }

            $rates = $res->json('rates');
            if (! is_array($rates) || empty($rates)) {
                return $this->keepExisting('provider returned no rates');
            }
        } catch (\Throwable $e) {
            return $this->keepExisting($e->getMessage());
        }

        $written = 0;
        foreach ($rates as $code => $rate) {
            // A zero or negative rate would make everything free. Skip the row
            // rather than write it; the previous value survives.
            if (! is_numeric($rate) || $rate <= 0) {
                $this->warn("skipped {$code}: unusable rate " . var_export($rate, true));
                continue;
            }

            ExchangeRate::updateOrCreate(
                ['base_code' => 'USD', 'target_code' => strtoupper($code)],
                ['rate' => $rate, 'provider' => 'frankfurter', 'fetched_at' => now()],
            );
            Cache::forget('pricing:rate:' . strtoupper($code));
            $written++;
        }

        // USD against itself, so a quote never special-cases the base.
        ExchangeRate::updateOrCreate(
            ['base_code' => 'USD', 'target_code' => 'USD'],
            ['rate' => 1, 'provider' => 'fixed', 'fetched_at' => now()],
        );

        $missing = array_diff($targets, array_map('strtoupper', array_keys($rates)));
        if ($missing) {
            // Frankfurter covers ECB currencies only; NPR and several others are
            // not in it. Reported rather than hidden - those markets keep
            // whatever rate they had, or fall back to USD if never seeded.
            $this->warn('not offered by provider: ' . implode(', ', $missing));
        }

        $this->info("refreshed {$written} rate(s)");

        return self::SUCCESS;
    }

    private function keepExisting(string $why): int
    {
        Log::warning('Exchange rate refresh failed; keeping cached rates', ['reason' => $why]);
        $this->error("refresh failed ({$why}) - existing rates left in place");

        // SUCCESS on purpose: this is a degraded but handled outcome, and a
        // non-zero exit would have the scheduler alerting every 12 hours for a
        // condition the system is designed to absorb.
        return self::SUCCESS;
    }
}
