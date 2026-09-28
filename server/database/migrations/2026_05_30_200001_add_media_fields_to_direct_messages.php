<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->enum('message_type', [
                'text', 'image', 'video', 'voice', 'audio', 'document',
            ])->default('text')->after('body');

            $table->string('r2_key', 500)->nullable()->after('message_type');
            $table->string('r2_url', 1000)->nullable()->after('r2_key');
            $table->string('thumbnail_key', 500)->nullable()->after('r2_url');
            $table->string('thumbnail_url', 1000)->nullable()->after('thumbnail_key');
            $table->unsignedBigInteger('file_size')->nullable()->after('thumbnail_url'); // bytes
            $table->unsignedInteger('duration')->nullable()->after('file_size');          // seconds
            $table->string('file_name', 255)->nullable()->after('duration');
            $table->string('mime_type', 100)->nullable()->after('file_name');
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn([
                'message_type', 'r2_key', 'r2_url',
                'thumbnail_key', 'thumbnail_url',
                'file_size', 'duration', 'file_name', 'mime_type',
            ]);
        });
    }
};
