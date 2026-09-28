<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Email or phone verified" -> "Email verified".
 *
 * The requirement never checked a phone, because nothing in this platform
 * verifies one: there is no OTP table and no `phone_verified_at` column. The
 * old wording promised creators an alternative route that did not exist, and
 * the old check let a phone number somebody typed stand in for a verified
 * email. The check is fixed in MonetizationEligibilityService; this makes the
 * label tell the truth to match.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('monetization_programs')) {
            return;
        }

        foreach (DB::table('monetization_programs')->get(['id', 'requirements']) as $row) {
            $reqs = json_decode($row->requirements ?? '[]', true) ?: [];
            $touched = false;

            foreach ($reqs as $i => $r) {
                if (($r['key'] ?? null) === 'email' && ($r['label'] ?? '') !== 'Email verified') {
                    $reqs[$i]['label'] = 'Email verified';
                    $touched = true;
                }
            }

            if ($touched) {
                DB::table('monetization_programs')->where('id', $row->id)
                    ->update(['requirements' => json_encode($reqs), 'updated_at' => now()]);
            }
        }

        Cache::forget('monetization_programs:all');
    }

    public function down(): void
    {
        //
    }
};
