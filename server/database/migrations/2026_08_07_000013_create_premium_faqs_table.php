<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The premium page's QUESTIONS accordion.
 *
 * Its own table rather than a settings blob because these are reordered and
 * individually retired far more often than they are rewritten - "Can I cancel
 * anytime?" is a support-load question, and which ones are shown changes with
 * whatever users are currently confused about.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('premium_faqs', function (Blueprint $table) {
            $table->id();
            $table->string('question');
            $table->text('answer');
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->index(['is_enabled', 'sort']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('premium_faqs');
    }
};
