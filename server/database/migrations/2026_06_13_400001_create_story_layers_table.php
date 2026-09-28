<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('story_layers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('story_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('slide_index')->default(0);
            $table->string('type', 20); // text | link | mention | hashtag | location | emoji
            $table->text('text')->nullable();
            $table->string('url', 500)->nullable();
            $table->foreignId('mentioned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('hashtag', 200)->nullable();
            $table->string('location_name', 255)->nullable();
            $table->decimal('x_percent', 6, 2)->default(50.00);
            $table->decimal('y_percent', 6, 2)->default(50.00);
            $table->decimal('scale_value', 5, 2)->default(1.00);
            $table->decimal('rotation', 7, 2)->default(0.00);
            $table->string('color', 20)->default('#ffffff');
            $table->string('font', 30)->default('classic');
            $table->unsignedSmallInteger('z_index')->default(0);
            $table->timestamps();

            $table->index(['story_id', 'slide_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('story_layers');
    }
};
