<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Linked third-party sign-ins (Google, Apple, …) per user. Recorded on social
 * login so Settings › Connected Accounts can show and disconnect them. One row
 * per (user, provider).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('social_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 30);            // google | apple | facebook …
            $table->string('provider_id')->nullable(); // provider "sub" / user id
            $table->string('email')->nullable();
            $table->string('name')->nullable();
            $table->timestamp('linked_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_accounts');
    }
};
