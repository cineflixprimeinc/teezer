<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Self-hosted link-preview generator. Fetches a URL server-side, parses its
 * Open Graph / Twitter / standard meta tags and returns a small preview card
 * payload. No headless browser, no external API → unlimited and cheap.
 *
 * Security: every hop (including redirects) is SSRF-checked - the resolved IP
 * must be public, so user-submitted links can't make the server reach private
 * networks or the cloud metadata endpoint. Results are cached for a day.
 */
class LinkPreviewService
{
    private const TTL_OK    = 86400; // 1 day
    private const TTL_FAIL  = 3600;  // 1 hour (avoid hammering dead links)
    private const MAX_BYTES = 524288; // 512 KB of HTML is plenty for <head>
    private const MAX_HOPS  = 3;
    private const UA        = 'Mozilla/5.0 (compatible; TeezerBot/1.0; +https://teezer.live/bot)';

    /** @return array<string,mixed>|null preview data, or null when unavailable */
    public function preview(string $url): ?array
    {
        $url = trim($url);
        if ($url === '' || mb_strlen($url) > 2048) {
            return null;
        }

        $cacheKey = 'linkpreview:' . sha1($url);
        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return $cached === 'none' ? null : $cached;
        }

        $result = null;
        try {
            $result = $this->build($url);
        } catch (\Throwable) {
            $result = null;
        }

