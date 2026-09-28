<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Idempotency ledger for provider webhooks. api.video's webhook payload
 * carries no event id of its own (confirmed against their current docs -
 * just type/videoId/quality/emittedAt), so dedup_key is computed by us:
 * sha256(type|videoId|quality|emittedAt). The unique constraint is the whole
 * mechanism - a replayed or duplicate-delivered webhook hits it, the insert
 * fails, and the controller treats that as "already processed, return 200"
 * rather than reprocessing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_processing_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 32);
            $table->string('dedup_key', 64);
            $table->foreignId('video_processing_job_id')->nullable()
                ->constrained('video_processing_jobs')->nullOnDelete();
            $table->json('payload');
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'dedup_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('video_processing_webhook_events');
    }
};
