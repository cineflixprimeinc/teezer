<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only double-entry money log. Rows are never updated or deleted after creation.
 */
class AdLedgerEntry extends Model
{
    protected $table = 'ad_ledger';

    protected $fillable = [
        'ad_account_id', 'entry_type', 'amount_cents', 'balance_after_cents', 'currency',
        'campaign_id', 'ref', 'description', 'meta',
    ];

    protected $casts = [
        'amount_cents'        => 'integer',
        'balance_after_cents' => 'integer',
        'meta'                => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(AdAccount::class, 'ad_account_id');
    }
}
