<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The detailed Create-Space sheet's remaining settings.
 *
 *  - room_rules: which of the 4 canned house rules are ON for this room (kind,
 *    topic, no_record, no_promo) - the set currently enabled, not the full menu.
 *    kind + topic default ON; no_record + no_promo default OFF.
 *  - gifts_enabled: lets listeners send gifts/coins during the room.
 *  - waiting_room_enabled: host approves listeners before they can hear the room.
 *  - sound_clips_enabled: host can play audio clips from a library into the room.
 *  - speaker_slots: max concurrent mic holders; null = unlimited.
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

            $add('room_rules', fn ($t) => $t->json('room_rules')->nullable());

            $add('gifts_enabled',         fn ($t) => $t->boolean('gifts_enabled')->default(false));
            $add('waiting_room_enabled',  fn ($t) => $t->boolean('waiting_room_enabled')->default(false));
            $add('sound_clips_enabled',   fn ($t) => $t->boolean('sound_clips_enabled')->default(false));

            $add('speaker_slots', fn ($t) => $t->unsignedInteger('speaker_slots')->nullable());
        });
    }

    public function down(): void
    {
        Schema::table('spaces', function (Blueprint $table) {
            foreach ([
                'room_rules', 'gifts_enabled', 'waiting_room_enabled',
                'sound_clips_enabled', 'speaker_slots',
            ] as $col) {
                if (Schema::hasColumn('spaces', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
