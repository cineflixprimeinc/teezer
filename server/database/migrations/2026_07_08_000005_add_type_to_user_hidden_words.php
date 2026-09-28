<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * User-managed word blocklists. Extends the existing `user_hidden_words` table
 * (previously admin-viewed only) with a `type` so one table backs all three
 * Content-Preferences lists:
 *   keyword         - Keyword Filters ("Block content with specific keywords")
 *   hashtag         - Hashtag Filters
 *   not_interested  - Not Interested Keywords
 * Enforced when OTHER users comment on this user's videos or DM this user:
 * a match rejects the comment/message.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('user_hidden_words', function (Blueprint $table) {
            $table->string('type', 20)->default('keyword')->after('user_id');
        });

        // Was unique(user_id, word); now the same word may exist per list type.
        Schema::table('user_hidden_words', function (Blueprint $table) {
            $table->dropUnique('user_hidden_words_user_id_word_unique');
            $table->unique(['user_id', 'type', 'word']);
            $table->index(['user_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::table('user_hidden_words', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'type', 'word']);
            $table->dropIndex(['user_id', 'type']);
            $table->unique(['user_id', 'word']);
            $table->dropColumn('type');
        });
    }
};
