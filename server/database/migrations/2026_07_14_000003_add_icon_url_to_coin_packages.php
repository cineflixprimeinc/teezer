<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A place to put an UPLOADED gift icon.
 *
 * `coin_packages.icon` is only a slug: the artwork it names is a static SVG the
 * web app serves from /gifts/{sort_order}-{icon}.svg. That means an admin cannot
 * change a gift's artwork without a deploy - the file lives in the repo.
 *
 * `icon_url` is the override. When set, every client prefers it over the slug
 * artwork, so an admin can upload a PNG/SVG/GIF and it takes effect immediately.
 * The slug stays as the fallback, so the 200 seeded packs keep working untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coin_packages', function (Blueprint $table) {
            if (! Schema::hasColumn('coin_packages', 'icon_url')) {
                $table->string('icon_url', 512)->nullable()->after('icon');
            }
        });
    }

    public function down(): void
    {
        Schema::table('coin_packages', function (Blueprint $table) {
            if (Schema::hasColumn('coin_packages', 'icon_url')) {
                $table->dropColumn('icon_url');
            }
        });
    }
};
