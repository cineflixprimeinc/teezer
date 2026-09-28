<?php

namespace Database\Seeders;

use App\Models\CountryCurrencyMap;
use App\Models\Currency;
use App\Models\RoundingRule;
use Illuminate\Database\Seeder;

/**
 * Reference data for the global pricing system.
 *
 * Idempotent (updateOrCreate on the natural key), so re-running after adding a
 * market never duplicates a row or clobbers an admin's edits with a fresh
 * insert.
 *
 * Formatting is stored per currency rather than derived, because no rule
 * derives all of it: JPY has no minor unit, NPR and INR are conventionally
 * quoted whole, and the symbol sits before the number in some markets and after
 * it in others.
 *
 * Countries not listed here fall back to USD - which is the documented
 * behaviour, not a gap. Adding a market is one admin row, no deploy.
 */
class CurrencySystemSeeder extends Seeder
{
    public function run(): void
    {
        // code, name, symbol, symbol_before, decimals
        $currencies = [
            ['USD', 'US Dollar',          '$',    true,  2],
            ['EUR', 'Euro',               '€',    true,  2],
            ['GBP', 'British Pound',      '£',    true,  2],
            ['NPR', 'Nepalese Rupee',     'Rs.',  true,  0],
            ['INR', 'Indian Rupee',       '₹',    true,  0],
            ['JPY', 'Japanese Yen',       '¥',    true,  0],
            ['AUD', 'Australian Dollar',  'A$',   true,  2],
            ['CAD', 'Canadian Dollar',    'C$',   true,  2],
            ['AED', 'UAE Dirham',         'AED ', true,  2],
            ['SAR', 'Saudi Riyal',        'SAR ', true,  2],
            ['SGD', 'Singapore Dollar',   'S$',   true,  2],
            ['NZD', 'New Zealand Dollar', 'NZ$',  true,  2],
            ['CHF', 'Swiss Franc',        'CHF ', true,  2],
            ['CNY', 'Chinese Yuan',       '¥',    true,  2],
            ['HKD', 'Hong Kong Dollar',   'HK$',  true,  2],
            ['KRW', 'South Korean Won',   '₩',    true,  0],
            ['BRL', 'Brazilian Real',     'R$',   true,  2],
            ['MXN', 'Mexican Peso',       'MX$',  true,  2],
            ['ZAR', 'South African Rand', 'R',    true,  2],
            ['SEK', 'Swedish Krona',      'kr',   false, 2],
            ['NOK', 'Norwegian Krone',    'kr',   false, 2],
            ['DKK', 'Danish Krone',       'kr',   false, 2],
            ['PLN', 'Polish Zloty',       'zł',   false, 2],
            ['TRY', 'Turkish Lira',       '₺',    true,  2],
            ['RUB', 'Russian Ruble',      '₽',    false, 2],
            ['IDR', 'Indonesian Rupiah',  'Rp',   true,  0],
            ['MYR', 'Malaysian Ringgit',  'RM',   true,  2],
            ['THB', 'Thai Baht',          '฿',    true,  2],
            ['PHP', 'Philippine Peso',    '₱',    true,  2],
            ['VND', 'Vietnamese Dong',    '₫',    false, 0],
            ['BDT', 'Bangladeshi Taka',   '৳',    true,  0],
            ['PKR', 'Pakistani Rupee',    'Rs',   true,  0],
            ['LKR', 'Sri Lankan Rupee',   'Rs',   true,  0],
            ['EGP', 'Egyptian Pound',     'E£',   true,  2],
            ['NGN', 'Nigerian Naira',     '₦',    true,  2],
            ['KES', 'Kenyan Shilling',    'KSh',  true,  2],
            ['ILS', 'Israeli Shekel',     '₪',    true,  2],
            ['QAR', 'Qatari Riyal',       'QAR ', true,  2],
            ['KWD', 'Kuwaiti Dinar',      'KWD ', true,  3],
            ['ARS', 'Argentine Peso',     'AR$',  true,  2],
            ['CLP', 'Chilean Peso',       'CLP$', true,  0],
            ['COP', 'Colombian Peso',     'COL$', true,  0],
            ['UAH', 'Ukrainian Hryvnia',  '₴',    false, 2],
            ['CZK', 'Czech Koruna',       'Kč',   false, 2],
            ['HUF', 'Hungarian Forint',   'Ft',   false, 0],
            ['RON', 'Romanian Leu',       'lei',  false, 2],
        ];

        foreach ($currencies as [$code, $name, $symbol, $before, $decimals]) {
            Currency::updateOrCreate(['code' => $code], [
                'name'                => $name,
                'symbol'              => $symbol,
                'symbol_before'       => $before,
                'decimals'            => $decimals,
                'thousands_separator' => ',',
                'decimal_separator'   => '.',
                'is_enabled'          => true,
            ]);
        }

        // country => [currency, display name]. The euro zone maps many
        // countries onto one currency, which is why the mapping is its own
        // table rather than a column on a countries list.
        $map = [
            'US' => ['USD', 'United States'],       'NP' => ['NPR', 'Nepal'],
            'IN' => ['INR', 'India'],               'GB' => ['GBP', 'United Kingdom'],
            'JP' => ['JPY', 'Japan'],               'AU' => ['AUD', 'Australia'],
            'CA' => ['CAD', 'Canada'],              'AE' => ['AED', 'United Arab Emirates'],
            'SA' => ['SAR', 'Saudi Arabia'],        'SG' => ['SGD', 'Singapore'],
            'NZ' => ['NZD', 'New Zealand'],         'CH' => ['CHF', 'Switzerland'],
            'CN' => ['CNY', 'China'],               'HK' => ['HKD', 'Hong Kong'],
            'KR' => ['KRW', 'South Korea'],         'BR' => ['BRL', 'Brazil'],
            'MX' => ['MXN', 'Mexico'],              'ZA' => ['ZAR', 'South Africa'],
            'SE' => ['SEK', 'Sweden'],              'NO' => ['NOK', 'Norway'],
            'DK' => ['DKK', 'Denmark'],             'PL' => ['PLN', 'Poland'],
            'TR' => ['TRY', 'Turkey'],              'RU' => ['RUB', 'Russia'],
            'ID' => ['IDR', 'Indonesia'],           'MY' => ['MYR', 'Malaysia'],
            'TH' => ['THB', 'Thailand'],            'PH' => ['PHP', 'Philippines'],
            'VN' => ['VND', 'Vietnam'],             'BD' => ['BDT', 'Bangladesh'],
            'PK' => ['PKR', 'Pakistan'],            'LK' => ['LKR', 'Sri Lanka'],
            'EG' => ['EGP', 'Egypt'],               'NG' => ['NGN', 'Nigeria'],
            'KE' => ['KES', 'Kenya'],               'IL' => ['ILS', 'Israel'],
            'QA' => ['QAR', 'Qatar'],               'KW' => ['KWD', 'Kuwait'],
            'AR' => ['ARS', 'Argentina'],           'CL' => ['CLP', 'Chile'],
            'CO' => ['COP', 'Colombia'],            'UA' => ['UAH', 'Ukraine'],
            'CZ' => ['CZK', 'Czechia'],             'HU' => ['HUF', 'Hungary'],
            'RO' => ['RON', 'Romania'],             'BT' => ['INR', 'Bhutan'],
            // Euro zone.
            'DE' => ['EUR', 'Germany'],   'FR' => ['EUR', 'France'],   'IT' => ['EUR', 'Italy'],
            'ES' => ['EUR', 'Spain'],     'NL' => ['EUR', 'Netherlands'], 'BE' => ['EUR', 'Belgium'],
            'AT' => ['EUR', 'Austria'],   'IE' => ['EUR', 'Ireland'],  'PT' => ['EUR', 'Portugal'],
            'FI' => ['EUR', 'Finland'],   'GR' => ['EUR', 'Greece'],   'SK' => ['EUR', 'Slovakia'],
            'SI' => ['EUR', 'Slovenia'],  'LT' => ['EUR', 'Lithuania'], 'LV' => ['EUR', 'Latvia'],
            'EE' => ['EUR', 'Estonia'],   'LU' => ['EUR', 'Luxembourg'], 'MT' => ['EUR', 'Malta'],
            'CY' => ['EUR', 'Cyprus'],    'HR' => ['EUR', 'Croatia'],
        ];

        foreach ($map as $country => [$currency, $name]) {
            CountryCurrencyMap::updateOrCreate(['country_code' => $country], [
                'currency_code' => $currency,
                'country_name'  => $name,
                'is_enabled'    => true,
            ]);
        }

        /**
         * Default rounding per currency. Zero-decimal currencies round up to a
         * whole unit; two-decimal ones land on a .99 charm price, which is what
         * "689.23 → 699" in the brief describes.
         *
         * country_code null = applies to that currency everywhere. A row WITH a
         * country beats it, so a single market can be tuned without disturbing
         * the rest.
         */
        $rules = [
            ['USD', 'charm', 1,   0.01],
            ['EUR', 'charm', 1,   0.01],
            ['GBP', 'charm', 1,   0.01],
            ['NPR', 'up',    10,  1],     // 689.23 → 699
            ['INR', 'up',    10,  1],     // 399.18 → 399 … 409-1
            ['JPY', 'up',    10,  0],     // 578 → 580
            ['KRW', 'up',    100, 0],
            ['IDR', 'up',    1000, 0],
            ['VND', 'up',    1000, 0],
        ];

        foreach ($rules as [$code, $strategy, $step, $charm]) {
            RoundingRule::updateOrCreate(
                ['country_code' => null, 'currency_code' => $code],
                ['strategy' => $strategy, 'step' => $step, 'charm_delta' => $charm, 'is_enabled' => true],
            );
        }
    }
}
