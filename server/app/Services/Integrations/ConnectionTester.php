<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * "Test Connection" for each provider.
 *
 * Two hard rules, both about not causing damage from a settings screen:
 *
 *  1. Every test is READ-ONLY or a token mint. Never a charge, never a write,
 *     never an upload. An admin clicking Test on PayPal must not be able to
 *     create an order.
 *  2. Nothing returned from here reaches the browser unredacted. Provider error
 *     bodies routinely quote the credential that failed - Stripe echoes the key
 *     prefix, PayPal returns the client id - and this string is displayed in the
 *     panel and stored in `last_error`.
 *
 * Tests are dispatched on the definition's `test` key, so a new provider that
 * needs one of the existing shapes (ping / token) costs nothing beyond its
 * config entry.
 */
class ConnectionTester
{
    /** Short: a settings screen must not hang on a dead provider. */
    private const TIMEOUT = 8;

    /**
     * @return array{ok: bool, message: string}
     */
    public function test(string $provider): array
    {
        $definition = IntegrationRegistry::definition($provider);
        if ($definition === null) {
            return ['ok' => false, 'message' => 'Unknown integration.'];
        }

        $kind = $definition['test'] ?? 'none';
        if ($kind === 'none') {
            return ['ok' => false, 'message' => 'This integration has no connection test.'];
        }

        if (! IntegrationRegistry::isReady($provider)) {
            return ['ok' => false, 'message' => 'Fill in the required fields and enable the integration first.'];
        }

        try {
            return match ($provider) {
                'spotify'           => $this->testSpotify(),
                'musicbrainz'       => $this->testUserAgentApi('musicbrainz', '/release?query=test&fmt=json&limit=1'),
                'wikipedia'         => $this->testUserAgentApi('wikipedia', '/page/summary/Music'),
                'bunnycdn'          => $this->testBunnyCdn(),
                'cloudflare_stream' => $this->testCloudflareStream(),
                'aws_rekognition'   => $this->testAwsRekognition(),
                'google_vision'     => $this->testGoogleVision(),
                'agora'             => $this->testAgora(),
                default             => $this->testGeneric($provider, $kind),
            };
        } catch (Throwable $e) {
            // Redacted deliberately - see the class note. The unredacted detail
            // goes nowhere: the exception message is the most likely place for a
            // credential to appear, so it is not logged either.
            return ['ok' => false, 'message' => $this->redact($e->getMessage(), $provider)];
        }
    }

    /**
     * Spotify: mint a client-credentials token. This is the real proof that the
     * client id and secret are a valid pair - anything less (a bare GET) would
     * pass with wrong credentials because the endpoint is public.
     */
    private function testSpotify(): array
    {
        $config = IntegrationRegistry::config('spotify');

        $response = Http::timeout(self::TIMEOUT)
            ->asForm()
            ->withBasicAuth($config['client_id'] ?? '', $config['client_secret'] ?? '')
            ->post($config['token_url'] ?? 'https://accounts.spotify.com/api/token', [
                'grant_type' => 'client_credentials',
            ]);

        if ($response->successful() && filled($response->json('access_token'))) {
            $expiresIn = (int) ($response->json('expires_in') ?? 3600);

            return ['ok' => true, 'message' => "Connected. Token valid for {$expiresIn}s."];
        }

        // Spotify's own wording is safe here (invalid_client / invalid_grant) and
        // is far more useful than a generic failure.
        $code = $response->json('error') ?? $response->status();

        return ['ok' => false, 'message' => "Spotify rejected the credentials ({$code})."];
    }

    /**
     * MusicBrainz and Wikipedia: no credentials, so the only thing worth testing
     * is that our User-Agent is accepted. Both block generic or absent agents,
     * which is the failure this catches.
     */
    private function testUserAgentApi(string $provider, string $path): array
    {
        $config = IntegrationRegistry::config($provider);
        $base   = rtrim((string) ($config['api_endpoint'] ?? ''), '/');

        $response = Http::timeout(self::TIMEOUT)
            ->withHeaders(['User-Agent' => $config['user_agent'] ?? '', 'Accept' => 'application/json'])
            ->get($base . $path);

        if ($response->successful()) {
            return ['ok' => true, 'message' => 'Connected. User-Agent accepted.'];
        }

        if ($response->status() === 403) {
            return ['ok' => false, 'message' => 'Blocked (403). The User-Agent must name the app and a contact address.'];
        }

        return ['ok' => false, 'message' => "Endpoint returned HTTP {$response->status()}."];
    }

