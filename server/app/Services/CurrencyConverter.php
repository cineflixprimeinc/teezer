<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

/**
 * Converts advertiser-entered budgets into the ads base currency (USD).
 *
 * The whole delivery pipeline settles in USD (ad accounts, campaign budgets,
 * spend_cents, and every figure the app / admin panel render). Advertisers may
 * still think and enter in their local currency, so we convert once, at creation
 * time, and store the USD result as canonical — keeping the original amount +
 * currency alongside it for display ("You set NPR 1,000 ≈ $7.50 / day").
 *
 * Rates live in config/currency.php as "units per 1 USD". Unknown currencies fall
 * back to 1:1 (and log once) so a typo never turns a budget into nonsense.
 */
class CurrencyConverter
{
    /** Normalise a currency code: uppercased, trimmed, defaults to base. */
    public function normalize(?string $code): string
    {
        $code = strtoupper(trim((string) $code));
        return $code !== '' ? $code : $this->base();
    }

    public function base(): string
    {
        return strtoupper((string) config('currency.base', 'USD'));
    }

    public function isSupported(?string $code): bool
    {
        return array_key_exists($this->normalize($code), $this->rates());
    }

    /**
     * Units of the given currency per 1 USD (e.g. NPR => 133.4). Unknown codes
     * resolve to 1.0 so conversion is a safe no-op instead of a crash.
     */
    public function rate(?string $code): float
    {
        $code  = $this->normalize($code);
        $rates = $this->rates();

        if (! isset($rates[$code])) {
            Log::warning('CurrencyConverter: unknown currency, using 1:1', ['currency' => $code]);
            return 1.0;
        }

        $rate = (float) $rates[$code];
        return $rate > 0 ? $rate : 1.0;
    }

    /** USD value of one unit of the currency (e.g. 1 NPR ≈ $0.0075). */
    public function unitInUsd(?string $code): float
    {
        return 1.0 / $this->rate($code);
    }

    /** Convert an amount in `$code` to USD. */
    public function toUsd(float $amount, ?string $code): float
    {
        if ($this->normalize($code) === $this->base()) {
            return round($amount, 2);
        }
        return round($amount / $this->rate($code), 2);
    }

    /** Convert a USD amount into `$code` (for showing an equivalent in another currency). */
    public function fromUsd(float $usd, ?string $code): float
    {
        if ($this->normalize($code) === $this->base()) {
            return round($usd, 2);
        }
        return round($usd * $this->rate($code), 2);
    }

    /**
     * @return array<string, float> units-per-USD map from config.
     */
    public function rates(): array
    {
        $rates = (array) config('currency.rates', ['USD' => 1.0]);
        // Guarantee the base currency is always present at 1:1.
        $rates[$this->base()] = 1.0;
        return $rates;
    }
}
