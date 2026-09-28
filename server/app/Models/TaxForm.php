<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A creator's submitted tax form. TIN fields are encrypted at rest. The document
 * storage keys are hidden from JSON - the API only ever exposes the owner's own
 * form data through toApiArray(), which returns the exact shape the mobile app's
 * TaxForm type expects.
 */
class TaxForm extends Model
{
    protected $fillable = [
        'user_id', 'submission_id', 'form_type', 'entity_kind', 'status',
        'first_name', 'middle_name', 'last_name', 'dob', 'citizenship',
        'residence_country', 'residence_tin', 'addr1', 'addr2', 'city',
        'tin_type', 'tax_id', 'identity_doc_key', 'address_doc_key',
        'review_note', 'reviewed_at',
    ];

    protected $casts = [
        'residence_tin' => 'encrypted',
        'tax_id'        => 'encrypted',
        'reviewed_at'   => 'datetime',
    ];

    protected $hidden = ['identity_doc_key', 'address_doc_key'];

    /** Canonical status → the display strings the mobile app renders. */
    public const STATUS_LABELS = [
        'under_review' => 'Under Review',
        'approved'     => 'Approved',
        'rejected'     => 'Rejected',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Shape consumed by the mobile app (src/store/tax-forms.store.ts TaxForm). */
    public function toApiArray(): array
    {
        return [
            'id'               => (string) $this->id,
            'submissionId'     => $this->submission_id,
            'formType'         => $this->form_type,
            'entityKind'       => $this->entity_kind,
            'status'           => self::STATUS_LABELS[$this->status] ?? 'Under Review',
            'submittedAt'      => $this->created_at ? $this->created_at->getTimestamp() * 1000 : null,
            'firstName'        => $this->first_name,
            'middleName'       => $this->middle_name ?? '',
            'lastName'         => $this->last_name,
            'dob'              => $this->dob ?? '',
            'citizenship'      => $this->citizenship ?? '',
            'residenceCountry' => $this->residence_country ?? '',
            'residenceTin'     => $this->residence_tin ?? '',
            'addr1'            => $this->addr1 ?? '',
            'addr2'            => $this->addr2 ?? '',
            'city'             => $this->city ?? '',
            'tinType'          => $this->tin_type ?? '',
            'taxId'            => $this->tax_id ?? '',
            'reviewNote'       => $this->review_note,
        ];
    }
}
