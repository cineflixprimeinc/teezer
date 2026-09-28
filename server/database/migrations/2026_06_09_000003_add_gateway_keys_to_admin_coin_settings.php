<?php

use App\Models\AdminCoinSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** @var array<string, array{value: string, description: string}> */
    private array $settings = [
        'stripe_publishable_key'   => ['value' => '',       'description' => 'Stripe publishable key (pk_test_... or pk_live_...)'],
        'stripe_secret_key'        => ['value' => '',       'description' => 'Stripe secret key - never exposed to frontend'],
        'stripe_webhook_secret'    => ['value' => '',       'description' => 'Stripe webhook signing secret (whsec_...)'],
        'stripe_mode'              => ['value' => 'test',   'description' => 'Stripe mode: test or live'],
        'stripe_enabled'           => ['value' => '1',      'description' => 'Enable Stripe payment gateway'],
        'razorpay_key_id'          => ['value' => '',       'description' => 'Razorpay Key ID (rzp_test_... or rzp_live_...)'],
        'razorpay_key_secret'      => ['value' => '',       'description' => 'Razorpay Key Secret - never exposed to frontend'],
        'razorpay_enabled'         => ['value' => '1',      'description' => 'Enable Razorpay payment gateway'],
        'bank_name'                => ['value' => '',       'description' => 'Bank name for bank transfer instructions'],
        'bank_account_number'      => ['value' => '',       'description' => 'Bank account number for transfers'],
        'bank_routing_number'      => ['value' => '',       'description' => 'Bank routing / IFSC number'],
        'bank_swift_code'          => ['value' => '',       'description' => 'SWIFT/BIC code for international transfers'],
        'bank_account_holder'      => ['value' => '',       'description' => 'Account holder name for bank transfers'],
        'bank_enabled_instructions'=> ['value' => '',       'description' => 'Custom instructions shown to users for bank transfers'],
        'subscription_monthly_price'=> ['value' => '4.99', 'description' => 'Monthly subscription price in USD'],
        'subscription_annual_price' => ['value' => '39.99','description' => 'Annual subscription price in USD'],
        'badge_price'              => ['value' => '9.99',   'description' => 'Verification badge one-time price in USD'],
    ];

    public function up(): void
    {
        foreach ($this->settings as $key => $meta) {
            AdminCoinSetting::firstOrCreate(
                ['key' => $key],
                ['value' => $meta['value'], 'description' => $meta['description']]
            );
        }
    }

    public function down(): void
    {
        AdminCoinSetting::whereIn('key', array_keys($this->settings))->delete();
    }
};