    /**
     * Bunny.net: list video libraries with the ACCOUNT key.
     *
     * A reachability ping would pass with no key at all, so this uses the one
     * endpoint that fails closed on a bad key. 401 is the answer that actually
     * tells the operator something.
     */
    private function testBunnyCdn(): array
    {
        $config = IntegrationRegistry::config('bunnycdn');

        $response = Http::timeout(self::TIMEOUT)
            ->withHeaders(['AccessKey' => (string) ($config['api_key'] ?? ''), 'Accept' => 'application/json'])
            ->get('https://api.bunny.net/videolibrary', ['page' => 1, 'perPage' => 1]);

        if ($response->status() === 401) {
            return ['ok' => false, 'message' => 'Bunny.net rejected the account API key (401).'];
        }

        if (! $response->successful()) {
            return ['ok' => false, 'message' => "Bunny.net returned HTTP {$response->status()}."];
        }

        $total = $response->json('TotalItems');
        $libraryId = trim((string) ($config['stream_library_id'] ?? ''));

        // Having the key is not the same as having the library the app will
        // actually upload to, so confirm that too when one is configured.
        if ($libraryId !== '') {
            $library = Http::timeout(self::TIMEOUT)
                ->withHeaders(['AccessKey' => (string) ($config['api_key'] ?? ''), 'Accept' => 'application/json'])
                ->get("https://api.bunny.net/videolibrary/{$libraryId}");

            if (! $library->successful()) {
                return ['ok' => false, 'message' => "Key is valid, but Stream library {$libraryId} was not found on this account."];
            }

            return ['ok' => true, 'message' => 'Connected. Library "' . $library->json('Name') . '" is reachable.'];
        }

        return ['ok' => true, 'message' => 'Connected. ' . (is_numeric($total) ? "{$total} video libraries." : 'Account key accepted.')];
    }

    /**
     * Cloudflare Stream: list videos on the account.
     *
     * Deliberately scoped to the Stream endpoint rather than /user/tokens/verify
     * - a token can be valid overall and still lack Stream:Edit, which is the
     * failure that would otherwise only appear on the first upload.
     */
    private function testCloudflareStream(): array
    {
        $config    = IntegrationRegistry::config('cloudflare_stream');
        $accountId = trim((string) ($config['account_id'] ?? ''));

        if ($accountId === '') {
            return ['ok' => false, 'message' => 'Account ID is required.'];
        }

        $response = Http::timeout(self::TIMEOUT)
            ->withToken((string) ($config['api_token'] ?? ''))
            ->acceptJson()
            ->get("https://api.cloudflare.com/client/v4/accounts/{$accountId}/stream", ['per_page' => 1]);

        if ($response->successful() && $response->json('success') === true) {
            $count = count((array) $response->json('result', []));

            return ['ok' => true, 'message' => "Connected. Stream API reachable ({$count} video(s) returned)."];
        }

        // Cloudflare's own error text names the missing permission, which is
        // exactly what the operator needs, and contains no credential.
        $detail = $response->json('errors.0.message') ?? "HTTP {$response->status()}";

        return ['ok' => false, 'message' => "Cloudflare rejected the request: {$detail}"];
    }

    /**
     * AWS Rekognition: run DetectModerationLabels on a generated 1x1 PNG.
     *
     * This is the actual operation the moderation pipeline calls, so it proves
     * the credential AND the rekognition:DetectModerationLabels permission AND
     * that the region is one where the service exists. Listing collections
     * would pass without the permission that matters.
     *
     * It costs one API request. The image is built here rather than fetched so
     * the test needs no network beyond AWS itself.
     */
    private function testAwsRekognition(): array
    {
        if (! class_exists(\Aws\Rekognition\RekognitionClient::class)) {
            return ['ok' => false, 'message' => 'The AWS SDK is not installed on this server.'];
        }

        $config = IntegrationRegistry::config('aws_rekognition');
        $region = trim((string) ($config['region'] ?? '')) ?: 'us-east-1';

        $client = new \Aws\Rekognition\RekognitionClient([
            'version'     => 'latest',
            'region'      => $region,
            'credentials' => [
                'key'    => (string) ($config['access_key_id'] ?? ''),
                'secret' => (string) ($config['secret_access_key'] ?? ''),
            ],
        ]);

        // Smallest valid PNG: 1x1, fully transparent.
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );

        try {
            $client->detectModerationLabels([
                'Image'         => ['Bytes' => $png],
                'MinConfidence' => (float) ($config['min_confidence'] ?? 60),
            ]);
        } catch (\Aws\Exception\AwsException $e) {
            $code = $e->getAwsErrorCode() ?: 'AwsError';

            return match ($code) {
                'InvalidSignatureException', 'UnrecognizedClientException'
                    => ['ok' => false, 'message' => 'AWS rejected the credentials.'],
                'AccessDeniedException'
                    => ['ok' => false, 'message' => 'Credentials are valid but lack rekognition:DetectModerationLabels.'],
                default
                    => ['ok' => false, 'message' => "AWS returned {$code}."],
            };
        }

