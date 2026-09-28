<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * One attested App Attest key. See the migration for why user_id is not an
 * authorization input.
 */
class AppAttestDevice extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id', 'key_id', 'public_key', 'environment',
        'bundle_id', 'team_id', 'receipt', 'last_counter',
        'status', 'attested_at', 'last_seen_at',
    ];

    protected $casts = [
        'last_counter' => 'integer',
        'attested_at'  => 'datetime',
        'last_seen_at' => 'datetime',
    ];

    /**
     * Never serialise the trust material. Nothing returns this model to a
     * client today, and this makes sure a future `return $device` cannot
     * quietly start handing out the key material and the receipt.
     */
    protected $hidden = ['public_key', 'receipt'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Advance the replay counter, but only if it really is an advance.
     *
     * Apple's rule is that the assertion counter strictly increases, so a
     * replayed assertion carries a counter we have already seen. The obvious
     * implementation - read, compare in PHP, write - has a race that breaks
     * BOTH ways under the concurrency a feed app produces: two legitimate
     * in-flight requests can read the same previous value and each conclude the
     * other is a replay, and two replays of the same captured assertion can
     * both pass before either writes.
     *
     * So the comparison and the write are one statement, and the database
     * decides. A single UPDATE ... WHERE last_counter < ? is atomic on
     * Postgres; the affected-row count is the answer. No transaction, no
     * SELECT ... FOR UPDATE, no lock held across verification.
     *
     * Returns true when this assertion won the race and the counter moved.
     */
    public function advanceCounter(int $counter): bool
    {
        $updated = DB::table($this->getTable())
            ->where('id', $this->id)
            ->where('last_counter', '<', $counter)
            ->update([
                'last_counter' => $counter,
                'last_seen_at' => now(),
                'updated_at'   => now(),
            ]);

        if ($updated > 0) {
            $this->last_counter = $counter;
        }

        return $updated > 0;
    }
}
