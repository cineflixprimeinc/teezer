# Teezer nginx vhosts

| File | Host(s) | Box | Proxies to |
|---|---|---|---|
| `teezer-web.conf` | teezer.live, www.teezer.live | VPS1 | Next.js web 127.0.0.1:3000 |
| `teezer-admin.conf` | backend.teezer.live | VPS1 | Next.js admin 127.0.0.1:3001 |
| `teezer-api.conf` | api.teezer.live | VPS1 | APISIX 127.0.0.1:9080 |
| `teezer-api-internal.conf` | (loopback only) | VPS1 | 127.0.0.1:8091 -> php-fpm |
| `teezer-api.conf.pre-apisix` | api.teezer.live | VPS1 | rollback: direct php-fpm |
| `teezer-media.conf` | cdn.teezer.live (+ media.teezer.live) | VPS1 | private B2 bucket (signed URLs) |
| `teezer-realtime.conf` | realtime.teezer.live | VPS1 | Centrifugo 127.0.0.1:8000 `/connection/` only |
| `teezer-livekit.conf` | livekit.teezer.live | **VPS2** | livekit-server 127.0.0.1:7880 |
| `teezer-static-cache-map.conf` | (http-context map) | VPS1 | - |
| `teezer-frontend.conf` | legacy duplicate of web - do not enable | - | - |

All VPS1 vhosts use the certbot certificate `/etc/letsencrypt/live/teezer.live/`
(Cloudflare SSL mode **Full (strict)**); `teezer-livekit.conf` uses its own
`/etc/letsencrypt/live/livekit.teezer.live/` on VPS2. Obtain certificates
before enabling the vhosts - see DEPLOYMENT.md at the repo root.

`teezer-media.conf` contains the placeholder `__B2_DOWNLOAD_HOST__` (Teezer's
bucket download host, e.g. `f00X.backblazeb2.com`, depends on bucket region).
`install.sh` substitutes it from `B2_DOWNLOAD_HOST`; if you copy the file by
hand, replace it yourself.

# Self-hosted signed media origin

Replaces the Cloudflare Worker. Media lives in a **private** Backblaze B2 bucket
and is reachable only through nginx on VPS-1, which validates a signed URL
before proxying. B2 credentials never leave the box.

```
App ──► cdn.teezer.live (Cloudflare: proxied, edge-caches public paths - see below)
     ──► nginx on VPS-1  (validate signature, local disk cache)
     ──► Backblaze B2    (private bucket, download-authorization header)
```

## The three things that make it correct

**Cloudflare IS allowed to cache most of these paths, on purpose.** This changed
2026-08-11: nginx now sends `Cache-Control: public, ...` for everything except the
prefixes `teezer-media.conf`'s `map $uri $media_cache_control` block forces to
`private, no-store`. (This file used to say the opposite here — "must not cache" /
"cache: false" — which was correct for the original design but went stale against
what actually ships.) What still makes this safe: nginx's `secure_link_md5` check
still runs and still must pass before nginx will ever *populate* a cache entry —
Cloudflare cannot manufacture a valid token, it can only replay bytes already
served once to someone who had one. Every URL is a time-limited CAPABILITY (an
expiring token), not a viewer-bound secret, so a shared edge cache holding it for
its own TTL doesn't grant access to anyone who couldn't already reach it with the
URL they were given. The genuinely private prefixes (identity documents, DM
attachments) are matched first in the map and forced `private, no-store` so
nothing else can accidentally make one shared-cacheable. Confirmed live
(2026-08-23): the identical signed URL returns `cf-cache-status: MISS` then `HIT`
on a second request — see "Verify Cloudflare caching" below for the commands.

