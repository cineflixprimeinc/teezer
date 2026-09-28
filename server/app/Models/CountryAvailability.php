<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per ISO 3166-1 alpha-2 country code - see the migration's docblock
 * for how this relates to (and stays separate from) CountryService's
 * 60-day lock system and CountryCurrencyMap's pricing table.
 */
class CountryAvailability extends Model
{
    protected $table = 'country_availability';

    protected $fillable = [
        'country_code', 'country_name', 'signup_enabled', 'login_enabled',
        'restriction_reason', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'signup_enabled' => 'boolean',
            'login_enabled'  => 'boolean',
        ];
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