        Cache::put($cacheKey, $result ?? 'none', $result ? self::TTL_OK : self::TTL_FAIL);
        return $result;
    }

    private function build(string $url): ?array
    {
        [$finalUrl, $html] = $this->fetch($url);
        if ($html === null) {
            return null;
        }

        $title = $this->meta($html, ['og:title', 'twitter:title'])
            ?? $this->titleTag($html);
        $description = $this->meta($html, ['og:description', 'twitter:description', 'description']);
        $image = $this->meta($html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
        $siteName = $this->meta($html, ['og:site_name']) ?? parse_url($finalUrl, PHP_URL_HOST);

        $image = $image ? $this->absolutize($image, $finalUrl) : null;
        // Only surface images that are themselves safe public URLs.
        if ($image && !$this->isSafeUrl($image)) {
            $image = null;
        }

        $favicon = $this->favicon($html, $finalUrl);

        if (!$title && !$image) {
            return null; // nothing worth showing
        }

        return [
            'url'         => $finalUrl,
            'title'       => $this->clip($title, 200),
            'description' => $this->clip($description, 320),
            'image'       => $image,
            'site_name'   => $this->clip($siteName, 100),
            'favicon'     => $favicon,
        ];
    }

    /** @return array{0:string,1:?string} [finalUrl, html|null] - follows redirects with SSRF checks. */
    private function fetch(string $start): array
    {
        $current = $start;

        for ($hop = 0; $hop <= self::MAX_HOPS; $hop++) {
            if (!$this->isSafeUrl($current)) {
                return [$current, null];
            }

            $res = Http::withHeaders([
                'User-Agent' => self::UA,
                'Accept'     => 'text/html,application/xhtml+xml',
            ])->timeout(6)->connectTimeout(4)->withoutRedirecting()->get($current);

            $status = $res->status();
            if ($status >= 300 && $status < 400) {
                $loc = $res->header('Location');
                if (!$loc) {
                    return [$current, null];
                }
                $current = $this->absolutize($loc, $current);
                continue;
            }

            if (!$res->successful()) {
                return [$current, null];
            }

            $type = strtolower((string) $res->header('Content-Type'));
            if ($type !== '' && !str_contains($type, 'html') && !str_contains($type, 'xml')) {
                return [$current, null];
            }

            return [$current, substr($res->body(), 0, self::MAX_BYTES)];
        }

        return [$current, null];
    }

    /* ── SSRF guard ──────────────────────────────────────────────────────── */

    private function isSafeUrl(string $url): bool
    {
        $p = parse_url($url);
        if (!$p || empty($p['scheme']) || empty($p['host'])) {
            return false;
        }
        if (!in_array(strtolower($p['scheme']), ['http', 'https'], true)) {
            return false;
        }
        $host = strtolower($p['host']);
        if (preg_match('/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/', $host)) {
            return false;
        }
        $ips = $this->resolveIps($host);
        if (!$ips) {
            return false;
        }
        foreach ($ips as $ip) {
            if (!$this->isPublicIp($ip)) {
                return false; // any private/reserved hop → reject
            }
        }
        return true;
    }

    /** @return array<int,string> */
    private function resolveIps(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }
        $ips = [];
        foreach (@dns_get_record($host, DNS_A) ?: [] as $r) {
            if (!empty($r['ip'])) $ips[] = $r['ip'];
        }
        foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) {
            if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
        if (!$ips) {
            $h = @gethostbyname($host);
            if ($h && $h !== $host) $ips[] = $h;
        }
        return $ips;
    }

    private function isPublicIp(string $ip): bool
    {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }

    /* ── Parsing helpers ─────────────────────────────────────────────────── */

    /** @param array<int,string> $names */
    private function meta(string $html, array $names): ?string
    {
        foreach ($names as $name) {
            $q = preg_quote($name, '/');
            // property/name THEN content
            if (preg_match('/<meta[^>]+(?:property|name)\s*=\s*["\']' . $q . '["\'][^>]*?content\s*=\s*["\']([^"\']*)["\']/i', $html, $m)
                || preg_match('/<meta[^>]+content\s*=\s*["\']([^"\']*)["\'][^>]*?(?:property|name)\s*=\s*["\']' . $q . '["\']/i', $html, $m)) {
                $val = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5);
                if ($val !== '') {
                    return $val;
                }
            }
        }
        return null;
    }

    private function titleTag(string $html): ?string
    {
        if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
            $t = html_entity_decode(trim(preg_replace('/\s+/', ' ', $m[1]) ?? ''), ENT_QUOTES | ENT_HTML5);
            return $t !== '' ? $t : null;
        }
        return null;
    }

    private function favicon(string $html, string $baseUrl): ?string
    {
        if (preg_match('/<link[^>]+rel\s*=\s*["\'][^"\']*icon[^"\']*["\'][^>]*href\s*=\s*["\']([^"\']+)["\']/i', $html, $m)
            || preg_match('/<link[^>]+href\s*=\s*["\']([^"\']+)["\'][^>]*rel\s*=\s*["\'][^"\']*icon[^"\']*["\']/i', $html, $m)) {
            $icon = $this->absolutize(html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5), $baseUrl);
            return $this->isSafeUrl($icon) ? $icon : null;
        }
        $p = parse_url($baseUrl);
        if (!empty($p['scheme']) && !empty($p['host'])) {
            return "{$p['scheme']}://{$p['host']}/favicon.ico";
        }
        return null;
    }

    private function absolutize(string $link, string $base): string
    {
        $link = trim($link);
        if ($link === '' || preg_match('#^https?://#i', $link)) {
            return $link;
        }
        $b = parse_url($base);
        if (empty($b['scheme']) || empty($b['host'])) {
            return $link;
        }
        $origin = "{$b['scheme']}://{$b['host']}" . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($link, '//')) {
            return "{$b['scheme']}:{$link}";
        }
        if (str_starts_with($link, '/')) {
            return $origin . $link;
        }
        $path = isset($b['path']) ? preg_replace('#/[^/]*$#', '/', $b['path']) : '/';
        return $origin . ($path ?: '/') . $link;
    }

    private function clip(?string $s, int $len): ?string
    {
        if ($s === null) {
            return null;
        }
        $s = trim($s);
        return mb_strlen($s) > $len ? mb_substr($s, 0, $len - 1) . '…' : $s;
    }
}
