<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_admin_override_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('old_country_code', 2)->nullable();
            $table->string('old_country_name', 100)->nullable();
            $table->char('new_country_code', 2);
            $table->string('new_country_name', 100)->nullable();
            $table->foreignId('admin_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 500);
            $table->enum('lock_mode', ['keep', 'reset', 'none'])->default('reset');
            $table->timestamp('changed_at')->useCurrent();
            $table->timestamps();

            $table->index('user_id');
            $table->index('admin_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('country_admin_override_logs');
    }
};
