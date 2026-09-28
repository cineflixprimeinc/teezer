<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Durable cache for Wikimedia (Wikipedia) summaries.
 *
 * The knowledge feature is read-through: Redis first, this table second, and
 * only on a miss in both does the Go backend call Wikimedia. Postgres is what
 * makes that survive a Redis flush or restart - without it, every cold cache
 * would replay the entire query history against Wikimedia at once.
 *
 * Only the four fields the client is allowed to see are stored (title,
 * summary, thumbnail, article URL). No page HTML, no revision history, no
 * extracts beyond the summary: this is a cache, not a mirror, and keeping it
 * narrow is what keeps it cheap at millions of users.
 *
 * `not_found` is the negative cache, and it is the single most important
 * column here. A query that Wikipedia has no article for is the common case
 * on a social app - usernames, slang, song lyrics - and without recording the
 * miss those queries would hit Wikimedia forever, which is exactly the
 * fair-use violation their policy warns about. A miss is stored like a hit and
 * expires on its own (shorter) clock.
 *
 * Written by the Go service (backend-go/internal/knowledge). Laravel owns the
 * schema only because it owns every migration during the Go port; nothing in
 * PHP reads or writes this table today.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wikipedia_articles', function (Blueprint $table) {
            $table->id();

            // The normalised query ("mount everest"), not the Wikipedia title.
            // Lookups happen by what the user typed, so that is what has to be
            // the unique key; several queries legitimately collapse onto one
            // article via Wikipedia's own redirects, and each keeps its own row
            // so the second spelling is a cache hit too.
            $table->string('lookup_key', 255);
            $table->string('lang', 10)->default('en');

            // The four client-visible fields. Nullable because a negative
            // cache row has none of them.
            $table->string('title', 255)->nullable();
            $table->text('summary')->nullable();
            $table->string('thumbnail_url', 1000)->nullable();
            $table->string('article_url', 1000)->nullable();

            // Negative cache: true means "Wikimedia has no usable article for
            // this", which is a real answer worth remembering.
            $table->boolean('not_found')->default(false);

            // Drives the periodic refresh (~30 days for hits, far shorter for
            // misses) and lets a sweep find stale rows without a full scan.
            $table->timestamp('fetched_at')->useCurrent();

            $table->timestamps();

            // One row per query per language.
            $table->unique(['lookup_key', 'lang']);
            // Refresh sweeps read this: "oldest rows first, misses excluded".
            $table->index(['not_found', 'fetched_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wikipedia_articles');
    }
};
