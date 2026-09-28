<?php

namespace App\Models;

use App\Services\MediaPresignService;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

class VerificationRequest extends Model
{
    /** The blue tick: paid subscription plus an ID review. */
    public const PURPOSE_BADGE = 'badge';

    /**
     * An ID review only - free, and it grants NO tick. It exists so a creator
     * can satisfy the "identity verified" requirement on a monetization
     * programme without buying a badge to reach their own earnings.
     */
    public const PURPOSE_IDENTITY = 'identity';

    /**
     * How long a document link stays valid. Long enough for a reviewer to read a passport,
     * short enough that a leaked link (browser history, a screenshot of the URL bar, a
     * proxy log) is worthless within the hour.
     */
    private const DOC_URL_TTL_MINUTES = 30;
    protected $fillable = [
        'user_id', 'plan_id', 'verification_step',
        'full_name', 'phone', 'brand_name', 'category',
        'document_url', 'document_key', 'selfie_url', 'selfie_key',
        'supporting_doc_url', 'supporting_doc_key',
        'reason', 'status', 'purpose', 'rejection_reason', 'reviewed_by', 'reviewed_at',
        'social_links', 'website', 'country', 'expires_at', 'is_permanent',
        'revoked_at', 'revoke_reason', 'revoked_by',
    ];

    protected function casts(): array
    {
        return [
            'reviewed_at'  => 'datetime',
            'expires_at'   => 'datetime',
            'revoked_at'   => 'datetime',
            'is_permanent' => 'boolean',
            'social_links' => 'array',
        ];
    }

    /* ── Identity documents ──────────────────────────────────────────────────
     *
     * These are passports, national IDs and selfies. They were being stored on the same
     * PUBLIC bucket as videos and handed out as permanent, unauthenticated CDN links -
     * anyone who ever saw the URL (an admin's browser history, a log, a Referer header,
     * a CDN cache) could read someone's passport forever.
     *
     * The URL is now SIGNED and EXPIRING, derived at read time from the stored object
     * key. Doing it as an accessor rather than at each call site means every consumer -
     * the admin list, the 360 profile tab, any future endpoint - gets the safe URL
     * without having to remember to ask for it. Forgetting is exactly how this happened.
     *
     * The raw *_key columns remain the source of truth; *_url in the database is now
     * only a legacy fallback for rows uploaded before the keys were stored.
     */

    protected function documentUrl(): Attribute
    {
        return Attribute::get(fn ($value) => $this->signedDoc($this->document_key, $value));
    }

    protected function selfieUrl(): Attribute
    {
        return Attribute::get(fn ($value) => $this->signedDoc($this->selfie_key, $value));
    }

    protected function supportingDocUrl(): Attribute
    {
        return Attribute::get(fn ($value) => $this->signedDoc($this->supporting_doc_key, $value));
    }

    /**
     * A signed, expiring link for one document.
     *
     * Falls back to the stored raw URL only when no key was recorded (pre-key rows). That
     * fallback is still public - the CDN worker is what actually closes it - but it means
     * an old row degrades to "visible to the reviewer" rather than "broken".
     */
    private function signedDoc(?string $key, ?string $rawUrl): ?string
    {
        if (! $key) {
            return $rawUrl;
        }

        try {
            return app(MediaPresignService::class)->signedCdnUrl($key, self::DOC_URL_TTL_MINUTES);
        } catch (\Throwable $e) {
            // Never let a signing failure hide a document from a reviewer mid-review -
            // but a silent fallback here reproduces the exact bug this accessor exists
            // to fix (a stale, long-expired URL served with no explanation), just with
            // no trace of why. Log it so a real signing failure is diagnosable instead
            // of looking identical to "reviewer can't open documents" with no cause.
            Log::warning('VerificationRequest: document URL signing failed, falling back to stored URL', [
                'verification_request_id' => $this->id,
                'key'                     => $key,
                'error'                   => $e->getMessage(),
            ]);
            return $rawUrl;
        }
    }

    /** The two ways a badge can be granted. */
    public const MODE_SUBSCRIPTION = 'subscription';
    public const MODE_PERMANENT    = 'permanent';

    /**
     * How long an approved badge lasts, per plan.
     *
     * basic/plus/business are all billed monthly (see BV_PLANS on the web); `monthly`
     * and `annual` are the legacy ids the API still accepts. Anything unrecognised
     * falls back to a month rather than granting an accidental year.
     */
    public static function planDurationMonths(?string $planId): int
    {
        return $planId === 'annual' ? 12 : 1;
    }

    /** The badge was granted and later taken back. Distinct from never granted. */
    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    /**
     * Staff / official accounts: verified, never billed, never expires.
     *
     * A revoked badge is not permanent no matter what the flag says - the grant is over.
     */
    public function isPermanent(): bool
    {
        return $this->status === 'approved'
            && $this->is_permanent === true
            && ! $this->isRevoked();
    }

    /**
     * Renewal date for an approved SUBSCRIPTION badge.
     *
     * Null for a permanent badge (there is nothing to renew) and null for one approved
     * before expiry was tracked (we don't know). Those two are NOT the same thing, and
     * the clients tell them apart with `is_permanent` - which is exactly why permanent
     * needed its own column rather than reusing a null date.
     */
    public function renewsAt(): ?\Illuminate\Support\Carbon
    {
        if ($this->status !== 'approved' || $this->isPermanent() || $this->isRevoked()) {
            return null;
        }

        return $this->expires_at;
    }

    /**
     * True once an approved subscription badge is past its renewal date.
     *
     * A revoked badge has NOT "lapsed" - it was taken away. Telling its former owner to
     * renew would be both wrong and insulting.
     */
    public function hasLapsed(): bool
    {
        return $this->status === 'approved'
            && ! $this->isPermanent()
            && ! $this->isRevoked()
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }

    public function user()     { return $this->belongsTo(User::class); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }

    public function scopePending($query)  { return $query->where('status', 'pending'); }
    public function scopeApproved($query) { return $query->where('status', 'approved'); }
    public function scopeRejected($query) { return $query->where('status', 'rejected'); }
}
