<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The 6 platform-wide rules every monetization programme carries on top of
 * its own requirements. Previously the hardcoded `MonetizationProgram::
 * BASELINE` constant; moved to a real table so an admin can edit or disable
 * one from the Monetization Control Center instead of it being a code change.
 *
 * Seeded here with the exact same keys, labels, sub-text and targets the
 * constant held, so nothing an existing account has already cleared changes
 * the moment this runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_requirements', function (Blueprint $table) {
            $table->id();
            // Matches a MonetizationProgram::METRICS key - that is what ties a
            // row here to a live, computed value.
            $table->string('key')->unique();
            $table->string('label');
            $table->string('sub')->nullable();
            $table->float('target')->nullable();
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        $rows = [
            ['key' => 'age18',          'label' => 'Age verified (18+)',      'sub' => 'Confirmed by identity verification',        'target' => null, 'sort_order' => 1],
            ['key' => 'age',            'label' => 'Account age',              'sub' => 'At least 30 days old',                       'target' => 30,   'sort_order' => 2],
            ['key' => 'strikes',        'label' => 'No active strikes',        'sub' => 'A strike blocks all programmes for 90 days', 'target' => null, 'sort_order' => 3],
            ['key' => 'two_factor',     'label' => 'Two-factor login',         'sub' => 'Required on a monetized account',            'target' => null, 'sort_order' => 4],
            ['key' => 'region',         'label' => 'Region supported',         'sub' => 'Payouts to an account in your own name',     'target' => null, 'sort_order' => 5],
            ['key' => 'unique_account', 'label' => 'One account per person',   'sub' => 'Duplicate or shared accounts are rejected',  'target' => null, 'sort_order' => 6],
        ];

        $now = now();
        foreach ($rows as &$row) {
            $row['enabled']   = true;
            $row['created_at'] = $now;
            $row['updated_at'] = $now;
        }
        unset($row);

        DB::table('platform_requirements')->insert($rows);
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_requirements');
    }
};
