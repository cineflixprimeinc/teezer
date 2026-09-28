<?php

namespace App\Services;

use App\Models\AdminCoinSetting;
use Stripe\Stripe;
use Stripe\PaymentIntent;
use Stripe\Webhook;

class StripeService
{
    public function __construct()
    {
        $key = AdminCoinSetting::getValue('stripe_secret_key') ?: config('services.stripe.secret', '');
        Stripe::setApiKey($key);
    }

    public static function isConfigured(): bool
    {
        $key = AdminCoinSetting::getValue('stripe_secret_key') ?: config('services.stripe.secret', '');
        return !empty($key);
    }

    public function createPaymentIntent(float $amountUsd, string $currency, string $reference, array $metadata = []): \Stripe\PaymentIntent
    {
        return PaymentIntent::create([
            'amount'   => (int) round($amountUsd * 100), // cents
            'currency' => strtolower($currency),
            'metadata' => array_merge($metadata, ['reference' => $reference]),
            'automatic_payment_methods' => ['enabled' => true],
        ]);
    }

    public function retrievePaymentIntent(string $intentId): \Stripe\PaymentIntent
    {
        return PaymentIntent::retrieve($intentId);
    }

    public function constructWebhookEvent(string $payload, string $sigHeader): \Stripe\Event
    {
        $secret = AdminCoinSetting::getValue('stripe_webhook_secret') ?: '';
        return Webhook::constructEvent($payload, $sigHeader, $secret);
    }
}
