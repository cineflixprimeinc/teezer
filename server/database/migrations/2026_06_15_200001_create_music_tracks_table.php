<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('music_tracks', function (Blueprint $table) {
            $table->id();

            // Core info
            $table->string('title');
            $table->string('artist_name')->nullable();
            $table->string('album')->nullable();
            $table->json('featuring_artists')->nullable();
            $table->string('genre', 100)->nullable();
            $table->string('mood', 100)->nullable();
            $table->string('language', 50)->nullable();
            $table->json('tags')->nullable();
            $table->date('release_date')->nullable();

            // Technical
            $table->unsignedSmallInteger('bpm')->nullable();
            $table->string('music_key', 20)->nullable();
            $table->string('isrc', 50)->nullable();

            // Rights & Licensing
            $table->string('copyright_owner')->nullable();
            $table->string('license_type', 100)->nullable();
            $table->json('usage_permissions')->nullable();
            $table->json('region_restrictions')->nullable();
            $table->boolean('commercial_use_allowed')->default(true);
            $table->boolean('creator_safe')->default(true);
            $table->boolean('monetization_safe')->default(true);
            $table->boolean('explicit_content')->default(false);

            // Content
            $table->text('description')->nullable();
            $table->longText('lyrics')->nullable();

            // R2 / Storage
            $table->string('audio_r2_key')->nullable();
            $table->string('audio_url')->nullable();
            $table->string('cover_r2_key')->nullable();
            $table->string('cover_url')->nullable();

            // File metadata
            $table->unsignedInteger('duration')->nullable();       // seconds
            $table->unsignedBigInteger('file_size')->nullable();   // bytes
            $table->string('format', 20)->nullable();              // mp3, wav...
            $table->unsignedInteger('bitrate')->nullable();        // kbps
            $table->unsignedInteger('sample_rate')->nullable();    // Hz
            $table->json('waveform_data')->nullable();

            // Stats
            $table->unsignedBigInteger('plays_count')->default(0);
            $table->unsignedBigInteger('uses_count')->default(0);
            $table->unsignedBigInteger('downloads_count')->default(0);

            // Status & Publishing
            $table->enum('status', ['draft', 'published', 'pending', 'archived', 'rejected'])->default('draft');
            $table->boolean('recommended')->default(false);
            $table->boolean('featured')->default(false);
            $table->boolean('allow_reels')->default(true);
            $table->boolean('allow_stories')->default(true);
            $table->boolean('allow_downloads')->default(false);
            $table->boolean('show_in_studio')->default(true);
            $table->boolean('show_in_upload_picker')->default(true);

            $table->unsignedBigInteger('created_by_admin_id')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('genre');
            $table->index('mood');
            $table->index(['status', 'show_in_studio']);
            $table->index(['status', 'show_in_upload_picker']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('music_tracks');
    }
};
