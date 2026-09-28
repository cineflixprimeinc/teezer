<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The cover a host can attach when creating a Space ("Add cover" on the create
 * sheet).
 *
 * Stores the R2 key, not a URL - the same way users.avatar does - so the disk
 * can move without rewriting rows. StorageService::url() turns it into
 * something the app can render.
 *
 * Nullable, and it will usually be null: a room without artwork gets the
 * branded gradient the list already draws for it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            $table->string('cover_url', 500)->nullable()->after('topic');
        });
    }

    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            $table->dropColumn('cover_url');
        });
    }
};
