<?php

namespace App\Services;

/**
 * Seeds a sensible default feed/UI language from a signup country when the user
 * hasn't chosen one. Conservative on purpose: only well-known country→language
 * pairs are mapped, and anything unmapped stays English. The user can always
 * change it in Settings, so this only improves the first-run default.
 */
class LanguageDefaults
{
    /** ISO-3166-1 alpha-2 country → ISO-639-1 language. */
    private const MAP = [
        // South Asia
        'NP' => 'ne', 'IN' => 'hi', 'PK' => 'ur', 'BD' => 'bn', 'LK' => 'si',
        // East / SE Asia
        'CN' => 'zh', 'TW' => 'zh', 'HK' => 'zh', 'JP' => 'ja', 'KR' => 'ko',
        'TH' => 'th', 'VN' => 'vi', 'ID' => 'id', 'MY' => 'ms', 'PH' => 'en',
        // Middle East / Arabic
        'SA' => 'ar', 'AE' => 'ar', 'EG' => 'ar', 'IQ' => 'ar', 'JO' => 'ar',
        'KW' => 'ar', 'QA' => 'ar', 'OM' => 'ar', 'MA' => 'ar', 'DZ' => 'ar',
        'IR' => 'fa', 'TR' => 'tr', 'IL' => 'he',
        // Europe
        'ES' => 'es', 'MX' => 'es', 'AR' => 'es', 'CO' => 'es', 'CL' => 'es',
        'PE' => 'es', 'FR' => 'fr', 'DE' => 'de', 'AT' => 'de', 'IT' => 'it',
        'PT' => 'pt', 'BR' => 'pt', 'RU' => 'ru', 'UA' => 'uk', 'PL' => 'pl',
        'NL' => 'nl', 'SE' => 'sv', 'NO' => 'no', 'DK' => 'da', 'FI' => 'fi',
        'GR' => 'el', 'RO' => 'ro', 'HU' => 'hu', 'CZ' => 'cs',
        // English-first
        'US' => 'en', 'GB' => 'en', 'CA' => 'en', 'AU' => 'en', 'NZ' => 'en',
        'IE' => 'en', 'ZA' => 'en', 'NG' => 'en', 'KE' => 'en',
    ];

    /** Language for a country, or null when unmapped (caller keeps its default). */
    public static function forCountry(?string $countryCode): ?string
    {
        $code = strtoupper((string) $countryCode);
        return self::MAP[$code] ?? null;
    }
}
