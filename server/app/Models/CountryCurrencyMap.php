<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Which currency a country is quoted in.
 *
 * `country_code` is ISO-3166-1 alpha-2, the same shape Cloudflare's
 * CF-IPCountry header sends, so a detected country needs no translation before
 * it is looked up here.
 */
class CountryCurrencyMap extends Model
{
    protected $table = 'country_currency_map';

    protected $fillable = ['country_code', 'currency_code', 'country_name', 'is_enabled'];

    protected function casts(): array
    {
        return ['is_enabled' => 'boolean'];
    }

    public function scopeEnabled($q)
    {
        return $q->where('is_enabled', true);
    }
}
