# R2 → Backblaze B2 cutover

> **Teezer note - historical reference only.** This page and `migrate.sh`
> document the original platform's one-time R2 → B2 move. They are kept for
> reference; Teezer does not run them. Bucket names, bucket ids and key ids have
> been replaced by placeholders. Hostnames below are the original platform's.
>
> To seed Teezer's own B2 bucket from the source platform's bucket, use
> **`copy-reelsoo-to-teezer.sh`** in this directory (read-only source,
> `rclone copy` only, dry-run by default). See DEPLOYMENT.md at the repo root.

All media moves from Cloudflare R2 to Backblaze B2. Cloudflare stays as the CDN:
`media.reelsoo.com` still points at the `reelsoo-media` Worker, which now fetches
from B2 over HTTPS with a SigV4 signature instead of through an R2 binding.

## The one thing that will break the site

**The code in this branch has no R2 fallback.** The moment it is deployed, any
object that has not been copied to B2 returns 404 — every video, thumbnail,
avatar and verification document uploaded before the cutover.

So the order is not negotiable:

```
1. copy data      (site still live on R2, nothing user-visible changes)
2. verify copy    (rclone check must pass clean)
3. deploy code    (Worker + API together)
```

Do step 3 before steps 1–2 complete and the platform serves 404s for its entire
back catalogue.

## Facts for this account

| | |
|---|---|
| B2 bucket | `<BUCKET>` (id `<REELSOO_BUCKET_ID>`) |
| B2 endpoint | `https://s3.us-east-005.backblazeb2.com` |
| B2 region | `us-east-005` |
| Bucket type | `allPrivate` — keep it that way |
| Worker | `reelsoo-media`, route `media.reelsoo.com/*` |

Two things about the credentials, both of which cost an hour if you meet them
the hard way:

- **The master application key does not work.** Backblaze rejects it on the
  S3-compatible API with `InvalidAccessKeyId: Malformed Access Key Id`, while
  the *native* API accepts it happily — so `b2_authorize_account` succeeds and
  every S3 call still 403s. Use a normal application key. `<bucket-scoped-key>`
  (id `<B2_KEY_ID>`) is scoped to this bucket and is the one to use.
- **Addressing is path-style, not virtual-hosted.** `<BUCKET>` contains an
  uppercase letter. Virtual-hosted style would put that in the hostname, DNS
  lowercases it in transit, and the SigV4 signature — computed over the original
  casing — stops matching. B2 answers 403 and says nothing about capitalisation.
  Path-style is set in the Worker, `config/filesystems.php`, and the Go client;
  leave it alone unless the bucket is ever recreated with a lowercase name.

## 1. Copy the data

On VPS-1, in tmux (this runs for hours on a large library):

```bash
cd /var/www/reelsoo/deploy/b2-migration

# R2 side - read these out of the CURRENT production server/.env
export R2_ACCESS_KEY_ID=...          # CLOUDFLARE_R2_ACCESS_KEY_ID
export R2_SECRET_ACCESS_KEY=...      # CLOUDFLARE_R2_SECRET_ACCESS_KEY
export R2_ENDPOINT=...               # CLOUDFLARE_R2_ENDPOINT
export R2_BUCKET=<R2_BUCKET>

# B2 side
export B2_APPLICATION_KEY_ID=<B2_KEY_ID>
export B2_APPLICATION_KEY=...
export B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
export B2_BUCKET=<BUCKET>

./migrate.sh sizes     # how much is there
./migrate.sh copy      # the bulk copy; safe to interrupt and re-run
./migrate.sh check     # must pass clean before you deploy
```

`migrate.sh` uses `rclone copy`, never `sync`. Sync deletes anything in the
destination that is absent from the source — run after the cutover, that is
exactly the set of newly uploaded files.

`check` compares with `--size-only`. R2 and B2 compute multipart ETags
differently, so a checksum comparison reports thousands of false mismatches on
precisely the large video files you most want to trust.

## 2. Deploy

Worker secrets first — the Worker is useless without them:

```bash
cd cloudflare-worker
npx wrangler secret put B2_APPLICATION_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
npx wrangler secret put B2_BUCKET            # <BUCKET>
npx wrangler secret put B2_ENDPOINT          # https://s3.us-east-005.backblazeb2.com
npx wrangler secret put SIGNING_SECRET       # unchanged - same value as before
npx wrangler deploy
```

`SIGNING_SECRET` must stay byte-identical to the API's `MEDIA_SIGNING_SECRET`.
It is the CDN signature and has nothing to do with the bucket; changing it
invalidates every signed URL already in flight.

Then the API `.env` on both VPS boxes:

```ini
FILESYSTEM_DISK=b2
B2_APPLICATION_KEY_ID=<B2_KEY_ID>
B2_APPLICATION_KEY=...
B2_BUCKET=<BUCKET>
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
MEDIA_URL=https://media.reelsoo.com
MEDIA_SIGNING_SECRET=...                     # unchanged

# delete these - they are dead config now
# CLOUDFLARE_R2_ACCESS_KEY_ID / _SECRET_ACCESS_KEY / _BUCKET / _ENDPOINT / _URL / _REGION
```

```bash
php artisan config:cache
php artisan media:cors      # bucket CORS for browser direct uploads
sudo systemctl restart php8.3-fpm reelsoo-queue
```

`media:cors` is required and easy to forget. Downloads go through
`media.reelsoo.com`, where the Worker sets its own CORS headers — so a missing
bucket CORS rule breaks *uploads only*, while playback keeps working. It looks
like an upload bug, not a config one. Run `php artisan media:cors --dry-run`
first to see the rules.

## 3. Verify

```bash
# unsigned public asset - expect 200
curl -sI https://media.reelsoo.com/<some-avatar-key> | head -3

# protected prefix without a token - expect 401
curl -sI https://media.reelsoo.com/videos/original/<key> | head -1

# range request - expect 206 + Content-Range
curl -sI -H 'Range: bytes=0-1023' 'https://media.reelsoo.com/videos/...?expires=..&token=..' | head -5
```

Then in the app: upload a video, confirm it plays, scrub it (range requests),
and check the transcoded qualities appear a minute later.

## Rollback

Before you delete anything from R2, rollback is: set `FILESYSTEM_DISK=r2` and
the `CLOUDFLARE_R2_*` keys back in `.env`, redeploy the previous Worker, done —
R2 still holds every pre-cutover object. Anything uploaded *during* the B2
window lives only in B2, so copy it back first:

```bash
# reverse direction, same script semantics
R2_BUCKET=... B2_BUCKET=... rclone copy DST:<BUCKET> SRC:<R2_BUCKET> --fast-list
```

**Do not delete the R2 bucket until you have run a full week on B2.** It is the
only copy of the back catalogue that is not on a provider you just started
using, and deleting it converts a five-minute rollback into a data-loss event.

## What went away with R2

- `[[r2_buckets]]` binding in `wrangler.toml`
- The `reelsoo-transcoding` Cloudflare Queue and the Worker's `queue()` consumer.
  R2 published an upload event that triggered transcoding; B2 cannot publish to
  a Cloudflare Queue. Nothing broke, because it was never the primary trigger:
  `completeUpload` → `VideoService::createFromUpload` → `ProcessAudioMix` →
  `ProcessVideoQualities` already ran on every upload. The queue was a redundant
  second path. `POST /api/v1/internal/transcode` still exists for manual
  re-triggers.
- `R2PresignService` → `MediaPresignService`, `R2SetCors` → `MediaSetCors`
  (`php artisan r2:cors` is now `php artisan media:cors`), and
  `config('services.r2.signing_secret')` → `config('services.media.signing_secret')`.
