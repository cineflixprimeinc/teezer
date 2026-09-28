<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Followers-only rooms: `audience = private` currently only admits the host,
 * moderators and invited co-hosts/speakers - nobody joins on being a follower,
 * which makes "Followers" a lie. This gives the host an allowlist of up to 100
 * specific followers who may join a private room (see Space::canJoin()).
 *
 *  - allowed_follower_ids: user ids the host picked from their followers list
 *    when audience = private. Null/empty = nobody extra is admitted (the
 *    pre-existing host/moderator/invitee behaviour is unchanged).
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

            $add('allowed_follower_ids', fn ($t) => $t->json('allowed_follower_ids')->nullable());
        });
    }

    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            foreach (['allowed_follower_ids'] as $col) {
                if (Schema::hasColumn('spaces', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
