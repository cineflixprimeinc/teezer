<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Live streaming - the tables behind /live.
 *
 * Deliberately its own domain rather than an extension of `spaces`: a Space is
 * an audio room whose participants can all be promoted to speak, while a stream
 * has exactly one broadcaster and an audience. Sharing one table would mean
 * every column being nullable for half the rows, and every query filtering on a
 * type discriminator.
 *
 * The control columns (`chat_enabled`, `gifts_enabled`, `slow_mode_seconds`,
 * `replay_enabled`, `is_featured`, `banned_at`) live on the stream itself so a
 * moderator's decision survives a reconnect and applies to every viewer at
 * once. Every one of them is also the single place the client asks "may I do
 * this?", instead of each surface re-deriving the rule.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('live_streams', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->string('category', 60)->nullable();
            $table->string('thumbnail_url', 500)->nullable();

            /* draft → scheduled → live → ended. `banned` is terminal and only an
               admin can set it; it is kept distinct from `ended` so the reason
               survives and the row can be audited. */
            $table->string('status', 20)->default('draft')->index();
            $table->string('visibility', 20)->default('public');

            /* Ingest. `ingest_key` is the broadcaster's secret - never exposed
               by any resource except to the owner. `room_name` is the LiveKit
               room the publisher and viewers join. */
            $table->string('room_name', 120)->nullable()->unique();
            $table->string('ingest_key', 64)->nullable()->unique();
            $table->string('playback_url', 500)->nullable();

            $table->timestamp('scheduled_for')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();

            /* Counters. `viewers_now` is presence and is recomputed, never
               incremented blindly - a dropped connection must not leak a viewer. */
            $table->unsignedInteger('viewers_now')->default(0);
            $table->unsignedInteger('peak_viewers')->default(0);
            $table->unsignedInteger('total_views')->default(0);
            $table->unsignedInteger('likes_count')->default(0);
            $table->unsignedBigInteger('gift_coins')->default(0);

            /* Per-stream controls - the "small things" a host or admin toggles. */
            $table->boolean('chat_enabled')->default(true);
            $table->boolean('gifts_enabled')->default(true);
            $table->boolean('replay_enabled')->default(true);
            $table->boolean('followers_only_chat')->default(false);
            $table->unsignedSmallInteger('slow_mode_seconds')->default(0);
            $table->unsignedSmallInteger('min_account_age_days')->default(0);

            /* Admin-only. */
            $table->boolean('is_featured')->default(false);
            $table->timestamp('featured_at')->nullable();
            $table->timestamp('banned_at')->nullable();
            $table->string('banned_reason', 300)->nullable();
            $table->foreignId('banned_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('replay_url', 500)->nullable();
            $table->timestamps();
            $table->softDeletes();

            // The browse grid: live first, biggest audience first.
            $table->index(['status', 'viewers_now']);
            $table->index(['user_id', 'status']);
            $table->index('scheduled_for');
        });

        /* Presence. One open row per viewer per stream; `left_at` closes it, so
           "who is watching" is a query rather than a counter that can drift. */
        Schema::create('live_stream_viewers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('guest_key', 64)->nullable();
            $table->timestamp('joined_at')->useCurrent();
            $table->timestamp('left_at')->nullable();
            $table->unsignedInteger('watch_seconds')->default(0);

            $table->index(['live_stream_id', 'left_at']);
            $table->index(['live_stream_id', 'user_id']);
        });

        Schema::create('live_stream_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            /** Set when the message IS a gift, so the chat can render it richly. */
            $table->unsignedBigInteger('gift_coins')->nullable();
            $table->boolean('is_pinned')->default(false);
            $table->foreignId('removed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('removed_at')->nullable();
            $table->timestamps();

            $table->index(['live_stream_id', 'id']);
        });

        /* Who may moderate someone else's stream. The host is implicit and is
           never listed here. */
        Schema::create('live_stream_moderators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['live_stream_id', 'user_id']);
        });

        /* A timeout and a ban are the same row: a ban is a timeout with no end. */
        Schema::create('live_stream_bans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reason', 300)->nullable();
            /** Null = permanent for this stream. */
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->unique(['live_stream_id', 'user_id']);
            $table->index('expires_at');
        });

        /* The audit trail. Every control action writes one row, so "who muted
           chat / featured this / ended it" is answerable after the fact. */
        Schema::create('live_stream_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('live_stream_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 60);
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['live_stream_id', 'id']);
            $table->index('action');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_stream_events');
        Schema::dropIfExists('live_stream_bans');
        Schema::dropIfExists('live_stream_moderators');
        Schema::dropIfExists('live_stream_messages');
        Schema::dropIfExists('live_stream_viewers');
        Schema::dropIfExists('live_streams');
    }
};
