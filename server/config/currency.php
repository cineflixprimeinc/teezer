<?php

/**
 * Currency conversion for the Ads system.
 *
 * Advertisers may set a campaign budget in their own currency (e.g. NPR), but the
 * whole delivery pipeline — ad accounts, campaign budgets, spend (spend_cents) and
 * every figure the app / admin panel show — runs in a single base currency (USD).
 * So budgets are converted to USD at creation time by CurrencyConverter, using the
 * table below.
 *
 * `rates` are expressed as "how many units of the currency equal 1 USD".
 *   USD amount = local amount / rate.
 *   e.g. NPR 1000 / 133.4 = ~$7.50.
 *
 * These are approximate reference rates, not a live feed. Override any of them from
 * the environment via ADS_FX_<CODE> (e.g. ADS_FX_NPR=134.2) without a deploy, or
 * point `provider` at a future live-rate source.
 */
return [

    // Base currency the delivery engine settles in. Everything is normalised to this.
    'base' => env('ADS_FX_BASE', 'USD'),

    // Units of <currency> per 1 USD. Update as needed; unknown currencies fall back to 1:1.
    'rates' => [
        'USD' => 1.0,
        'NPR' => (float) env('ADS_FX_NPR', 133.40),
        'INR' => (float) env('ADS_FX_INR', 83.30),
        'EUR' => (float) env('ADS_FX_EUR', 0.92),
        'GBP' => (float) env('ADS_FX_GBP', 0.79),
        'AED' => (float) env('ADS_FX_AED', 3.6725),
        'PKR' => (float) env('ADS_FX_PKR', 278.50),
        'BDT' => (float) env('ADS_FX_BDT', 117.50),
        'LKR' => (float) env('ADS_FX_LKR', 300.00),
        'AUD' => (float) env('ADS_FX_AUD', 1.52),
        'CAD' => (float) env('ADS_FX_CAD', 1.36),
        'SGD' => (float) env('ADS_FX_SGD', 1.34),
        'JPY' => (float) env('ADS_FX_JPY', 157.0),
        'CNY' => (float) env('ADS_FX_CNY', 7.24),
        'KRW' => (float) env('ADS_FX_KRW', 1370.0),
        'HKD' => (float) env('ADS_FX_HKD', 7.80),
        'NZD' => (float) env('ADS_FX_NZD', 1.64),
        'CHF' => (float) env('ADS_FX_CHF', 0.88),
        'SEK' => (float) env('ADS_FX_SEK', 10.60),
        'NOK' => (float) env('ADS_FX_NOK', 10.70),
        'DKK' => (float) env('ADS_FX_DKK', 6.90),
        'PLN' => (float) env('ADS_FX_PLN', 3.95),
        'ZAR' => (float) env('ADS_FX_ZAR', 18.40),
        'NGN' => (float) env('ADS_FX_NGN', 1500.0),
        'KES' => (float) env('ADS_FX_KES', 129.0),
        'EGP' => (float) env('ADS_FX_EGP', 48.0),
        'SAR' => (float) env('ADS_FX_SAR', 3.75),
        'QAR' => (float) env('ADS_FX_QAR', 3.64),
        'TRY' => (float) env('ADS_FX_TRY', 32.50),
        'RUB' => (float) env('ADS_FX_RUB', 90.0),
        'BRL' => (float) env('ADS_FX_BRL', 5.40),
        'MXN' => (float) env('ADS_FX_MXN', 18.30),
        'IDR' => (float) env('ADS_FX_IDR', 16200.0),
        'PHP' => (float) env('ADS_FX_PHP', 58.0),
        'MYR' => (float) env('ADS_FX_MYR', 4.70),
        'THB' => (float) env('ADS_FX_THB', 36.0),
        'VND' => (float) env('ADS_FX_VND', 25400.0),
        'AFN' => (float) env('ADS_FX_AFN', 71.0),
    ],
];
