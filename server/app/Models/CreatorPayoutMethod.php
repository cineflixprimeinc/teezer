<?php

namespace App\Models;

use App\Casts\EncryptedJson;
use Illuminate\Database\Eloquent\Model;

class CreatorPayoutMethod extends Model
{
    protected $fillable = [
        'user_id', 'provider', 'account_email', 'masked_account', 'details', 'is_default',
    ];

    protected function casts(): array
    {
        // `details` carries bank account numbers and wallet phone numbers, so it
        // is encrypted at rest - the same treatment tax_forms.tax_id already gets.
        return ['is_default' => 'boolean', 'details' => EncryptedJson::class];
    }

    public function user() { return $this->belongsTo(User::class); }
}
