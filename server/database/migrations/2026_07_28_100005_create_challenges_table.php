<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hashtag Challenges - the Explore page's "join a challenge" cards: a hashtag,
 * a prize, a deadline, and an entry count.
 *
 * `hashtag_id` is nullable: staff can stand up a challenge before its hashtag
 * has a single post under it yet (the tag text in `title` is what the app
 * shows and what creators actually type), so the FK is a later enrichment,
 * not a requirement - hence nullOnDelete rather than cascade.
 *
 * `cover_start_color`/`cover_end_color` are plain presentational hex strings
 * for the card's gradient (same idea as a Space's cover being "just a color/
 * URL", never computed).
 *
 * `status` is a stored convenience (active/ended) kept in sync by the
 * controller/admin actions against `ends_at` - see Challenge::scopeActive()
 * for the source of truth used in queries.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('challenges')) {
            Schema::create('challenges', function (Blueprint $table) {
                $table->id();
                $table->string('title'); // the hashtag tag text, e.g. "#studiosetup"
                $table->foreignId('hashtag_id')->nullable()->constrained('hashtags')->nullOnDelete();
                $table->string('prize_description')->nullable();
                $table->string('cover_start_color')->nullable();
                $table->string('cover_end_color')->nullable();
                $table->timestamp('starts_at');
                $table->timestamp('ends_at');
                $table->string('status')->default('active'); // active|ended
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index('ends_at');
                $table->index('status');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('challenges');
    }
};
