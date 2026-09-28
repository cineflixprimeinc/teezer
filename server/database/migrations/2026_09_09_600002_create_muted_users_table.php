<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Account-wide mute: suppresses a user's content from the muter's own
 * recommendation feed, without unfollowing or blocking them (the muted user
 * is never told and can still see/interact with the muter normally).
 * Mirrors blocked_users' exact shape - see BlockedUser/BlockController for
 * the pattern this follows.
 *
 * Built for Global Teezer Control's mute_users_enabled - no account-wide
 * mute existed before this (only per-conversation DM mute and Space mic
 * mute, both unrelated).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('muted_users', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('muter_id');
            $table->unsignedBigInteger('muted_id');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('muter_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('muted_id')->references('id')->on('users')->cascadeOnDelete();
            $table->unique(['muter_id', 'muted_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('muted_users');
    }
};
