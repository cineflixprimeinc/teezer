<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Add link" on the upload/edit Details card - a single external URL a
 * creator can attach to their own post (their storefront, a landing page,
 * etc.). Stored verbatim as typed; the app does not shorten or wrap it.
 * Real, persisted content, not a cosmetic UI-only field.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (!Schema::hasColumn('videos', 'link_url')) {
                $table->string('link_url', 500)->nullable()->after('location');
            }
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            if (Schema::hasColumn('videos', 'link_url')) {
                $table->dropColumn('link_url');
            }
        });
    }
};
