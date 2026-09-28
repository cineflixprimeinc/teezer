<?php

namespace App\Services\Realtime;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Thin server-side client for the Cloudflare Realtime SFU (formerly Cloudflare
 * Calls). It talks to https://rtc.live.cloudflare.com/v1/apps/{appId}/... with
 * the app's API token, which stays server-side and is NEVER sent to a client.
 *
 * The SFU is a selective forwarding unit: a broadcaster publishes local tracks
 * to a session; each viewer subscribes to those remote tracks in their own
 * session. This class only exchanges SDP + track metadata with the SFU; the
 * actual WebRTC media flows browser/app ⇄ Cloudflare edge, not through us.
 *
 * Foundation for live audio rooms (audio-only tracks) and, later, video live
 * streaming. All methods throw RuntimeException on failure so callers can map
 * to a clean API error; nothing here blocks unrelated requests.
 */
class CloudflareRealtimeService
{
    public function __construct(
        private ?string $appId = null,
        private ?string $apiToken = null,
        private ?string $baseUrl = null,
    ) {
        $this->appId    ??= (string) config('services.cloudflare_realtime.app_id');
        $this->apiToken ??= (string) config('services.cloudflare_realtime.api_token');
        $this->baseUrl  ??= rtrim((string) config('services.cloudflare_realtime.base_url'), '/');
    }

    /** True once both the app id and token are configured. */
    public function isConfigured(): bool
    {
        return $this->appId !== '' && $this->apiToken !== '';
    }

    /**
     * Create a new SFU session. Pass a WebRTC offer to immediately establish the
     * peer connection, or omit it to create a bare session and add tracks later.
     *
     * @param array{type:string,sdp:string}|null $offer
     * @return array{sessionId:string, sessionDescription?:array}
     */
    public function newSession(?array $offer = null): array
    {
        $body = $offer ? ['sessionDescription' => $offer] : [];
        $res  = $this->request('POST', "/sessions/new", $body);

        if (empty($res['sessionId'])) {
            throw new RuntimeException('Cloudflare Realtime: no sessionId returned.');
        }
        return $res;
    }

    /**
     * Publish local tracks (broadcaster) or subscribe to remote tracks (viewer).
     *
     * Publish: tracks like [{location:'local', mid:'0', trackName:'mic'}] with a
     * local SDP offer. Subscribe: [{location:'remote', sessionId, trackName}].
     *
     * @param array{type:string,sdp:string}|null $sessionDescription
     * @param array<int,array<string,mixed>> $tracks
     */
    public function newTracks(string $sessionId, array $tracks, ?array $sessionDescription = null): array
    {
        $body = ['tracks' => $tracks];
        if ($sessionDescription) {
            $body['sessionDescription'] = $sessionDescription;
        }
        return $this->request('POST', "/sessions/{$sessionId}/tracks/new", $body);
    }

    /** Apply a renegotiation answer/offer to an existing session. */
    public function renegotiate(string $sessionId, array $sessionDescription): array
    {
        return $this->request('PUT', "/sessions/{$sessionId}/renegotiate", [
            'sessionDescription' => $sessionDescription,
        ]);
    }

    /** Close one or more tracks on a session (e.g. when a speaker leaves). */
    public function closeTracks(string $sessionId, array $tracks, ?array $sessionDescription = null, bool $force = false): array
    {
        $body = ['tracks' => $tracks, 'force' => $force];
        if ($sessionDescription) {
            $body['sessionDescription'] = $sessionDescription;
        }
        return $this->request('PUT', "/sessions/{$sessionId}/tracks/close", $body);
    }

    /** Current server-side view of a session's tracks. */
    public function getSession(string $sessionId): array
    {
        return $this->request('GET', "/sessions/{$sessionId}");
    }

    private function request(string $method, string $path, array $body = []): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Cloudflare Realtime is not configured (CF_REALTIME_APP_ID / CF_REALTIME_API_TOKEN).');
        }

        $url = "{$this->baseUrl}/apps/{$this->appId}{$path}";

        try {
            $req = Http::withToken($this->apiToken)
                ->acceptJson()
                ->timeout(10);

            // The SFU rejects an empty JSON object ({}) on endpoints that take an
            // optional body (e.g. /sessions/new with no offer) - send no body at
            // all in that case.
            $options = $body === [] ? [] : ['json' => $body];
            $resp = $method === 'GET'
                ? $req->get($url)
                : $req->send($method, $url, $options);
        } catch (\Throwable $e) {
            Log::warning('Cloudflare Realtime request failed', ['path' => $path, 'error' => $e->getMessage()]);
            throw new RuntimeException('Cloudflare Realtime request failed: ' . $e->getMessage(), 0, $e);
        }

        if (! $resp->successful()) {
            Log::warning('Cloudflare Realtime non-2xx', ['path' => $path, 'status' => $resp->status(), 'body' => $resp->body()]);
            throw new RuntimeException("Cloudflare Realtime {$path} returned HTTP {$resp->status()}.");
        }

        return (array) $resp->json();
    }
}
