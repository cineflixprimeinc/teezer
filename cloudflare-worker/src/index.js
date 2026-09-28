/**
 * LEGACY / UNUSED FOR TEEZER. Teezer runs on the Cloudflare free plan and its
 * media is served by the nginx signed-URL media origin on cdn.teezer.live
 * (see deploy/). This Worker is kept only for reference; do not deploy it
 * unless that architecture changes.
 *
 * Teezer Media Worker (legacy)
 *
 * Responsibilities:
 *  1. Serve media objects at media.teezer.live with signed-URL enforcement on
 *     every protected prefix
 *  2. Edge-cache responses via the Cloudflare Cache API (token-less cache key)
 *
 * Signing protocol (matches Laravel MediaPresignService::signedCdnUrl):
 *   message = `${url.pathname}|${expires}`
 *   token   = HMAC-SHA256(message, SIGNING_SECRET) → lowercase hex
 *
 * ── Storage backend ─────────────────────────────────────────────────────────
 * All objects live in Backblaze B2. B2 has no Workers binding (that was an R2
 * feature), so every object is fetched over HTTPS with an AWS SigV4 signature
 * computed here per request; see signV4 below.
 *
 * The bucket is PRIVATE and only this Worker holds credentials for it. That is
 * deliberate and load-bearing: it is what stops someone from taking a key out
 * of a signed URL and pulling the object - a passport scan, a private DM video -
 * straight from B2 with the CDN's signature check bypassed entirely. Making the
 * bucket public would let us drop all the signing code below, and would also
 * make every PROTECTED_PREFIXES check above it decorative.
 *
 * Required secrets (npx wrangler secret put <NAME>):
 *   B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT
 */

const PROTECTED_PREFIXES   = ['/videos/', '/documents/', '/country-residency/', '/chat/'];
const EXPIRY_GRACE_SECONDS = 30;

const ALLOWED_ORIGINS = [
  'https://teezer.live',
  'https://www.teezer.live',
  'https://backend.teezer.live',
];

// ── HTTP fetch handler ────────────────────────────────────────────────────────

export default {

  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return handlePreflight(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    const requiresSig = PROTECTED_PREFIXES.some(p => path.startsWith(p));

    if (requiresSig) {
      const expires = url.searchParams.get('expires');
      const token   = url.searchParams.get('token');
      const secret  = (env.SIGNING_SECRET || '').trim();

      if (!expires || !token || !secret) {
        return new Response('Missing token.', { status: 401 });
      }

      const now = Math.floor(Date.now() / 1000);
      if (now > parseInt(expires, 10) + EXPIRY_GRACE_SECONDS) {
        return new Response('Link expired.', { status: 410 });
      }

      const valid = await verifyHmac(`${path}|${expires}`, token, secret);
      if (!valid) return new Response('Invalid token.', { status: 403 });
    }

    const key         = path.replace(/^\//, '');
    const rangeHeader = request.headers.get('Range');

    // ── Edge cache (token-stripped key) ──────────────────────────────────────
    // After signature validation we can safely cache using the path alone.
    // Different byte-range requests get separate cache entries.
    const cache    = caches.default;
    const cacheKey = buildCacheKey(url, rangeHeader);
    const cached   = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(request.method === 'HEAD' ? null : cached.body, {
        status:  cached.status,
        headers: cached.headers,
      });
      applyCors(request, resp.headers);
      return resp;
    }

    // ── Fetch from B2 ────────────────────────────────────────────────────────
    const cfg = b2Config(env);
    if (!cfg) {
      // Missing secrets is a deploy fault, not a client error. 503 (and a log)
      // rather than 404, so this never gets mistaken for "the video was
      // deleted" by anyone reading dashboards.
      console.error('B2 is not configured - check the Worker secrets.');
      return new Response('Storage unavailable.', { status: 503 });
    }

    let object;
    try {
      object = await loadFromB2(cfg, key, rangeHeader);
    } catch (err) {
      console.error(`B2 fetch failed: ${err.message} key=${key}`);
      return new Response('Upstream storage error.', { status: 502 });
    }
    if (!object) return new Response('Not Found.', { status: 404 });

    const headers = new Headers(object.headers);
    headers.set('accept-ranges', 'bytes');
    // Cache policy (public so the Cloudflare edge can cache; private content is
    // gated by the signed-URL check BEFORE we reach here):
    //   • HLS playlists (.m3u8) - SHORT ttl. The playlist is the kill switch: a
    //     takedown deletes the objects, and playback only actually stops once
    //     the playlist stops resolving. Cache it for a year and a removed video
    //     keeps streaming from the edge for a year.
    //   • HLS segments (.ts) - immutable. The path carries the video id and the
    //     segment index, and a re-transcode replaces the whole directory, so a
    //     given segment URL never changes meaning.
    //   • images / thumbnails / avatars / audio - UUID object keys are immutable
    //     and served from stable (unsigned) URLs, so cache them hard for a year.
    //     This is the big repeat-visit win PageSpeed flagged ("efficient cache
    //     lifetimes"); a replaced asset just gets a brand-new key/URL.
    //   • signed originals - short-ish ttl so a moderation removal propagates
    //     out of the edge + browser quickly (UGC safety beats cache hit-rate).
    const isPlaylist = path.endsWith('.m3u8');
    headers.set(
      'cache-control',
      isPlaylist
        ? 'public, max-age=300, s-maxage=300'
        : requiresSig
          ? 'public, max-age=86400, s-maxage=86400'
          : 'public, max-age=31536000, s-maxage=31536000, immutable',
    );
    // Players are strict about these: a playlist served as octet-stream is one
    // iOS silently refuses to play, and B2 stores whatever content-type it was
    // given at upload - so assert them here rather than trusting the bucket.
    if (isPlaylist) {
      headers.set('content-type', 'application/vnd.apple.mpegurl');
    } else if (path.endsWith('.ts')) {
      headers.set('content-type', 'video/mp2t');
    }

    applyCors(request, headers);

    const response = new Response(
      request.method === 'HEAD' ? null : object.body,
      { status: object.status, headers }
    );

    // Store in edge cache without blocking the response.
    //
    // 206 is skipped because the Cache API refuses partial responses outright -
    // the old code queued those puts anyway and every one of them rejected
    // inside waitUntil, unnoticed. Skipping them changes no behaviour except
    // that the errors stop.
    //
    // Worth knowing for the bill: a seek within a video is a range request, so
    // it always reaches B2. That was free over R2's binding and is a charged
    // class-B transaction here. If seek traffic turns out to dominate, the fix
    // is to cache the full object and slice it at the edge - not to start
    // caching 206s, which the platform will not do.
    if (object.status !== 206) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },

  // ── Transcoding ───────────────────────────────────────────────────────────
  // There used to be a `queue()` consumer here, bound to the reelsoo-transcoding
  // Cloudflare Queue. R2 published an event on every upload; the Worker turned
  // that event into a POST to the VPS, which kicked off ProcessVideoQualities.
  //
  // Backblaze cannot publish to a Cloudflare Queue, so that trigger has no B2
  // equivalent. Removing it costs nothing, because it was never the primary
  // path: completeUpload already runs VideoService::createFromUpload, which
  // dispatches ProcessAudioMix, which chains into ProcessVideoQualities (and
  // RemuxVideoFaststart when the mix is skipped). The queue was a redundant
  // second trigger for a job Laravel was queueing anyway.
  //
  // POST /api/v1/internal/transcode still exists, secret-authenticated, as the
  // manual re-trigger path.
};

