<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_coin_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->text('value');
            $table->string('description', 255)->nullable();
            $table->timestamps();
        });

        $now = now();
        DB::table('admin_coin_settings')->insert([
            ['key' => 'commission_rate',    'value' => '30',  'description' => 'Gift commission % taken by Teezer', 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'min_withdrawal_usd', 'value' => '10',  'description' => 'Minimum USD withdrawal amount',      'created_at' => $now, 'updated_at' => $now],
            ['key' => 'coin_usd_rate',      'value' => '100', 'description' => 'RC coins equal to $1 USD',           'created_at' => $now, 'updated_at' => $now],
            ['key' => 'card_enabled',       'value' => '1',   'description' => 'Card payments enabled',              'created_at' => $now, 'updated_at' => $now],
            ['key' => 'paypal_enabled',     'value' => '1',   'description' => 'PayPal enabled',                     'created_at' => $now, 'updated_at' => $now],
            ['key' => 'applepay_enabled',   'value' => '1',   'description' => 'Apple Pay enabled',                  'created_at' => $now, 'updated_at' => $now],
            ['key' => 'googlepay_enabled',  'value' => '1',   'description' => 'Google Pay enabled',                 'created_at' => $now, 'updated_at' => $now],
            ['key' => 'upi_enabled',        'value' => '1',   'description' => 'UPI/wallet payments enabled',        'created_at' => $now, 'updated_at' => $now],
            ['key' => 'bank_enabled',       'value' => '1',   'description' => 'Bank transfer enabled',              'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_coin_settings');
    }
};
