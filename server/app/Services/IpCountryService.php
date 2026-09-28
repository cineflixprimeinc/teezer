<?php

namespace App\Services;

use App\Services\CountriesDev\CountriesDevGateway;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Resolves the real client IP and looks up country / ASN / ISP from:
 *   1. Cloudflare headers (CF-IPCountry primary, free + unlimited)
 *   2. Local MMDB file via geoip2/geoip2 (optional - only if file is present
 *      at config('services.geoip.mmdb_path'))
 *   2.5. countries.dev (optional, off by default - only reached when BOTH
 *      tiers above miss; one bounded, cache-and-circuit-breaker-protected
 *      call via CountriesDevGateway, which never throws and returns null on
 *      any failure/disabled/circuit-open/timeout)
 *   3. Default → NP (Nepal)
 *
 * Never throws. Tiers 1-2 and 3 never make outbound HTTP calls; Tier 2.5 may
 * make exactly one, fully bounded and protected - see CountriesDevGateway's
 * own docblock for the cache/single-flight/circuit-breaker/concurrency-guard
 * design that makes this safe to call on the request path at all.
 */
class IpCountryService
{
    public const DEFAULT_COUNTRY_CODE = 'NP';
    public const DEFAULT_COUNTRY_NAME = 'Nepal';

    public function __construct(private ?CountriesDevGateway $countriesDev = null)
    {
        $this->countriesDev ??= app(CountriesDevGateway::class);
    }

    /**
     * Extract the real client IP from common proxy headers, in order.
     * Trusts CF/Nginx because the app sits behind Cloudflare + Nginx.
     */
    public function resolveIp(Request $request): ?string
    {
        $candidates = [
            $request->headers->get('cf-connecting-ip'),
            $this->firstFromList($request->headers->get('x-forwarded-for')),
            $request->headers->get('x-real-ip'),
            $request->ip(),
        ];

        foreach ($candidates as $ip) {
            if (!$ip) continue;
            $ip = trim($ip);
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false) {
                return $ip;
            }
            // Accept private-range IPs too in dev - but only as a fallback if
            // no public IP was found earlier.
            if (filter_var($ip, FILTER_VALIDATE_IP) !== false) {
                return $ip;
            }
        }

