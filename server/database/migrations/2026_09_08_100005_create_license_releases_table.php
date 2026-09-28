<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The catalogue of downloadable release packages living in the PRIVATE B2
 * bucket.
 *
 * This table holds the object KEY, never a URL and never a credential. A
 * customer receives a presigned URL minted at request time with a
 * ~15-minute lifetime (config licensing.server.release_url_ttl_minutes),
 * so possession of a row here grants nothing on its own and B2 keys never
 * leave the licence server.
 *
 * checksum_sha256 is what the installer verifies after download; `signature`
 * is that checksum signed with the same RSA key that signs licences, so a
 * tampered package fails verification even if an attacker controls the
 * transport.
 *
 * LICENSOR-SIDE ONLY.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('license_releases', function (Blueprint $table) {
            $table->id();
            $table->string('version', 32);
            $table->string('channel', 20)->default('stable')->index();
            $table->string('object_key', 512);
            $table->string('checksum_sha256', 64);
            $table->text('signature')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('min_upgrade_from', 32)->nullable();
            $table->text('release_notes')->nullable();
            $table->boolean('is_published')->default(false)->index();
            $table->boolean('is_mandatory')->default(false);
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();

            $table->unique(['version', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('license_releases');
    }
};
