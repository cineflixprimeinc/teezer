<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only history for everything that happens to a licence.
 *
 * Separate from admin_action_logs on purpose: this stream has THREE kinds of
 * actor, only one of which is an admin -
 *   'admin'    - a human clicked Suspend/Revoke/Reset in the panel
 *   'customer' - the installer or the update command acted with a licence key
 *   'system'   - a scheduled job expired or reconciled something
 * admin_action_logs models an admin_id and nothing else, so customer- and
 * system-originated events would have to be logged as a null admin, which
 * makes the admin trail less trustworthy rather than more.
 *
 * NOTHING SECRET IS EVER WRITTEN HERE. No plaintext purchase code, no licence
 * key, no token, no signature. `metadata` is for identifiers and outcomes.
 *
 * LICENSOR-SIDE ONLY.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('license_audit_logs', function (Blueprint $table) {
            $table->id();

            // Nullable: a failed activation attempt has no licence yet, and
            // that is exactly the case worth recording.
            $table->foreignId('license_id')->nullable()->constrained('licenses')->nullOnDelete();

            $table->string('actor_type', 20)->default('system');
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('action', 60)->index();
            $table->string('description', 500)->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('severity', 20)->default('info');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['license_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('license_audit_logs');
    }
};