        return null;
    }

    /**
     * Look up country / ASN / ISP for the given request. Never throws.
     *
     * @return array{
     *     countryCode: string,
     *     countryName: string,
     *     region: string|null,
     *     city: string|null,
     *     latitude: float|null,
     *     longitude: float|null,
     *     timezone: string|null,
     *     asnNumber: int|null,
     *     ispOrganization: string|null,
     *     source: string,
     *     reliable: bool,
     *     ip: string|null,
     *     ipHash: string|null
     * }
     */
    public function lookup(Request $request): array
    {
        $ip  = $this->resolveIp($request);
        $geo = $this->cfGeo($request);

        // Tier 1: Cloudflare header (always available behind CF proxy).
        $cfCountry = strtoupper((string) $request->headers->get('cf-ipcountry'));
        if ($this->isValidCountryCode($cfCountry)) {
            $base = $this->buildResult($cfCountry, null, null, 'cf-header', $ip, $geo);

            // Try MMDB to enrich with ASN/ISP if available.
            $mmdb = $this->mmdbLookup($ip);
            if ($mmdb !== null) {
                $base['asnNumber']       = $mmdb['asnNumber'];
                $base['ispOrganization'] = $mmdb['ispOrganization'];
                $base['source']          = 'cf-header+mmdb';
            }

            return $base;
        }

        // Tier 2: MMDB lookup.
        $mmdb = $this->mmdbLookup($ip);
        if ($mmdb !== null && $this->isValidCountryCode($mmdb['countryCode'])) {
            return $this->buildResult(
                $mmdb['countryCode'],
                $mmdb['asnNumber'],
                $mmdb['ispOrganization'],
                'mmdb',
                $ip,
                $geo,
            );
        }

        // Tier 2.5: countries.dev, only reached when CF header AND MMDB both
        // missed. Bounded, breaker-protected, single-flight, cached by
        // hashed IP - never blocks this request indefinitely, and any
        // failure/disabled/circuit-open state just falls through to Tier 3
        // below exactly as if this tier didn't exist.
        if ($ip) {
            $cd = $this->countriesDev->lookupByIp($ip);
            $cdCode = strtoupper((string) ($cd['countryCode'] ?? ''));
            if ($cd !== null && $this->isValidCountryCode($cdCode)) {
                return $this->buildResult($cdCode, null, null, 'countriesdev-ip', $ip, $geo);
            }
        }

        // Tier 3: Default.
        return $this->buildResult(self::DEFAULT_COUNTRY_CODE, null, null, 'default', $ip, $geo);
    }

    /**
     * City / region / lat / lng / timezone from Cloudflare's "Add visitor
     * location headers" managed transform. All null until that transform is
     * enabled on the zone; the country path above works regardless.
     *
     * @return array{region:?string, city:?string, latitude:?float, longitude:?float, timezone:?string}
     */
    private function cfGeo(Request $request): array
    {
        $h = fn (string $k): string => trim((string) $request->headers->get($k));

        // City / region can arrive percent-encoded ("S%C3%A3o%20Paulo").
        $city   = rawurldecode($h('cf-ipcity'));
        $region = rawurldecode($h('cf-region')) ?: rawurldecode($h('cf-region-code'));
        $lat    = $h('cf-iplatitude');
        $lng    = $h('cf-iplongitude');
        $tz     = $h('cf-timezone');

        return [
            'region'    => $region !== '' ? mb_substr($region, 0, 100) : null,
            'city'      => $city   !== '' ? mb_substr($city, 0, 100) : null,
            'latitude'  => is_numeric($lat) ? round((float) $lat, 5) : null,
            'longitude' => is_numeric($lng) ? round((float) $lng, 5) : null,
            'timezone'  => $tz !== '' ? mb_substr($tz, 0, 64) : null,
        ];
    }

    private function buildResult(string $code, ?int $asn, ?string $isp, string $source, ?string $ip, array $geo = []): array
    {
        $code = strtoupper($code);
        return [
            'countryCode'     => $code,
            'countryName'     => IsoCountries::nameFor($code),
            'region'          => $geo['region']    ?? null,
            'city'            => $geo['city']       ?? null,
            'latitude'        => $geo['latitude']   ?? null,
            'longitude'       => $geo['longitude']  ?? null,
            'timezone'        => $geo['timezone']   ?? null,
            'asnNumber'       => $asn,
            'ispOrganization' => $isp,
            'source'          => $source,
            // false ONLY for the hardcoded last-resort default - i.e. every
            // real signal (CF header, MMDB, or countries.dev) failed to
            // produce an answer. Lets callers (CountryAvailabilityService)
            // branch on "can we trust this?" without string-matching
            // 'source' themselves.
            'reliable'        => $source !== 'default',
            'ip'              => $ip,
            'ipHash'          => $ip ? $this->hashIp($ip) : null,
        ];
    }

    /**
     * SHA-256 of "<ip>|<APP_KEY>". Lets us count detections per device
     * without ever storing or exposing the raw IP.
     */
    public function hashIp(string $ip): string
    {
        return hash('sha256', $ip . '|' . config('app.key'));
    }

    /**
     * Try to load and query the local MMDB file via geoip2/geoip2.
     * Returns null if the library isn't installed, the file is missing,
     * or the lookup throws. Never raises.
     *
     * @return array{countryCode:string, asnNumber:?int, ispOrganization:?string}|null
     */
    private function mmdbLookup(?string $ip): ?array
    {
        if (!$ip) return null;

        $path = config('services.geoip.mmdb_path');
        if (!$path || !is_string($path) || !is_file($path)) {
            return null;
        }

        // Require the library at runtime so the app boots even if composer
        // dependency isn't installed yet.
        if (!class_exists(\GeoIp2\Database\Reader::class)) {
            return null;
        }

        static $reader = null;
        static $readerPath = null;

        try {
            if ($reader === null || $readerPath !== $path) {
                $reader     = new \GeoIp2\Database\Reader($path);
                $readerPath = $path;
            }

            // IPinfo Lite MMDB exposes country + asn + as_name on the
            // "country" record via the City reader's free fields. The
            // generic API call works across IPinfo Lite + MaxMind GeoLite2
            // by reading whichever fields exist.
            $record = $reader->country($ip);

            $code = strtoupper((string) ($record->country->isoCode ?? ''));
            if (!$this->isValidCountryCode($code)) {
                return null;
            }

            // ASN / ISP - fields differ by database type; read defensively.
            $asn = null;
            $isp = null;
            if (isset($record->traits)) {
                $asn = $record->traits->autonomousSystemNumber ?? null;
                $isp = $record->traits->autonomousSystemOrganization
                    ?? $record->traits->isp
                    ?? null;
            }

            return [
                'countryCode'     => $code,
                'asnNumber'       => $asn !== null ? (int) $asn : null,
                'ispOrganization' => $isp ? mb_substr((string) $isp, 0, 191) : null,
            ];
        } catch (Throwable $e) {
            Log::warning('IpCountryService MMDB lookup failed', ['ip' => $ip, 'error' => $e->getMessage()]);
            return null;
        }
    }

    private function firstFromList(?string $list): ?string
    {
        if (!$list) return null;
        $first = explode(',', $list)[0] ?? null;
        return $first !== null ? trim($first) : null;
    }

    public function isValidCountryCode(?string $code): bool
    {
        return $code !== null && IsoCountries::isValid(strtoupper($code));
    }
}
