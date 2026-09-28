<?php

namespace App\Models;

use App\Casts\EncryptedJson;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A seller's private legal identity - see the migration's docblock for why
 * this is a separate table from Shop. Never read by a public endpoint.
 */
class SellerProfile extends Model
{
    protected $fillable = ['shop_id', 'legal_data', 'agreements', 'current_step', 'submitted_at', 'admin_note'];

    protected function casts(): array
    {
        return [
            'legal_data'   => EncryptedJson::class,
            'agreements'   => 'array',
            'submitted_at' => 'datetime',
        ];
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
