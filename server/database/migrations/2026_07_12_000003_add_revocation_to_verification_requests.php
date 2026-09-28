<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revocation: a badge taken back after it was granted.
 *
 * Recorded on the request rather than by flipping its status back to `rejected`.
 * A rejection and a revocation are different events - one says "we never granted
 * this", the other says "we granted it and then withdrew it" - and collapsing them
 * would erase the fact that the badge was ever live, which is exactly the thing an
 * audit would want to see.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->timestamp('revoked_at')->nullable()->after('is_permanent');
            $table->text('revoke_reason')->nullable()->after('revoked_at');
            $table->unsignedBigInteger('revoked_by')->nullable()->after('revoke_reason');
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn(['revoked_at', 'revoke_reason', 'revoked_by']);
        });
    }
};