// ── Object loading ───────────────────────────────────────────────────────────

/** Read the B2 config from secrets. Returns null if B2 is not configured. */
function b2Config(env) {
  const keyId    = (env.B2_APPLICATION_KEY_ID || '').trim();
  const appKey   = (env.B2_APPLICATION_KEY    || '').trim();
  const bucket   = (env.B2_BUCKET             || '').trim();
  const endpoint = (env.B2_ENDPOINT           || '').trim();

  if (!keyId || !appKey || !bucket || !endpoint) return null;

  // endpoint is https://s3.<region>.backblazeb2.com
  const host   = endpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const region = (env.B2_REGION || '').trim() || host.split('.')[1] || '';
  if (!region) return null;

  return { keyId, appKey, bucket, host, region };
}

/**
 * GET an object from B2 over HTTPS with a SigV4 signature.
 *
 * Returns null only for a genuine 404 and throws on everything else. The
 * distinction matters: a 403 means the application key is wrong or expired, and
 * collapsing that into "not found" would show users an empty feed while the
 * logs stayed clean and the real fault went unnoticed for hours.
 */
async function loadFromB2(cfg, key, rangeHeader) {
  // Path-style: the bucket goes in the PATH, not the host.
  //
  // Virtual-hosted style would put the bucket name in the hostname, and our
  // bucket name contains uppercase letters. DNS is case-insensitive so fetch()
  // lowercases the host before sending it, while SigV4 signs the exact string
  // we put in the canonical request - the two disagree and B2 rejects every
  // request with a 403 that says nothing about capitalisation. Path-style
  // sidesteps it entirely and works for any bucket name.
  const host = cfg.host;
  const path = `/${encodeKey(cfg.bucket)}/${encodeKey(key)}`;
  const url  = `https://${host}${path}`;

  // Only `host` is signed. Range is deliberately NOT part of the signature.
  //
  // SigV4 covers exactly the headers named in SignedHeaders, and B2 rejects the
  // request with a 400 if one of them is absent on arrival. The Workers runtime
  // manages byte ranges itself and does not guarantee that a Range header set
  // here reaches the origin verbatim - so signing it makes the signature depend
  // on something outside our control, and every seek in a video 400s. Leaving
  // it unsigned is valid SigV4 and works whichever way the runtime behaves: the
  // header is honoured when forwarded, and the worst case is a 200 full object
  // instead of a 206, which the caller handles.
  const signed = await signV4({
    method:    'GET',
    host,
    path,
    headers:   { host },
    region:    cfg.region,
    service:   's3',
    accessKey: cfg.keyId,
    secretKey: cfg.appKey,
  });

  if (rangeHeader) signed.range = rangeHeader;

  // cacheEverything:false because this Worker does its own caching on a
  // token-stripped key. Letting the edge also cache the signed subrequest would
  // key on the Authorization header's date and miss on every single request.
  const res = await fetch(url, { method: 'GET', headers: signed, cf: { cacheEverything: false } });

  if (res.status === 404) return null;
  if (res.status !== 200 && res.status !== 206) {
    // B2 puts the actual cause in an XML body (SignatureDoesNotMatch,
    // InvalidAccessKeyId, a missing signed header...). Without it the status
    // code alone sends you guessing, so carry a slice of it into the log.
    const detail = await res.text().catch(() => '');
    throw new Error(`B2 responded ${res.status} ${detail.replace(/\s+/g, ' ').slice(0, 200)}`);
  }

  // B2 already sets content-type, content-length, content-range and etag
  // correctly, so its headers are carried through rather than rebuilt.
  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'etag', 'last-modified']) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }

  return { body: res.body, status: res.status, headers: out };
}

