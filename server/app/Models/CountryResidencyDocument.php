<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CountryResidencyDocument extends Model
{
    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_APPROVED       = 'approved';
    public const STATUS_REJECTED       = 'rejected';

    public const ACCEPTED_TYPES = [
        'passport', 'visa', 'residence_permit', 'national_id',
        'utility_bill', 'bank_statement', 'lease_agreement', 'other',
    ];

    protected $fillable = [
        'user_id',
        'requested_country_code',
        'requested_country_name',
        'document_type',
        'file_path',
        'file_original_name',
        'file_mime',
        'file_size_bytes',
        'residing_since',
        'user_note',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
    ];

    protected $casts = [
        'residing_since' => 'date',
        'reviewed_at'    => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
