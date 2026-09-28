<?php

namespace App\Services;

/**
 * ISO 3166-1 alpha-2 -> region, for the admin Country Availability page's
 * region column/filter only - never exposed on the public /detect-country
 * or /countries/availability endpoints, since signup/login have no use for
 * it. A plain static array, same style as IsoCountries::map() (no external
 * lookup, no table, no countries.dev - none of that exists in this app; see
 * CountryAvailabilityService's own docblock).
 *
 * Covers every code IsoCountries::map() defines - kept in the same
 * alphabetical clusters as that file so the two are easy to eyeball against
 * each other. A standard 6-region classification (continents, with the
 * Americas split North/South and the Caribbean folded into North America -
 * the common convention); a code IsoCountries knows about but this file
 * doesn't falls back to "Other" rather than throwing, so a future addition
 * to IsoCountries never breaks the admin page while this file catches up.
 */
class CountryRegions
{
    public const AFRICA        = 'Africa';
    public const ASIA          = 'Asia';
    public const EUROPE        = 'Europe';
    public const NORTH_AMERICA = 'North America';
    public const SOUTH_AMERICA = 'South America';
    public const OCEANIA       = 'Oceania';
    public const OTHER         = 'Other';

    /** @var array<string, string>|null */
    private static ?array $map = null;

