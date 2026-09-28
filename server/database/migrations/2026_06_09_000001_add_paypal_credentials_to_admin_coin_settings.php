<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $rows = [
            ['key' => 'paypal_mode',          'value' => 'sandbox', 'description' => 'PayPal mode: sandbox or live'],
            ['key' => 'paypal_client_id',      'value' => '',        'description' => 'PayPal REST API Client ID'],
            ['key' => 'paypal_client_secret',  'value' => '',        'description' => 'PayPal REST API Client Secret'],
        ];

        foreach ($rows as $row) {
            DB::table('admin_coin_settings')->updateOrInsert(
                ['key' => $row['key']],
                array_merge($row, ['created_at' => $now, 'updated_at' => $now]),
            );
        }
    }

    public function down(): void
    {
        DB::table('admin_coin_settings')
            ->whereIn('key', ['paypal_mode', 'paypal_client_id', 'paypal_client_secret'])
            ->delete();
    }
};
