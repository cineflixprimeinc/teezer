<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The genre / mood / language vocabulary the music library offers.
 *
 * These lists lived as hardcoded arrays in the admin upload page, which meant
 * adding a genre was a code change and a deploy, and nothing outside that one
 * file knew what the vocabulary was. Moving them here makes the list editable,
 * shared, and answerable to a single source.
 *
 * Deliberately NOT a foreign key on music_tracks. A track stores its genres as
 * a comma-joined string today and several already carry values chosen before
 * any of this existed; a hard relation would either lose them or block the
 * migration. This is the vocabulary offered when tagging - the tracks keep
 * their own text, and the admin screens reconcile the two by name.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('music_taxonomy_terms', function (Blueprint $table) {
            $table->id();
            // 'genre' | 'mood' | 'language' - one table rather than three
            // identical ones, since every screen treats them the same way.
            $table->string('kind', 16);
            $table->string('name', 80);
            $table->unsignedInteger('sort_order')->default(0);
            // Retires a term from the picker without deleting it, so tracks
            // already tagged with it keep reading correctly.
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            // Case-sensitive on purpose: "Lo-fi" and "Lo-Fi" are the same term
            // to a person, and the controller normalises before writing.
            $table->unique(['kind', 'name']);
            $table->index(['kind', 'is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('music_taxonomy_terms');
    }
};
