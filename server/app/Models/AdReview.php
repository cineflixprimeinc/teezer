<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdReview extends Model
{
    protected $fillable = [
        'subject_type', 'subject_id', 'reviewer_id', 'decision', 'reason', 'policy_flags',
    ];

    protected $casts = [
        'policy_flags' => 'array',
    ];

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }
}