    public static function map(): array
    {
        if (self::$map !== null) {
            return self::$map;
        }

        self::$map = [
            'AF' => self::ASIA, 'AL' => self::EUROPE, 'DZ' => self::AFRICA, 'AS' => self::OCEANIA,
            'AD' => self::EUROPE, 'AO' => self::AFRICA, 'AI' => self::NORTH_AMERICA, 'AQ' => self::OTHER,
            'AG' => self::NORTH_AMERICA, 'AR' => self::SOUTH_AMERICA, 'AM' => self::ASIA, 'AW' => self::NORTH_AMERICA,
            'AU' => self::OCEANIA, 'AT' => self::EUROPE, 'AZ' => self::ASIA,
            'BS' => self::NORTH_AMERICA, 'BH' => self::ASIA, 'BD' => self::ASIA, 'BB' => self::NORTH_AMERICA,
            'BY' => self::EUROPE, 'BE' => self::EUROPE, 'BZ' => self::NORTH_AMERICA, 'BJ' => self::AFRICA,
            'BM' => self::NORTH_AMERICA, 'BT' => self::ASIA, 'BO' => self::SOUTH_AMERICA, 'BA' => self::EUROPE,
            'BW' => self::AFRICA, 'BV' => self::OTHER, 'BR' => self::SOUTH_AMERICA,
            'IO' => self::ASIA, 'BN' => self::ASIA, 'BG' => self::EUROPE,
            'BF' => self::AFRICA, 'BI' => self::AFRICA,
            'CV' => self::AFRICA, 'KH' => self::ASIA, 'CM' => self::AFRICA, 'CA' => self::NORTH_AMERICA,
            'KY' => self::NORTH_AMERICA, 'CF' => self::AFRICA, 'TD' => self::AFRICA,
            'CL' => self::SOUTH_AMERICA, 'CN' => self::ASIA, 'CX' => self::ASIA, 'CC' => self::ASIA,
            'CO' => self::SOUTH_AMERICA, 'KM' => self::AFRICA, 'CG' => self::AFRICA, 'CD' => self::AFRICA,
            'CK' => self::OCEANIA, 'CR' => self::NORTH_AMERICA, 'CI' => self::AFRICA, 'HR' => self::EUROPE,
            'CU' => self::NORTH_AMERICA, 'CW' => self::NORTH_AMERICA, 'CY' => self::EUROPE, 'CZ' => self::EUROPE,
            'DK' => self::EUROPE, 'DJ' => self::AFRICA, 'DM' => self::NORTH_AMERICA, 'DO' => self::NORTH_AMERICA,
            'EC' => self::SOUTH_AMERICA, 'EG' => self::AFRICA, 'SV' => self::NORTH_AMERICA, 'GQ' => self::AFRICA,
            'ER' => self::AFRICA, 'EE' => self::EUROPE, 'SZ' => self::AFRICA, 'ET' => self::AFRICA,
            'FK' => self::SOUTH_AMERICA, 'FO' => self::EUROPE, 'FJ' => self::OCEANIA, 'FI' => self::EUROPE,
            'FR' => self::EUROPE, 'GF' => self::SOUTH_AMERICA, 'PF' => self::OCEANIA,
            'TF' => self::OTHER,
            'GA' => self::AFRICA, 'GM' => self::AFRICA, 'GE' => self::ASIA, 'DE' => self::EUROPE,
            'GH' => self::AFRICA, 'GI' => self::EUROPE, 'GR' => self::EUROPE, 'GL' => self::NORTH_AMERICA,
            'GD' => self::NORTH_AMERICA, 'GP' => self::NORTH_AMERICA, 'GU' => self::OCEANIA, 'GT' => self::NORTH_AMERICA,
            'GG' => self::EUROPE, 'GN' => self::AFRICA, 'GW' => self::AFRICA, 'GY' => self::SOUTH_AMERICA,
            'HT' => self::NORTH_AMERICA, 'HM' => self::OTHER, 'HN' => self::NORTH_AMERICA,
            'HK' => self::ASIA, 'HU' => self::EUROPE,
            'IS' => self::EUROPE, 'IN' => self::ASIA, 'ID' => self::ASIA, 'IR' => self::ASIA,
            'IQ' => self::ASIA, 'IE' => self::EUROPE, 'IM' => self::EUROPE, 'IL' => self::ASIA,
            'IT' => self::EUROPE, 'JM' => self::NORTH_AMERICA, 'JP' => self::ASIA, 'JE' => self::EUROPE, 'JO' => self::ASIA,
            'KZ' => self::ASIA, 'KE' => self::AFRICA, 'KI' => self::OCEANIA, 'KP' => self::ASIA,
            'KR' => self::ASIA, 'KW' => self::ASIA, 'KG' => self::ASIA,
            'LA' => self::ASIA, 'LV' => self::EUROPE, 'LB' => self::ASIA, 'LS' => self::AFRICA,
            'LR' => self::AFRICA, 'LY' => self::AFRICA, 'LI' => self::EUROPE, 'LT' => self::EUROPE,
            'LU' => self::EUROPE,
            'MO' => self::ASIA, 'MG' => self::AFRICA, 'MW' => self::AFRICA, 'MY' => self::ASIA,
            'MV' => self::ASIA, 'ML' => self::AFRICA, 'MT' => self::EUROPE, 'MH' => self::OCEANIA,
            'MQ' => self::NORTH_AMERICA, 'MR' => self::AFRICA, 'MU' => self::AFRICA, 'YT' => self::AFRICA,
            'MX' => self::NORTH_AMERICA, 'FM' => self::OCEANIA, 'MD' => self::EUROPE, 'MC' => self::EUROPE,
            'MN' => self::ASIA, 'ME' => self::EUROPE, 'MS' => self::NORTH_AMERICA, 'MA' => self::AFRICA,
            'MZ' => self::AFRICA, 'MM' => self::ASIA,
            'NA' => self::AFRICA, 'NR' => self::OCEANIA, 'NP' => self::ASIA, 'NL' => self::EUROPE,
            'NC' => self::OCEANIA, 'NZ' => self::OCEANIA, 'NI' => self::NORTH_AMERICA, 'NE' => self::AFRICA,
            'NG' => self::AFRICA, 'NU' => self::OCEANIA, 'NF' => self::OCEANIA,
            'MK' => self::EUROPE, 'MP' => self::OCEANIA, 'NO' => self::EUROPE,
            'OM' => self::ASIA,
            'PK' => self::ASIA, 'PW' => self::OCEANIA, 'PS' => self::ASIA, 'PA' => self::NORTH_AMERICA,
            'PG' => self::OCEANIA, 'PY' => self::SOUTH_AMERICA, 'PE' => self::SOUTH_AMERICA, 'PH' => self::ASIA,
            'PN' => self::OCEANIA, 'PL' => self::EUROPE, 'PT' => self::EUROPE, 'PR' => self::NORTH_AMERICA,
            'QA' => self::ASIA, 'RE' => self::AFRICA, 'RO' => self::EUROPE, 'RU' => self::EUROPE, 'RW' => self::AFRICA,
            'BL' => self::NORTH_AMERICA, 'SH' => self::AFRICA, 'KN' => self::NORTH_AMERICA,
            'LC' => self::NORTH_AMERICA, 'MF' => self::NORTH_AMERICA, 'PM' => self::NORTH_AMERICA,
            'VC' => self::NORTH_AMERICA, 'WS' => self::OCEANIA, 'SM' => self::EUROPE,
            'ST' => self::AFRICA, 'SA' => self::ASIA, 'SN' => self::AFRICA,
            'RS' => self::EUROPE, 'SC' => self::AFRICA, 'SL' => self::AFRICA, 'SG' => self::ASIA,
            'SX' => self::NORTH_AMERICA, 'SK' => self::EUROPE, 'SI' => self::EUROPE, 'SB' => self::OCEANIA,
            'SO' => self::AFRICA, 'ZA' => self::AFRICA,
            'GS' => self::OTHER, 'SS' => self::AFRICA, 'ES' => self::EUROPE,
            'LK' => self::ASIA, 'SD' => self::AFRICA, 'SR' => self::SOUTH_AMERICA, 'SJ' => self::EUROPE,
            'SE' => self::EUROPE, 'CH' => self::EUROPE, 'SY' => self::ASIA,
            'TW' => self::ASIA, 'TJ' => self::ASIA, 'TZ' => self::AFRICA, 'TH' => self::ASIA,
            'TL' => self::ASIA, 'TG' => self::AFRICA, 'TK' => self::OCEANIA, 'TO' => self::OCEANIA,
            'TT' => self::NORTH_AMERICA, 'TN' => self::AFRICA, 'TR' => self::ASIA, 'TM' => self::ASIA,
            'TC' => self::NORTH_AMERICA, 'TV' => self::OCEANIA,
            'UG' => self::AFRICA, 'UA' => self::EUROPE, 'AE' => self::ASIA,
            'GB' => self::EUROPE, 'US' => self::NORTH_AMERICA, 'UM' => self::OCEANIA,
            'UY' => self::SOUTH_AMERICA, 'UZ' => self::ASIA,
            'VU' => self::OCEANIA, 'VA' => self::EUROPE, 'VE' => self::SOUTH_AMERICA, 'VN' => self::ASIA,
            'VG' => self::NORTH_AMERICA, 'VI' => self::NORTH_AMERICA,
            'WF' => self::OCEANIA, 'EH' => self::AFRICA,
            'YE' => self::ASIA, 'ZM' => self::AFRICA, 'ZW' => self::AFRICA,
        ];

        return self::$map;
    }

    public static function forCode(string $code): string
    {
        return self::map()[strtoupper($code)] ?? self::OTHER;
    }

    /** @return string[] every region name, for the admin filter dropdown. */
    public static function all(): array
    {
        return [self::AFRICA, self::ASIA, self::EUROPE, self::NORTH_AMERICA, self::SOUTH_AMERICA, self::OCEANIA, self::OTHER];
    }
}
