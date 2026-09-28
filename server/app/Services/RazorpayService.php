<?php

namespace App\Services;

use App\Models\AdminCoinSetting;
use Razorpay\Api\Api;

class RazorpayService
{
    private Api $api;
    private string $keySecret;

    public function __construct()
    {
        $keyId           = AdminCoinSetting::getValue('razorpay_key_id') ?: config('services.razorpay.key_id', '');
        $this->keySecret = AdminCoinSetting::getValue('razorpay_key_secret') ?: config('services.razorpay.key_secret', '');
        $this->api       = new Api($keyId, $this->keySecret);
    }

    public static function isConfigured(): bool
    {
        $keyId = AdminCoinSetting::getValue('razorpay_key_id') ?: '';
        return !empty($keyId);
    }

    public function createOrder(float $amountUsd, string $currency, string $reference): array
    {
        $order = $this->api->order->create([
            'receipt'  => $reference,
            'amount'   => (int) round($amountUsd * 100), // paise/cents
            'currency' => strtoupper($currency),
        ]);
        return $order->toArray();
    }

    public function verifySignature(string $orderId, string $paymentId, string $signature): bool
    {
        $body              = $orderId . '|' . $paymentId;
        $expectedSignature = hash_hmac('sha256', $body, $this->keySecret);
        return hash_equals($expectedSignature, $signature);
    }
}
