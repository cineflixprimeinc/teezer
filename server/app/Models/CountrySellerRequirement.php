<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Admin-configurable required-fields/required-documents list per
 * (country_code, seller_type). See the migration's docblock for the '*'
 * fallback row and why this exists as data rather than per-country code
 * branches in the seller-application controller/wizard.
 */
class CountrySellerRequirement extends Model
{
    public const FALLBACK_COUNTRY = '*';

    protected $fillable = ['country_code', 'seller_type', 'required_fields', 'required_documents', 'requires_tax_form'];

    protected function casts(): array
    {
        return [
            'required_fields'    => 'array',
            'required_documents' => 'array',
            'requires_tax_form'  => 'boolean',
        ];
    }

    /** The requirement row for a given country+seller_type, falling back to '*' if the country isn't explicitly configured. */
    public static function resolve(string $countryCode, string $sellerType): ?self
    {
        return static::where('seller_type', $sellerType)
            ->where('country_code', strtoupper($countryCode))
            ->first()
            ?? static::where('seller_type', $sellerType)
                ->where('country_code', self::FALLBACK_COUNTRY)
                ->first();
    }
}
