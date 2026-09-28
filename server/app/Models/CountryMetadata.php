<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per ISO 3166-1 alpha-2 country code, sourced from countries.dev
 * and refreshed by the countries:sync command - see the migration's
 * docblock for how this stays separate from CountryAvailability (policy).
 */
class CountryMetadata extends Model
{
    protected $table = 'country_metadata';

    protected $fillable = [
        'country_code', 'alpha3_code', 'numeric_code', 'name', 'native_name',
        'region', 'subregion', 'capital', 'population', 'area_km2',
        'population_density', 'flag_emoji', 'flag_svg_url', 'latitude', 'longitude',
        'calling_codes', 'top_level_domains', 'currencies', 'languages',
        'timezones', 'borders', 'independent', 'raw_payload', 'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'population'          => 'integer',
            'area_km2'            => 'float',
            'population_density'  => 'float',
            'latitude'            => 'float',
            'longitude'           => 'float',
            'calling_codes'       => 'array',
            'top_level_domains'   => 'array',
            'currencies'          => 'array',
            'languages'           => 'array',
            'timezones'           => 'array',
            'borders'             => 'array',
            'independent'         => 'boolean',
            'raw_payload'         => 'array',
            'synced_at'           => 'datetime',
        ];
    }
}