**Signed URLs are minted on a fixed time window, not `now() + ttl`.** Until
2026-08-23, `MediaPresignService::signedMediaUrl()` computed a fresh `expires`
(and therefore a fresh token) on every call, even for the same object a second
apart — invisible to nginx's own local cache (keyed on path only, see below) but
not to Cloudflare's, whose cache key is the full URL *including the query
string*. A re-signed URL for an object Cloudflare already had cached was a
guaranteed edge MISS, forcing a round trip to this one VPS on nearly every feed
load, HLS playlist refresh, or profile revisit instead of being served from the
nearest edge PoP — confirmed live as the actual cause behind "video streaming is
slow" reports. Fixed by rounding `expires` up to the next 15-minute grid boundary
(anchored to the Unix epoch, not to the request time) instead of an exact
`now()+ttl` — see `MediaPresignService::windowedExpiry()`'s docblock for the full
reasoning. Two calls for the same key landing in the same 15-minute window now
produce an identical token, so a re-signed URL is a cache hit again instead of a
new object; crossing into the next window still mints a fresh one, same as
always. This needed **no nginx-side change**: `secure_link_md5` only recomputes
the hash from whatever `expires` value it's handed — it has no opinion on how PHP
derived that value.

**Segments are signed individually.** An HLS playlist references its segments by
relative path and players do not carry the parent's query string down to them. A
token on `master.m3u8` alone would leave every `.ts` open. So playlists are no
longer served as static objects: `GET /api/v1/videos/{id}/hls/master.m3u8`
generates them per request with a signed absolute URL on every line. Playlists
are a few hundred bytes; the segments never touch the API.

## The tokenless public mirror (2026-08-23)

A currently public+published video's `video_url`/`hls_url`/`thumbnail_url`/
`quality_urls` are **not signed at all** — they point at
`cdn.teezer.live/public/...` instead, no `?expires=&token=` anywhere. This is a
different, additional mechanism from the fixed-window signing above; protected
content (draft/private/unlisted/scheduled/removed/rejected/soft-deleted, and the
owner-preview case) still gets the full signed-URL flow, completely unchanged.

The problem a no-token URL creates: nothing stops it from working forever, even
after the video goes private, unless something actually revokes it. Purging
Cloudflare's edge cache alone doesn't - nginx would just re-serve the still-
existing object on the next cache miss. So this needed a real access-control
mechanism, not just cache tuning, and the two candidates were (a) a dynamic
per-request check at nginx (`auth_request` + a live DB/Redis lookup) or (b)
physical existence-based revocation. (a) needs an nginx module
(`ngx_http_auth_request_module`) that isn't confirmed available anywhere in this
deploy (only `ngx_http_secure_link_module`, via `nginx-extras`, is) - so this
uses (b) instead, needing no new nginx module at all:

- `PublicMediaMirrorService` (server-side) copies a video's public-facing B2
  objects - its whole `hls/{id}/` tree (verbatim; HLS references segments by
  relative path, so a straight copy is a fully self-consistent, unsigned-
  servable bundle with zero rewriting), the mp4 original, thumbnail, and quality
  renditions - to a parallel `public/` prefix, the moment it becomes public.
- The `location ^~ /public/` block in `teezer-media.conf` serves that prefix
  with **no `secure_link` check at all** - access control is "does the object
  exist," nothing else.
- The moment a video stops qualifying as public, `PublicMediaMirrorService`
  deletes the mirror. Its unsigned URL genuinely 404s at origin on the very next
  request - no per-request database check needed.
- `CloudflarePurgeService` additionally purges the edge copy of the affected
  playlist URLs on that same transition, so it stops resolving at the edge
  immediately too, rather than waiting out the Cache-Control TTL. This is a
  latency optimisation on top of the B2 delete, not the safety mechanism - the
  delete alone is what actually revokes access, and works with or without a
  Cloudflare token configured.
- Driven entirely by `App\Observers\VideoObserver`, which already reacted to
  every status/moderation/soft-delete change in this codebase before this
  feature existed - no new hook point, no changes to any of the many places a
  video's status can change.

`PublicMediaMirrorService::isPublic()` is the single definition of "public" -
`status === 'published' && moderation_status !== 'rejected' && deleted_at ===
null` - the exact boolean `HlsPlaylistController` already used for its own
visibility gate.

## Trade-off you accepted

