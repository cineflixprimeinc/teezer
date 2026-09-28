<?php

namespace App\Models;

use App\Services\MediaPresignService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One uploaded verification document. `file_key` is a private StorageService
 * key - see VerificationRequest's own signed-URL accessors for the pattern
 * this mirrors. Never expose `file_key` itself to a client; always resolve
 * through signedUrl() so access is time-limited and only ever handed to
 * whoever the caller has already authorized (the seller, or an admin).
 */
class SellerDocument extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = ['shop_id', 'document_key', 'file_key', 'status', 'admin_note'];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    /** A short-lived signed URL - only call this for a viewer already known to be authorized. */
    public function signedUrl(int $ttlMinutes = 30): ?string
    {
        if (!$this->file_key) {
            return null;
        }

        return app(MediaPresignService::class)->signedCdnUrl($this->file_key, $ttlMinutes);
    }
}
