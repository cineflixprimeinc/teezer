<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_logs', function (Blueprint $table) {
            $table->id();
            $table->string('action', 100);
            $table->string('severity', 20)->default('info');
            $table->string('ip_address', 45)->nullable();
            $table->string('identifier_type', 20)->nullable();
            $table->string('identifier', 191)->nullable();
            $table->string('action_type', 50)->nullable();
            $table->text('description')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['action', 'created_at']);
            $table->index(['identifier_type', 'identifier']);
            $table->index('ip_address');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_logs');
    }
};