        return ['ok' => true, 'message' => "Connected. DetectModerationLabels succeeded in {$region}."];
    }

    /**
     * Google Cloud Vision: SafeSearch on a generated 1x1 PNG.
     *
     * Same reasoning as Rekognition - this calls the feature the moderation
     * pipeline uses, so a key that exists but has the Vision API disabled fails
     * here rather than on the first real upload.
     */
    private function testGoogleVision(): array
    {
        $config   = IntegrationRegistry::config('google_vision');
        $endpoint = rtrim((string) ($config['api_endpoint'] ?? ''), '/') ?: 'https://vision.googleapis.com/v1';
        $apiKey   = trim((string) ($config['api_key'] ?? ''));

        if ($apiKey === '') {
            return ['ok' => false, 'message' => 'An API key is required for the connection test.'];
        }

        $response = Http::timeout(self::TIMEOUT)
            ->acceptJson()
            ->post($endpoint . '/images:annotate?key=' . urlencode($apiKey), [
                'requests' => [[
                    'image'    => ['content' => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
                    'features' => [['type' => 'SAFE_SEARCH_DETECTION', 'maxResults' => 1]],
                ]],
            ]);

        if ($response->successful() && is_array($response->json('responses'))) {
            return ['ok' => true, 'message' => 'Connected. SafeSearch detection responded.'];
        }

        $detail = $response->json('error.message') ?? "HTTP {$response->status()}";

        // Google's message names the exact cause (API not enabled, key
        // restricted to other referrers, billing off) and carries no secret.
        return ['ok' => false, 'message' => "Google rejected the request: {$detail}"];
    }

    /**
     * Agora: list projects with the REST customer credentials.
     *
     * Note this tests the REST pair, not the App ID/Certificate - those mint
     * client tokens locally and have nothing to call. The panel says so.
     */
    private function testAgora(): array
    {
        $config = IntegrationRegistry::config('agora');

        $response = Http::timeout(self::TIMEOUT)
            ->withBasicAuth(
                (string) ($config['customer_id'] ?? ''),
                (string) ($config['customer_secret'] ?? ''),
            )
            ->acceptJson()
            ->get('https://api.agora.io/dev/v1/projects');

        if ($response->status() === 401) {
            return ['ok' => false, 'message' => 'Agora rejected the Customer ID / Secret (401).'];
        }

        if (! $response->successful()) {
            return ['ok' => false, 'message' => "Agora returned HTTP {$response->status()}."];
        }

        $projects = (array) $response->json('data', []);
        $appId    = trim((string) ($config['app_id'] ?? ''));

        // Confirm the configured App ID actually belongs to this account - the
        // common misconfiguration is credentials from one project and an App ID
        // copied from another.
        if ($appId !== '' && $projects !== []) {
            $match = array_filter($projects, fn ($p) => ($p['vendor_key'] ?? null) === $appId);

            if ($match === []) {
                return ['ok' => false, 'message' => 'Credentials are valid, but the App ID does not belong to this account.'];
            }
        }

        return ['ok' => true, 'message' => 'Connected. ' . count($projects) . ' project(s) on this account.'];
    }

    /**
     * Providers whose test is a plain reachability check. Kept generic so a new
     * integration declaring test => 'ping' works with no code here.
     */
    private function testGeneric(string $provider, string $kind): array
    {
        $config   = IntegrationRegistry::config($provider);
        $endpoint = $config['api_endpoint'] ?? null;

        if (blank($endpoint)) {
            return ['ok' => false, 'message' => 'No API endpoint configured, so there is nothing to test.'];
        }

        $response = Http::timeout(self::TIMEOUT)->get($endpoint);

        // Any answer proves reachability and DNS/TLS. Auth-specific checks are
        // per-provider and belong in their own method, not here - a 401 from a
        // reachable host is still a successful connectivity test.
        return $response->status() > 0
            ? ['ok' => true, 'message' => "Endpoint reachable (HTTP {$response->status()})."]
            : ['ok' => false, 'message' => 'Endpoint unreachable.'];
    }

    /**
     * Strip anything that looks like our own credential out of a message before
     * it is shown or stored.
     */
    private function redact(string $message, string $provider): string
    {
        $config = IntegrationRegistry::config($provider);

        foreach ($config as $value) {
            // Only long values: redacting a 3-character region code would mangle
            // unrelated words in the message.
            if (is_string($value) && strlen($value) >= 8) {
                $message = str_replace($value, '[redacted]', $message);
            }
        }

        // Belt and braces for tokens that never passed through our config -
        // an upstream error quoting a bearer token it generated, say.
        $message = preg_replace('/\b(sk|pk|rk)_[A-Za-z0-9]{8,}/', '[redacted]', $message) ?? $message;

        return mb_substr($message, 0, 300);
    }
}
