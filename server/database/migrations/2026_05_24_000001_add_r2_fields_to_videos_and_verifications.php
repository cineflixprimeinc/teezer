<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add mime_type to videos for metadata tracking
        Schema::table('videos', function (Blueprint $table) {
            $table->string('mime_type', 100)->nullable()->after('thumbnail_url');
        });

        // Add document_key (R2 object key) to verification_requests.
        // document_url now stores the full CDN URL; document_key stores the key
        // needed for deletion and presigned URL generation.
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->string('document_key', 500)->nullable()->after('document_url');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->dropColumn('mime_type');
        });

        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn('document_key');
        });
    }
};
