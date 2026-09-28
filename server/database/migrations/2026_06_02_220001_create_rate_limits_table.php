<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rate_limits', function (Blueprint $table) {
            $table->id();
            $table->string('identifier', 191);
            $table->enum('identifier_type', ['ip', 'account', 'device']);
            $table->string('action_type', 50);
            $table->unsignedInteger('attempt_count')->default(0);
            $table->timestamp('window_start')->nullable();
            $table->timestamp('blocked_until')->nullable();
            $table->unsignedTinyInteger('block_level')->default(0);
            $table->timestamps();

            $table->unique(['identifier', 'identifier_type', 'action_type'], 'rate_limits_identity_action_unique');
            $table->index(['action_type', 'blocked_until']);
            $table->index('identifier');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rate_limits');
    }
};
