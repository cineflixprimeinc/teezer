<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\LocationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    public function __construct(private LocationService $locations) {}

    /* ── GET /api/v1/location/search ────────────────────────────────────── */

    public function search(Request $request): JsonResponse
    {
        $request->validate([
            'q'       => ['required', 'string', 'min:2', 'max:100'],
            'country' => ['nullable', 'string', 'size:2'],
        ]);

        $results = $this->locations->search(
            $request->input('q'),
            $request->input('country'),
        );

        // Strip internal coordinate keys before returning to clients.
        $safe = array_map(function (array $r): array {
            unset($r['_lat'], $r['_lng']);
            return $r;
        }, $results);

        return response()->json(['success' => true, 'data' => $safe]);
    }

    /* ── POST /api/v1/location/reverse-geocode ───────────────────────────── */

    /**
     * Accepts GPS coordinates from the browser (the raw lat/lng is
     * never stored on the client - it's forwarded here immediately and
     * we return only the formatted address).
     */
    public function reverseGeocode(Request $request): JsonResponse
    {
        $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $result = $this->locations->reverseGeocode(
            (float) $request->input('lat'),
            (float) $request->input('lng'),
        );

        if (! $result) {
            return response()->json(['success' => false, 'message' => 'Could not determine your location.'], 422);
        }

        // Include raw coords temporarily so the frontend can pass them
        // back in a subsequent /location/save call, but rename keys so
        // it's clear they should not be displayed.
        return response()->json([
            'success' => true,
            'data'    => [
                'formatted'    => $result['formatted'],
                'city'         => $result['city'],
                'region'       => $result['region'],
                'country'      => $result['country'],
                'country_code' => $result['country_code'],
                'lat'          => $result['_lat'],
                'lng'          => $result['_lng'],
            ],
        ]);
    }

    /* ── POST /api/v1/location/save ─────────────────────────────────────── */

    public function save(Request $request): JsonResponse
    {
        $request->validate([
            'local_location' => ['required', 'string', 'max:500'],
            'city_name'      => ['nullable', 'string', 'max:191'],
            'region_name'    => ['nullable', 'string', 'max:191'],
            'country_name'   => ['nullable', 'string', 'max:100'],
            'country_code'   => ['nullable', 'string', 'size:2'],
            'lat'            => ['nullable', 'numeric', 'between:-90,90'],
            'lng'            => ['nullable', 'numeric', 'between:-180,180'],
            'source'         => ['nullable', 'string', 'in:gps,ip,manual,nominatim,none'],
        ]);

        /** @var User $user */
        $user = $request->user();

        $user->forceFill([
            'local_location'     => $request->input('local_location'),
            'city_name'          => $request->input('city_name'),
            'region_name'        => $request->input('region_name'),
            // Keep the legacy free-text `location` column in sync so
            // existing code paths that read that column still work.
            'location'           => $request->input('local_location'),
            'location_lat'       => $request->input('lat'),
            'location_lng'       => $request->input('lng'),
            'location_source'    => $request->input('source', 'manual'),
            'location_updated_at'=> now(),
        ])->save();

        return response()->json([
            'success' => true,
            'message' => 'Location saved.',
            'data'    => $this->publicLocationData($user),
        ]);
    }

    /* ── GET /api/v1/location/me ─────────────────────────────────────────── */

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data'    => $this->publicLocationData($user),
        ]);
    }

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    /** Returns only the fields that are safe to expose publicly. */
    private function publicLocationData(User $user): array
    {
        return [
            'local_location'     => $user->local_location,
            'city_name'          => $user->city_name,
            'region_name'        => $user->region_name,
            'country_name'       => $user->selected_country_name ?? $user->country,
            'country_code'       => $user->selected_country_code,
            'location_source'    => $user->location_source ?? 'none',
            'location_updated_at'=> $user->location_updated_at?->toIso8601String(),
            // Coordinates are intentionally omitted.
        ];
    }
}
