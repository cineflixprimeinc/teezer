<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * is_ai_generated mirrors videos.is_ai_generated exactly (same shape, same
 * default false - 2026_06_02_200001_add_is_ai_generated_to_videos_table).
 *
 * reposted_from_story_id/reposted_from_user_id are deliberately NOT foreign
 * keys, mirroring direct_messages.story_id (2026_06_14_000001): a repost is
 * a fully independent Story row (its own StoryMedia pointing at the
 * original's already-hosted media URL, its own expires_at, its own layers) -
 * these two columns are only for resolving attribution at read time. If the
 * original story or its author is later deleted, the repost keeps working
 * exactly like a story_reply DM keeps working after its story expires; a
 * constrained FK would either block that deletion or cascade it into the
 * repost, neither of which is correct here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stories', function (Blueprint $table) {
            if (! Schema::hasColumn('stories', 'is_ai_generated')) {
                $table->boolean('is_ai_generated')->default(false)->after('allow_resharing');
            }
            if (! Schema::hasColumn('stories', 'reposted_from_story_id')) {
                $table->unsignedBigInteger('reposted_from_story_id')->nullable()->after('is_ai_generated');
            }
            if (! Schema::hasColumn('stories', 'reposted_from_user_id')) {
                $table->unsignedBigInteger('reposted_from_user_id')->nullable()->after('reposted_from_story_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('stories', function (Blueprint $table) {
            $cols = array_filter(
                ['is_ai_generated', 'reposted_from_story_id', 'reposted_from_user_id'],
                fn ($c) => Schema::hasColumn('stories', $c),
            );
            if ($cols) {
                $table->dropColumn($cols);
            }
        });
    }
};
