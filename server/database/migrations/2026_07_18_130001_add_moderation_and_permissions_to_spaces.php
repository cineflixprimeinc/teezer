<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clubhouse/X-Spaces-grade host controls.
 *
 *  - speaking_permission: the stage policy - everyone speaks / request to speak /
 *    host & moderators only. join() reads this to decide the seat you enter with.
 *  - audio_quality: the opus target the publisher aims for (standard/high/ultra);
 *    the client caps its sender bitrate on it, so it never touches the server.
 *  - allow_screen_sharing: a forward-looking toggle (no video pipeline yet).
 *  - moderator_ids: who may run the room besides the host (co-hosts seed this).
 *  - blocked_user_ids: kicked-and-barred users; join() refuses them.
 *  - invite_token: the shareable secret for private / invite-only rooms.
 *
 * audience gains a third value, "invite" (invite-only), kept short so the
 * existing string(10) column holds it without a type change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            $add = function (string $col, callable $def) use ($table) {
                if (! Schema::hasColumn('spaces', $col)) {
                    $def($table);
                }
            };

            // everyone | request | host_only
            $add('speaking_permission', fn ($t) => $t->string('speaking_permission', 12)->default('request'));
            // standard | high | ultra
            $add('audio_quality',       fn ($t) => $t->string('audio_quality', 10)->default('standard'));
            $add('allow_screen_sharing', fn ($t) => $t->boolean('allow_screen_sharing')->default(false));

            $add('moderator_ids',    fn ($t) => $t->json('moderator_ids')->nullable());
            $add('blocked_user_ids', fn ($t) => $t->json('blocked_user_ids')->nullable());
            // Random secret for private/invite-only sharing; indexed for the join lookup.
            $add('invite_token', fn ($t) => $t->string('invite_token', 40)->nullable()->index());
        });
    }

    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            if (Schema::hasColumn('spaces', 'invite_token')) {
                $table->dropIndex(['invite_token']);
            }
            foreach ([
                'speaking_permission', 'audio_quality', 'allow_screen_sharing',
                'moderator_ids', 'blocked_user_ids', 'invite_token',
            ] as $col) {
                if (Schema::hasColumn('spaces', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
