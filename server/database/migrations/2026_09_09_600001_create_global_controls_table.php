<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Global Reelsoo Control — the value store behind GlobalControlRegistry.
 *
 * One row per control key (the registry declares which keys are real; a row
 * for a key not in the registry is inert data, never read). Unlike
 * app_settings, every row here carries the audit/temporary-restriction
 * metadata the feature needs directly, rather than reaching into
 * AdminActionLog for it on every read: previous_value + changed_reason let
 * the admin UI show "why" without a join, and expires_at + restore_value are
 * what the scheduled restore command acts on.
 *
 * `enabled` defaults true, matching PlatformSettings' documented rule: an
 * install that has never touched this page must behave exactly as it does
 * today, so nothing here may default a currently-open capability to closed.
 * The four true emergency-only rows are seeded false by the registry/service
 * on first read instead of here, since a migration should not hardcode
 * product defaults that belong in one place (the registry).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('global_controls', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->boolean('enabled')->default(true);
            $table->boolean('previous_value')->nullable();
            $table->string('changed_reason', 500)->nullable();
            $table->unsignedBigInteger('changed_by')->nullable();
            $table->foreign('changed_by')->references('id')->on('users')->nullOnDelete();
            $table->timestamp('changed_at')->nullable();

            // Temporary restriction (spec §28): when expires_at passes, the
            // scheduled restore command sets `enabled` back to restore_value
            // and clears both columns. NULL expires_at means "until manually
            // changed" - the default, and the common case.
            $table->timestamp('expires_at')->nullable();
            $table->boolean('restore_value')->nullable();

            $table->timestamps();

            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('global_controls');
    }
};
