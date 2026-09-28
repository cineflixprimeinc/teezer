<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Proxy + cache layer for OpenStreetMap Nominatim geocoding.
 *
 * All outbound requests add the required User-Agent and Accept-Language
 * headers per the Nominatim usage policy. Results are cached to reduce
 * load on the public instance; swap NOMINATIM_BASE in .env to point at
 * a self-hosted server when traffic warrants it.
 */
class LocationService
{
    private string $base;

    public function __construct()
    {
        $this->base = rtrim(config('services.nominatim.base_url', 'https://nominatim.openstreetmap.org'), '/');
    }

    /* ── Search ─────────────────────────────────────────────────────────── */

    /**
     * Search for places matching $query, optionally scoped to $countryCode.
     * Returns an array of formatted location objects (no raw coords).
     */
    public function search(string $query, ?string $countryCode = null): array
    {
        $key = 'nominatim:search:' . md5(mb_strtolower(trim($query) . ':' . strtolower($countryCode ?? '')));

        return Cache::remember($key, 3600, function () use ($query, $countryCode) {
            $params = [
                'q'             => $query,
                'format'        => 'json',
                'addressdetails'=> 1,
                'limit'         => 8,
            ];

            if ($countryCode) {
                $params['countrycodes'] = strtolower($countryCode);
            }

            try {
                $res = $this->client()->get($this->base . '/search', $params);

                if (! $res->ok()) {
                    return [];
                }

                return collect($res->json())
                    ->map(fn ($item) => $this->format($item))
                    ->filter()
                    ->values()
                    ->all();

            } catch (\Throwable $e) {
                Log::warning('Nominatim search error', ['err' => $e->getMessage()]);
                return [];
            }
        });
    }

    /* ── Reverse geocode ─────────────────────────────────────────────────── */

    /**
     * Reverse-geocode GPS coordinates into a structured location.
     * Coordinates are rounded to 3 decimal places (~100 m precision)
     * for cache key generation so nearby points share results.
     */
    public function reverseGeocode(float $lat, float $lng): ?array
    {
        $key = 'nominatim:rev:' . round($lat, 3) . ':' . round($lng, 3);

        return Cache::remember($key, 86400, function () use ($lat, $lng) {
            try {
                $res = $this->client()->get($this->base . '/reverse', [
                    'lat'           => $lat,
                    'lon'           => $lng,
                    'format'        => 'json',
                    'addressdetails'=> 1,
                ]);

                if (! $res->ok()) {
                    return null;
                }

                return $this->format($res->json());

            } catch (\Throwable $e) {
                Log::warning('Nominatim reverse-geocode error', ['err' => $e->getMessage()]);
                return null;
            }
        });
    }

    /* ── Internals ──────────────────────────────────────────────────────── */

    private function client()
    {
        // Nominatim blocks generic or absent User-Agents, so this header is not
        // optional - it is the difference between working and a flat 403. It
        // was hardcoded here, which meant the admin panel's user_agent field
        // for this provider had no effect; now the panel can set it, and the
        // previous literal remains the fallback so nothing changes by default.
        $userAgent = config('services.nominatim.user_agent')
            ?: 'Teezer/1.0 (' . config('app.url') . ')';

        return Http::withHeaders([
            'User-Agent'      => $userAgent,
            'Accept-Language' => 'en',
        ])->timeout(6);
    }

    /**
     * Turn a raw Nominatim result into the shape consumed by the API and
     * the frontend. Raw coordinates ARE included here so the controller
     * can store them - they must never be returned in public API responses.
     */
    private function format(array $item): ?array
    {
        $addr = $item['address'] ?? [];

        $city    = $addr['city']         ?? $addr['town']    ?? $addr['village']
                ?? $addr['municipality'] ?? $addr['county']  ?? null;
        $region  = $addr['state']        ?? $addr['province'] ?? $addr['region'] ?? null;
        $country = $addr['country']      ?? null;
        $code    = strtoupper($addr['country_code'] ?? '');

        if (! $city && ! $region && ! $country) {
            return null;
        }

        $parts     = array_values(array_filter([$city, $region, $country]));
        $formatted = implode(', ', $parts);

        return [
            'formatted'    => $formatted,
            'city'         => $city,
            'region'       => $region,
            'country'      => $country,
            'country_code' => $code,
            // Raw coordinates included only for internal persistence;
            // controllers must NOT echo these back to clients.
            '_lat' => isset($item['lat']) ? (float) $item['lat'] : null,
            '_lng' => isset($item['lon']) ? (float) $item['lon'] : null,
        ];
    }
}
