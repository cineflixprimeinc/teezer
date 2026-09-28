# Cloudflare R2 - Teezer video uploads

This walks you through wiring the existing Teezer backend to a real R2 bucket
so user-uploaded videos land in object storage and stream from a custom domain.

## 1. Create the R2 bucket

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name: `teezer-videos` (anything works - must match `CLOUDFLARE_R2_BUCKET`).
3. Default location: leave as `Automatic`.
4. After creation, the bucket page shows the **Account ID** in the URL. Copy it
   - it goes into `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_R2_ENDPOINT`.

Folder layout used by the code (auto-created on first upload):

```
videos/original/{user_id}/{YYYY}/{MM}/<uuid>.mp4   ← uploaded originals
videos/processed/                                  ← reserved for future encodes
thumbnails/{user_id}/{YYYY}/{MM}/<uuid>.jpg
profile/{user_id}/<uuid>.jpg
temp/{user_id}/<uuid>
```

## 2. Create an R2 API token

1. R2 → **Manage R2 API Tokens** → **Create API Token**.
2. Permissions: **Object Read & Write**.
3. Specify bucket: `teezer-videos` (scope down - don't grant account-wide).
4. TTL: leave default.
5. Click **Create**. Copy the **Access Key ID** and **Secret Access Key** -
   they're shown **once**.

These become:

```
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
```

## 3. Custom public domain (media.teezer.live)

R2 buckets aren't world-readable by default; we serve videos through a custom
hostname proxied by Cloudflare.

1. Bucket → **Settings** → **Custom Domains** → **Connect Domain**.
2. Hostname: `media.teezer.live`.
3. Cloudflare creates the DNS record automatically (since `teezer.live` is on
   the same account). Verify in **DNS** → it's a CNAME to the bucket, orange
   cloud ON.
4. Wait ~30 s. `curl -I https://media.teezer.live/<some-key>` should now return
   200 for objects that exist (or 404 - not 401).

Set:

```
CLOUDFLARE_R2_URL=https://media.teezer.live
```

## 4. CORS - required for direct browser uploads

The frontend PUTs the file straight to R2 with a presigned URL. R2 needs to
allow `PUT` from the Teezer origins.

Bucket → **Settings** → **CORS Policy** → **Add CORS policy** → paste:

```json
[
  {
    "AllowedOrigins": [
      "https://teezer.live",
      "https://www.teezer.live",
      "https://backend.teezer.live"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": [
      "Content-Type",
      "Authorization",
      "x-amz-content-sha256",
      "x-amz-date"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Add `http://localhost:3000` to `AllowedOrigins` during local development.

## 5. Backend `.env` on the VPS

SSH in, edit `/var/www/teezer/server/.env`, and set:

```
FILESYSTEM_DISK=r2

CLOUDFLARE_ACCOUNT_ID=<from-step-1>
CLOUDFLARE_R2_ACCESS_KEY_ID=<from-step-2>
CLOUDFLARE_R2_SECRET_ACCESS_KEY=<from-step-2>
CLOUDFLARE_R2_BUCKET=teezer-videos
CLOUDFLARE_R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
CLOUDFLARE_R2_URL=https://media.teezer.live
CLOUDFLARE_R2_REGION=auto

MAX_VIDEO_UPLOAD_SIZE_MB=500
```

Also confirm:

```
CORS_ORIGIN=https://teezer.live,https://www.teezer.live,https://backend.teezer.live
SANCTUM_STATEFUL_DOMAINS=teezer.live,www.teezer.live,backend.teezer.live
```

Then:

```sh
cd /var/www/teezer/server
php artisan config:clear
php artisan route:clear
php artisan cache:clear
```

No migration is needed - `videos.video_url` already stores the R2 object key
and `VideoResource` resolves it through `Storage::disk('r2')->url()`.

## 6. Test the upload flow

### Via the web

1. Open https://teezer.live/login and sign in.
2. Click **Create Now** → **Upload Video**.
3. Pick a < 500 MB MP4/WebM/MOV file.
4. You should see live progress %; on completion the toast says "Video
   published" and you land on your profile.
5. Refresh `/profile/<your-username>` - the new card appears in the grid.

### Via curl (smoke test)

```sh
# 1. Get token
TOKEN=$(curl -s -X POST https://api.teezer.live/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@teezer.live","password":"<pw>"}' | jq -r .data.token)

# 2. Request presigned URL
RESP=$(curl -s -X POST https://api.teezer.live/api/v1/videos/upload-url \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"file_name":"test.mp4","file_type":"video/mp4","file_size":1048576}')
echo "$RESP" | jq

UPLOAD_URL=$(echo "$RESP" | jq -r .data.upload_url)
OBJECT_KEY=$(echo "$RESP" | jq -r .data.object_key)

# 3. PUT the file to R2
curl -X PUT --upload-file ./sample.mp4 -H 'Content-Type: video/mp4' "$UPLOAD_URL"

# 4. Register the video record
curl -X POST https://api.teezer.live/api/v1/videos/complete-upload \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"object_key\":\"$OBJECT_KEY\",\"caption\":\"hello R2\",\"width\":1080,\"height\":1920,\"duration\":15}"
```

## 7. Endpoint reference

| Method | Path                                | Auth | Purpose |
|--------|-------------------------------------|------|---------|
| POST   | `/api/v1/videos/upload-url`         | yes  | Get a 10-min presigned PUT URL + R2 object key |
| POST   | `/api/v1/videos/complete-upload`    | yes  | Verify the object landed, save metadata |
| GET    | `/api/v1/videos/{id}`               | open | Single video (private/draft only owner+admin) |
| GET    | `/api/v1/users/{username}/videos`   | open | Profile videos grid |
| GET    | `/api/v1/studio/content`            | yes  | Creator's own video list |
| GET    | `/api/v1/admin/videos`              | admin | Admin content management list |
| POST   | `/api/v1/videos`                    | yes  | Legacy multipart upload (kept for the Flutter app) |

## 8. Deploy + verify (after pulling these changes)

```sh
# SSH to VPS
cd /var/www/teezer
git pull --ff-only origin main

# Backend
cd server
composer install --no-dev --optimize-autoloader
php artisan config:clear && php artisan route:clear && php artisan cache:clear
php artisan migrate --force        # no-op for this PR but safe to run
pm2 restart teezer-queue          # picks up the new service binding

# Frontend
cd ../frontend
npm ci
npm run lint
npm run build
pm2 restart teezer-web

# Admin
cd ../admin
npm ci && npm run build
pm2 restart teezer-admin

pm2 status
```

Smoke checks:

```sh
curl -fsSL https://api.teezer.live/api/v1/health
curl -s -o /dev/null -w "%{http_code}\n" https://teezer.live/upload
curl -s -o /dev/null -w "%{http_code}\n" https://backend.teezer.live/content
```

## 9. Security checklist

- R2 access key / secret live **only** in `/var/www/teezer/server/.env`. They
  must **never** appear in `frontend/` or `admin/` code, Flutter, or commits.
- Upload endpoints require Sanctum auth + per-route throttle (20/min).
- Allowed MIME types are pinned server-side: `video/mp4`, `video/webm`,
  `video/quicktime`.
- Presigned URLs expire in 10 minutes.
- Object keys embed the uploader's user id; `completeUpload()` rejects keys
  that don't match the caller.
- `MAX_VIDEO_UPLOAD_SIZE_MB` is enforced on both `upload-url` and the legacy
  multipart endpoint.

## 10. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `503 Direct R2 uploads are not enabled` from `/upload-url` | `FILESYSTEM_DISK` is still `public`. |
| Browser `CORS` error during PUT | CORS policy on the R2 bucket missing or mismatched origin. |
| `422 Uploaded file not found in storage` | Browser PUT failed silently (often CORS) or the presigned URL expired. |
| `403 Forbidden` from R2 | Access key lacks **Object Read & Write** scoped to the bucket. |
| Videos play in `<video>` tag but admin panel shows 404 | `CLOUDFLARE_R2_URL` not set or DNS not propagated for `media.teezer.live`. |
| Empty profile grid after upload | Open browser devtools → check `GET /users/<username>/videos` response. Inspect the row's `status` - drafts/privates are filtered for non-owners. |