// ── AWS SigV4 ────────────────────────────────────────────────────────────────

/**
 * Sign a request for the S3 REST API and return the headers to send.
 *
 * Only what B2 needs is implemented: GET, no query string, empty body. The
 * payload hash is therefore the constant SHA-256 of the empty string rather
 * than something computed per request.
 */
export async function signV4({ method, host, path, headers, region, service, accessKey, secretKey }) {
  const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);                            // YYYYMMDD

  const all = { ...headers, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': amzDate };

  // Canonical headers must be lowercase, trimmed, and sorted by name.
  const names = Object.keys(all).map(n => n.toLowerCase()).sort();
  const canonicalHeaders = names
    .map(n => `${n}:${String(all[n] ?? all[Object.keys(all).find(k => k.toLowerCase() === n)]).trim()}\n`)
    .join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    method,
    path,
    '',                 // canonical query string - always empty here
    canonicalHeaders,
    signedHeaders,
    EMPTY_SHA256,
  ].join('\n');

  const scope       = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const enc      = new TextEncoder();
  const kDate    = await hmacRaw(enc.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion  = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  const kSigning = await hmacRaw(kService, 'aws4_request');
  const signature = bytesToHex(await hmacRaw(kSigning, stringToSign));

  return {
    ...all,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * Percent-encode an object key for the canonical URI, segment by segment so
 * the slashes stay as slashes. encodeURIComponent leaves !'()* alone but AWS
 * expects them encoded, hence the second pass - a key containing any of them
 * would otherwise sign correctly and then 403, which is a miserable bug to
 * track down.
 */
export function encodeKey(key) {
  return key
    .split('/')
    .map(seg => encodeURIComponent(seg).replace(/[!'()*]/g, c =>
      '%' + c.charCodeAt(0).toString(16).toUpperCase()))
    .join('/');
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return bytesToHex(new Uint8Array(buf));
}

async function hmacRaw(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Cache key builder ────────────────────────────────────────────────────────

/**
 * Build a cache key using only the path (no token/expires) so re-generated
 * signed URLs with different tokens still hit the same cache entry.
 * Range requests get their own entry so partial chunks are cached correctly.
 * Increment CACHE_VER whenever Worker response headers change to bust stale entries.
 */
const CACHE_VER = '5';
function buildCacheKey(url, rangeHeader) {
  const clean = new URL(url.origin + url.pathname);
  clean.searchParams.set('v', CACHE_VER);
  if (rangeHeader) clean.searchParams.set('_range', rangeHeader);
  return new Request(clean.toString());
}

// ── HMAC-SHA-256 (signed-URL verification) ───────────────────────────────────

async function verifyHmac(message, tokenHex, secret) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );
    const sig = hexToBytes(tokenHex);
    if (!sig) return false;
    return await crypto.subtle.verify('HMAC', key, sig, enc.encode(message));
  } catch { return false; }
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ── CORS ─────────────────────────────────────────────────────────────────────

function applyCors(request, headers) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  if (ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost')) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, HEAD');
    headers.set('access-control-expose-headers', 'Content-Range, Content-Length, Accept-Ranges, ETag');
    headers.set('vary', 'Origin');
  }
}

function handlePreflight(request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin':  ALLOWED_ORIGINS.includes(origin) ? origin : '',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range, Content-Type',
      'access-control-max-age':       '86400',
    },
  });
}
