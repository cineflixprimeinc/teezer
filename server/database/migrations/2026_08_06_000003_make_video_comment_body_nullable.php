<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Let a comment be a GIF or a photo with no text.
 *
 * `video_comments.body` has been NOT NULL since the table was created, back
 * when text was the only thing a comment could contain. GIFs and photos were
 * added later - the columns, the validation and both pickers - but nobody
 * relaxed the constraint underneath them, so every attachment-only comment died
 * at the insert with:
 *
 *   SQLSTATE[23502] null value in column "body" violates not-null constraint
 *
 * CommentController already treats a body as optional (it 422s only when body,
 * gif_url AND image are all absent), so the column has been contradicting the
 * controller ever since. That is why the production table contains zero
 * comments carrying a GIF.
 *
 * Widening a constraint, so it is safe on a live table: existing rows all have
 * a body and none is rewritten, and Postgres takes only a brief ACCESS
 * EXCLUSIVE lock to update the catalog - there is no table rewrite.
 *
 * `down()` restores NOT NULL, and has to backfill first: any attachment-only
 * comment written while this was in place would otherwise block the constraint
 * from being re-applied. Empty string, not deletion - a rollback should not
 * destroy someone's comment.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('video_comments')) {
            return;
        }

        match (Schema::getConnection()->getDriverName()) {
            'pgsql' => DB::statement('ALTER TABLE video_comments ALTER COLUMN body DROP NOT NULL'),
            'mysql', 'mariadb' => DB::statement('ALTER TABLE video_comments MODIFY body TEXT NULL'),
            // sqlite (tests) cannot alter a column in place, and Laravel's
            // test schema is built from scratch each run, so there is nothing
            // to migrate there.
            default => null,
        };
    }

    public function down(): void
    {
        if (! Schema::hasTable('video_comments')) {
            return;
        }

        DB::table('video_comments')->whereNull('body')->update(['body' => '']);

        match (Schema::getConnection()->getDriverName()) {
            'pgsql' => DB::statement('ALTER TABLE video_comments ALTER COLUMN body SET NOT NULL'),
            'mysql', 'mariadb' => DB::statement('ALTER TABLE video_comments MODIFY body TEXT NOT NULL'),
            default => null,
        };
    }
};
