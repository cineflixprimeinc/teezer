<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-story settings, as one JSONB document.
 *
 * The brief asked for a backend flexible enough to enable new story features
 * from the admin panel WITHOUT changing the database or API structure. A column
 * per setting cannot do that: every new toggle is a migration, a model change, a
 * validation change and an API change, and old rows have no value for it.
 *
 * So settings are a document, and the SCHEMA lives in config - see
 * config/stories.php. Adding "allow_screenshot_notice" becomes one entry in that
 * file (later, one row in an admin table reading the same shape). No migration,
 * no API change, and every existing story answers with the declared default.
 *
 * What stays a real column and why:
 *  - visibility          indexed, and joined against on every feed read
 *  - allow_replies       already exists and is enforced in DM code
 *  - allow_resharing     same
 *  - save_to_archive     same
 * Those are load-bearing in queries. A JSONB key cannot be indexed as cheaply
 * and should not gate a hot path.
 *
 * Everything else - view-count visibility, feed cross-post, Spaces status,
 * screenshot notices, and whatever comes next - is a key in here.
 *
 * JSONB not JSON: Postgres parses it once on write, so reads need no re-parse,
 * and it can be indexed with GIN if a setting ever needs querying across stories.
 *
 * Defaults are NOT written into the row. An absent key means "use the current
 * default", so changing a default in config changes behaviour for every story
 * that never set it explicitly - which is what makes an admin panel switch
 * meaningful rather than something that only affects future posts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stories', function (Blueprint $table) {
            $table->jsonb('settings')->nullable()->after('visibility');
        });
    }

    public function down(): void
    {
        Schema::table('stories', function (Blueprint $table) {
            $table->dropColumn('settings');
        });
    }
};
