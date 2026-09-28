<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The full Create-Space form: everything the design lets a host decide up front.
 *
 * Grouped by what it drives:
 *   - discovery/display: topics (up to 3), tags, language, audience, share_to_feed
 *   - room behaviour (gated live): allow_speaker_requests, enable_chat,
 *     allow_reactions, enable_polls, qa_enabled, audience_limit
 *   - audio/capture flags (stored now, pipelines later): live_captions,
 *     noise_cancellation (is_recorded already exists on the base table)
 *   - moderation: content_warning, blocked_words
 *   - line-up: co_host_ids, speaker_ids - who the host invited on stage; join()
 *     reads these so an invitee comes in as a speaker, not a listener.
 *
 * `category` reuses the existing `topic` column (what the tab filters by); these
 * are the additions on top of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            $add = function (string $col, callable $def) use ($table) {
                if (! Schema::hasColumn('spaces', $col)) {
                    $def($table);
                }
            };

            $add('topics',        fn ($t) => $t->json('topics')->nullable());
            $add('tags',          fn ($t) => $t->json('tags')->nullable());
            $add('language',      fn ($t) => $t->string('language', 10)->default('en'));
            $add('audience',      fn ($t) => $t->string('audience', 10)->default('public')); // public | private
            $add('audience_limit', fn ($t) => $t->unsignedInteger('audience_limit')->nullable());

            $add('live_captions',          fn ($t) => $t->boolean('live_captions')->default(false));
            $add('noise_cancellation',     fn ($t) => $t->boolean('noise_cancellation')->default(true));
            $add('allow_speaker_requests', fn ($t) => $t->boolean('allow_speaker_requests')->default(true));
            $add('enable_chat',            fn ($t) => $t->boolean('enable_chat')->default(true));
            $add('allow_reactions',        fn ($t) => $t->boolean('allow_reactions')->default(true));
            $add('share_to_feed',          fn ($t) => $t->boolean('share_to_feed')->default(true));
            $add('enable_polls',           fn ($t) => $t->boolean('enable_polls')->default(false));
            $add('qa_enabled',             fn ($t) => $t->boolean('qa_enabled')->default(false));

            $add('content_warning', fn ($t) => $t->string('content_warning', 200)->nullable());
            $add('blocked_words',   fn ($t) => $t->text('blocked_words')->nullable());

            $add('co_host_ids', fn ($t) => $t->json('co_host_ids')->nullable());
            $add('speaker_ids', fn ($t) => $t->json('speaker_ids')->nullable());
        });
    }

    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            foreach ([
                'topics', 'tags', 'language', 'audience', 'audience_limit',
                'live_captions', 'noise_cancellation', 'allow_speaker_requests',
                'enable_chat', 'allow_reactions', 'share_to_feed', 'enable_polls', 'qa_enabled',
                'content_warning', 'blocked_words', 'co_host_ids', 'speaker_ids',
            ] as $col) {
                if (Schema::hasColumn('spaces', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
