<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->string('full_name')->nullable()->after('user_id');
            $table->string('phone', 30)->nullable()->after('full_name');
            $table->string('brand_name')->nullable()->after('phone');
            $table->json('social_links')->nullable()->after('brand_name');
            $table->string('website')->nullable()->after('social_links');
            $table->string('country', 100)->nullable()->after('website');
            $table->string('selfie_url')->nullable()->after('document_key');
            $table->string('selfie_key')->nullable()->after('selfie_url');
            $table->string('supporting_doc_url')->nullable()->after('selfie_key');
            $table->string('supporting_doc_key')->nullable()->after('supporting_doc_url');
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn([
                'full_name', 'phone', 'brand_name', 'social_links', 'website', 'country',
                'selfie_url', 'selfie_key', 'supporting_doc_url', 'supporting_doc_key',
            ]);
        });
    }
};