VPS-1 (which already runs php-fpm, both Next apps and Postgres, and is a single
point of failure for the API) is still the only thing with B2 credentials, so
every cache-miss — first hit on an object, anything past its Cache-Control TTL,
and every genuinely-private path — still round-trips this box. Since 2026-08-11,
though, most public media paths are edge-cacheable (see above), so warm traffic
is served straight from Cloudflare and never reaches VPS-1 at all; the local
`proxy_cache` handles the rest by keeping repeat B2 fetches down. Watch
`media-access.log` volume; if it's still saturating, the options are a second
origin behind a load balancer, or moving to a CDN with native token auth.

## Install (VPS-1)

```bash
cd /var/www/teezer
# preferred: B2_DOWNLOAD_HOST=f00X.backblazeb2.com sudo -E bash deploy/nginx/install.sh
cp deploy/nginx/teezer-media.conf /etc/nginx/sites-available/
sed -i 's/__B2_DOWNLOAD_HOST__/f00X.backblazeb2.com/g' /etc/nginx/sites-available/teezer-media.conf
ln -s /etc/nginx/sites-available/teezer-media.conf /etc/nginx/sites-enabled/
mkdir -p /var/cache/nginx/media && chown -R www-data: /var/cache/nginx/media

# writes /etc/nginx/conf.d/b2_token.conf (0600) with the B2 download token,
# bucket name and signing secret as nginx map variables
cd server && php artisan media:refresh-b2-token

nginx -t && systemctl reload nginx
curl -s https://cdn.teezer.live/_health   # -> ok
```

TLS: point `ssl_certificate` at a Cloudflare Origin Certificate (Cloudflare is
in front, so an origin cert is enough and never expires against the public CAs).
A Let's Encrypt wildcard works equally well if the zone is on Full **(strict)** -
that is what the 2026-07-30 rebuild used, issued with `--dns-cloudflare`
(DNS-01), because `always_use_https` on the zone breaks the HTTP-01 challenge and
DNS-01 is the only way to get a wildcard anyway.

## Rebuild gotchas — each of these cost real downtime on 2026-07-30

**`secure_link` is NOT in Ubuntu's default nginx.** The stock `nginx` /
`nginx-core` package is built without `ngx_http_secure_link_module`, so this
config fails `nginx -t` with `unknown directive "secure_link"` and the media
origin cannot start at all. Install `nginx-extras` **first**:

```bash
apt-get install -y nginx-extras && nginx -V 2>&1 | tr ' ' '\n' | grep secure_link
```

Install it BEFORE writing this vhost. Installing it afterwards restarts nginx
while the config is still invalid, and nginx then stays **down** - taking every
other site on the box with it. `systemctl reload` also cannot recover a stopped
unit ("not active, cannot reload"), so it needs an explicit `start`.

**`cdn.teezer.live` must appear in exactly one vhost.** It is listed here, so
remove it from the API vhost's `server_name`; nginx otherwise warns about the
duplicate and silently gives it to whichever file loads first, which is the API.

**The cache directory must exist before reload** or nginx refuses to start:

```bash
mkdir -p /var/cache/nginx/media && chown -R www-data:www-data /var/cache/nginx/media
```

**Verify Cloudflare caching is behaving as intended** after any zone or map
change. For a public path, the *first* request for a given signed URL must still
pass through nginx's `secure_link_md5` check before anything can be cached:

```
curl -sI "<signed public media URL>"   # 1st request
cf-cache-status: MISS                  # nginx validated the signature, origin served it, edge stored it
curl -sI "<same signed public media URL>"   # 2nd request, same URL
cf-cache-status: HIT                   # served straight from the edge, nginx never saw this one
```

For a private/no-store path (`documents/`, `country-residency/`, `chat/`) it must
never read `HIT`, no matter how many times it's requested:

```
cf-cache-status: DYNAMIC   # or MISS/EXPIRED - anything but HIT is correct here
```

And two signed URLs for the *same* object, re-signed a few minutes apart but
within the same 15-minute window (see `MediaPresignService::windowedExpiry()`
above), must be byte-for-byte identical — that's the whole point of the
fixed-window fix:

```
# call whatever mints the URL (e.g. GET /videos/{id} twice, a few minutes apart)
# the returned video_url / hls segment URLs should be IDENTICAL within one window
```

If a private/no-store path ever reads `cf-cache-status: HIT`, the edge is serving
media without the signature being checked for that request, and the token
protected nothing for it.

