<?php

namespace App\Console\Commands;

use App\Services\CentrifugoClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * One-command validation of the Laravel ↔ Centrifugo wiring (run on staging
 * after deploying Centrifugo + setting the CENTRIFUGO_* env). Proves:
 *   - config is present,
 *   - the Centrifugo server API is reachable and the api_key is correct (publish),
 *   - and mints real connection/subscription JWTs to test the token_secret path
 *     from an actual client.
 *
 *   php artisan centrifugo:smoke-test [--channel=user:1] [--user=1]
 */
class CentrifugoSmokeTest extends Command
{
    protected $signature = 'centrifugo:smoke-test {--channel=user:1 : Channel to publish the test event to} {--user=1 : User id to mint tokens for}';
    protected $description = 'Validate the Laravel ↔ Centrifugo connection (config, publish API, JWT minting)';

    public function handle(): int
    {
        $url     = rtrim((string) config('services.centrifugo.api_url'), '/');
        $key     = (string) config('services.centrifugo.api_key');
        $secret  = (string) config('services.centrifugo.token_secret');
        $channel = (string) $this->option('channel');
        $userId  = (int) $this->option('user');

        $this->line("centrifugo api  : <info>{$url}</info>");

        // 1) Config present?
        $missing = [];
        if ($url === '')    $missing[] = 'CENTRIFUGO_API_URL';
        if ($key === '')    $missing[] = 'CENTRIFUGO_API_KEY';
        if ($secret === '') $missing[] = 'CENTRIFUGO_TOKEN_SECRET';
        if ($missing) {
            $this->error('✗ Missing config: ' . implode(', ', $missing));
            return self::FAILURE;
        }
        $this->info('✓ Config present (api_url, api_key, token_secret).');

        // 2) Publish a test event - exercises reachability + api_key + the engine.
        try {
            $resp = Http::withHeaders(['X-API-Key' => $key])
                ->connectTimeout(2)->timeout(3)
                ->post($url . '/api/publish', [
                    'channel' => $channel,
                    'data'    => ['event' => 'centrifugo.smoke', 'payload' => ['ts' => time()]],
                ]);
        } catch (\Throwable $e) {
            $this->error('✗ Could not reach Centrifugo: ' . $e->getMessage());
            $this->line('  Is Centrifugo running and is api_url correct (box-local :8000)?');
            return self::FAILURE;
        }

        $body = $resp->json();
        if (!$resp->successful() || (is_array($body) && isset($body['error']))) {
            $this->error("✗ Publish failed - HTTP {$resp->status()}: " . json_encode($body ?? $resp->body()));
            $this->line('  401/403 → api_key mismatch. Connection refused → server down / wrong api_url.');
            $this->line('  "unknown channel" → check the namespace exists in config.json.');
            return self::FAILURE;
        }
        $this->info("✓ Published 'centrifugo.smoke' to '{$channel}' (HTTP {$resp->status()}).");

        // 3) Mint short-lived JWTs so you can prove the token_secret path from a client.
        $conn = CentrifugoClient::connectionToken($userId, 120);
        $sub  = CentrifugoClient::subscriptionToken($userId, "user:{$userId}", 120);
        $this->newLine();
        $this->line('Connection token (2 min) - paste into a client or the Centrifugo admin:');
        $this->line("<comment>{$conn}</comment>");
        $this->line("Subscription token (2 min) for <info>user:{$userId}</info>:");
        $this->line("<comment>{$sub}</comment>");
        $this->newLine();
        $this->info('Backend ↔ Centrifugo wiring looks good.');
        $this->line("Final check: connect a client with the connection token, subscribe to '{$channel}',");
        $this->line("then re-run this command - the client should receive the centrifugo.smoke event.");

        return self::SUCCESS;
    }
}
