<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Tag people" approval - the tagged person must accept before their name
 * shows on the post. `comment_mentions` is the same shared mention-log
 * table `@mention`s in comments/replies/captions already write to
 * (distinguished by `source_type`), reused here for `source_type = 'tag'`
 * rather than a new dedicated pivot, since the dedup check, the
 * `Video::taggedUsers()` relationship and the notification-on-create path
 * all already exist against this table.
 *
 * `status` only carries real meaning for `source_type = 'tag'` rows
 * (pending until accepted/declined); comment/reply/caption @mentions have
 * no approval step, so existing rows and every future non-tag row default
 * to 'accepted' - Video::taggedUsers() filters on `status = 'accepted'`,
 * and that default is what keeps this migration from retroactively hiding
 * anything that isn't a tag.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('comment_mentions', function (Blueprint $table) {
            if (! Schema::hasColumn('comment_mentions', 'status')) {
                $table->string('status', 20)->default('accepted')->after('video_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('comment_mentions', function (Blueprint $table) {
            if (Schema::hasColumn('comment_mentions', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
