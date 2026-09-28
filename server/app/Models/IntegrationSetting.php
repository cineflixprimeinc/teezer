<?php

namespace App\Models;

use App\Casts\EncryptedJson;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stored configuration for one third-party integration.
 *
 * Reading configuration should almost always go through
 * App\Services\Integrations\IntegrationRegistry::config(), not through this
 * model directly - the registry is what layers the database value over the .env
 * fallback and the provider defaults. Using the model raw gets you the database
 * half only, which is empty for every provider nobody has saved in the UI yet.
 */
class IntegrationSetting extends Model
{
    protected $fillable = [
        'provider', 'enabled', 'credentials', 'settings',
        'status', 'last_connected_at', 'last_tested_at', 'last_error',
        'usage', 'token_expires_at', 'updated_by',
    ];

    protected $casts = [
        // Encrypted at rest. Bound to APP_KEY - rotating it without
        // APP_PREVIOUS_KEYS makes every stored credential unreadable.
        'credentials'       => EncryptedJson::class,
        'settings'          => 'array',
        'usage'             => 'array',
        'enabled'           => 'boolean',
        'last_connected_at' => 'datetime',
        'last_tested_at'    => 'datetime',
        'token_expires_at'  => 'datetime',
    ];

    /**
     * Credentials must never be serialised into an API response. `$hidden` is a
     * backstop, not the mechanism - the controller returns masked previews and
     * never the model - but a future `return $setting` somewhere else should not
     * be able to leak a client secret by accident.
     */
    protected $hidden = ['credentials'];

    public const STATUS_UNTESTED  = 'untested';
    public const STATUS_CONNECTED = 'connected';
    public const STATUS_FAILED    = 'failed';

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Record the outcome of a connection test.
     *
     * $error must already be redacted by the caller. Provider errors routinely
     * quote the credential that failed ("invalid client_secret: sk_live_..."),
     * and this column is rendered in the admin UI.
     */
    public function recordTest(bool $ok, ?string $error = null): void
    {
        $this->status        = $ok ? self::STATUS_CONNECTED : self::STATUS_FAILED;
        $this->last_tested_at = now();
        $this->last_error    = $ok ? null : $error;

        if ($ok) {
            $this->last_connected_at = now();
        }

        $this->save();
    }

    /**
     * Bump the rolling usage counters shown on the dashboard.
     *
     * Counters live in a json blob rather than their own table because this is a
     * readout, not billing data - a row per API call would cost more than the
     * calls it counts.
     */
    public function recordCall(bool $ok): void
    {
        $usage = $this->usage ?? [];
        $today = now()->toDateString();

        if (($usage['date'] ?? null) !== $today) {
            // Rolls daily, keeping only yesterday for the trend arrow.
            $usage = ['date' => $today, 'calls' => 0, 'errors' => 0, 'previous' => $usage['calls'] ?? 0];
        }

        $usage['calls'] = ($usage['calls'] ?? 0) + 1;
        if (! $ok) {
            $usage['errors'] = ($usage['errors'] ?? 0) + 1;
        }

        $this->usage = $usage;
        $this->saveQuietly();
    }
}