## Keep the token fresh

The B2 download authorization lasts 7 days. Refresh daily so a few failed runs
are survivable rather than an outage:

```cron
17 4 * * * cd /var/www/teezer/server && php artisan media:refresh-b2-token >/dev/null 2>&1 && nginx -t -q && systemctl reload nginx
```

## Required env

```ini
FILESYSTEM_DISK=b2
MEDIA_URL=https://cdn.teezer.live
MEDIA_SIGNED_URLS=true
MEDIA_SIGNING_SECRET=<must match what the refresh command writes into nginx>

B2_APPLICATION_KEY_ID=<teezer-b2-key-id>
B2_APPLICATION_KEY=...
B2_BUCKET=<teezer-media-bucket>
B2_ENDPOINT=https://s3.<teezer-bucket-region>.backblazeb2.com
B2_REGION=<teezer-bucket-region>

# identity documents + private DM media, permanently private
B2_PRIVATE_APPLICATION_KEY_ID=<teezer-b2-private-key-id>
B2_PRIVATE_APPLICATION_KEY=...
B2_PRIVATE_BUCKET=<teezer-private-bucket>

# Cloudflare edge purge for the tokenless public mirror (CloudflarePurgeService)
# - optional. PublicMediaMirrorService's B2 delete is what actually revokes
# access; this only shortens how long a stale edge copy can keep answering in
# the meantime. Needs a real token with Zone -> Cache Purge permission on the
# teezer.live zone - inert (logs and skips) until both are set.
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=
```

Note `MEDIA_URL` has **no** `/file/<bucket>` suffix here — nginx adds that when
it proxies. The suffix is only needed in the interim DNS-direct-to-B2 setup.

## Turn the bucket private again

The bucket was made public for the Worker-free direct-to-B2 experiment. Signed
delivery only means anything once it is private again:

```bash
php artisan tinker --execute="
\$k=config('filesystems.disks.b2.key'); \$s=config('filesystems.disks.b2.secret');
\$a=json_decode(file_get_contents('https://api.backblazeb2.com/b2api/v3/b2_authorize_account',false,
  stream_context_create(['http'=>['header'=>'Authorization: Basic '.base64_encode(\$k.':'.\$s)]])),true);
echo \$a['apiInfo']['storageApi']['apiUrl'].PHP_EOL;"
```

Or simply flip it to **Private** in the Backblaze console — one click, and the
step that actually makes any of this protection real. Verify afterwards:

```bash
curl -sI https://<f00X>.backblazeb2.com/file/<teezer-media-bucket>/hls/98/master.m3u8   # want 401
curl -sI "https://cdn.teezer.live/hls/98/master.m3u8"                      # want 403 (no token)
```

## Verify end to end

```bash
# playlist: signed lines, one per segment (protected/preview video)
curl -s https://api.teezer.live/api/v1/videos/98/hls/master.m3u8 | head

# an unsigned segment on the SIGNED prefix must be refused
curl -sI https://cdn.teezer.live/hls/98/360p/seg_00000.ts          # 403

# range request on a signed segment
curl -sI -H 'Range: bytes=0-1023' "<signed segment url>"           # 206
```

**The tokenless public mirror**, for a video that is genuinely public+published:

```bash
# GET /api/v1/videos/{id} for a public video - video_url/hls_url should already
# be a plain https://cdn.teezer.live/public/... URL, no ?expires=&token=

curl -sI "https://cdn.teezer.live/public/hls/98/master.m3u8"        # 200, no token needed
curl -sI "https://cdn.teezer.live/public/hls/98/master.m3u8"        # 2nd request -> cf-cache-status: HIT

# a video that is NOT public must have no mirror to find at all
curl -sI "https://cdn.teezer.live/public/hls/<a-draft-or-private-video-id>/master.m3u8"   # 404

# flip a test video public -> private, then immediately:
curl -sI "https://cdn.teezer.live/public/hls/<that-id>/master.m3u8"  # 404 at origin
# (once CLOUDFLARE_API_TOKEN/ZONE_ID are set: the edge copy is purged too, so this
# is a fast 404 rather than serving stale content until the Cache-Control TTL passes)
```
