<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class StorageService
{
    /**
     * Key prefixes that must never live in the public bucket.
     *
     * The public bucket is public so Cloudflare can cache it directly from B2
     * with no Worker in front - which also means anything in it is readable by
     * anyone who ever sees a URL, forever. These prefixes hold identity
     * documents, residency proofs and private DM media, so they go to the
     * private bucket and are only ever handed out as short-lived presigned
     * links.
     *
     * `videos/documents/` rather than `documents/` is not a mistake: identity
     * documents were historically written under the videos/ prefix because that
     * was the only prefix the old CDN Worker signature-gated. Both spellings
     * are matched so nothing written under either is ever treated as public.
     */
    private const PRIVATE_PREFIXES = [
        'videos/documents/',
        'documents/',
        'country-residency/',
        'chat/',
        'reports/evidence/',
    ];

    /**
     * The active storage disk, driven by FILESYSTEM_DISK env var.
     * 'public' for local development, 'b2' (Backblaze B2) in production.
     */
    private function disk(): string
    {
        return config('filesystems.default', 'local');
    }

    /** True when this key holds something that must not be publicly readable. */
    public static function isPrivateKey(string $key): bool
    {
        $key = ltrim($key, '/');

        foreach (self::PRIVATE_PREFIXES as $prefix) {
            if (str_starts_with($key, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The one default profile picture shown for a user who hasn't uploaded
     * their own, on both the website and the app - same asset either way
     * since both read it through this one place. Points at the SVG already
     * shipped in frontend/public/default-avatar.svg (served at the site
     * root, so any client - web or mobile - can fetch it with no auth).
     */
    public static function defaultAvatarUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/') . '/default-avatar.svg';
    }

    /**
     * Which disk holds (or should hold) a given key.
     *
     * Deciding this from the key alone, at one choke point, is what keeps the
     * rule honest: every writer, reader and delete path lands on the same
     * answer without each call site having to remember which bucket it wanted.
     * A new sensitive prefix is one line in PRIVATE_PREFIXES, not an audit of
     * every controller.
     *
     * Falls back to the active disk when the private bucket has no credentials,
     * so local dev and any half-configured box keep working exactly as before.
     */
    private function diskFor(string $key): string
    {
        if (self::isPrivateKey($key) && $this->privateDiskConfigured()) {
            return 'b2_private';
        }

        return $this->disk();
    }

    private function privateDiskConfigured(): bool
    {
        return (bool) config('filesystems.disks.b2_private.key')
            && (bool) config('filesystems.disks.b2_private.bucket');
    }

    /**
     * Disks a stored key may live on: the active one, plus the object bucket
     * whenever it has credentials.
     *
     * The object bucket is included even when FILESYSTEM_DISK points somewhere
     * else entirely - say a box accidentally left on 'local'. Cleanup code used
     * to hardcode the bucket name for exactly that reason: a permanent delete
     * that silently skipped the bucket would leave a moderated video still
     * being served from the CDN. Listing it unconditionally keeps that
     * guarantee without hardcoding a provider.
     *
     * @return list<string>
     */
    private function disks(): array
    {
        $disks = [$this->disk()];

        if (config('filesystems.disks.b2.key') && config('filesystems.disks.b2.bucket')) {
            $disks[] = 'b2';
        }

        if ($this->privateDiskConfigured()) {
            $disks[] = 'b2_private';
        }

        return array_values(array_unique($disks));
    }

    /**
     * Store a video file. Returns the storage key (object path).
     * Key format: videos/YYYY/MM/uuid.ext
     */
    public function storeVideo(UploadedFile $file, string $directory = 'videos'): string
    {
        return $this->put($file, $directory);
    }

    /**
     * Store an image (avatar, thumbnail, cover). Returns the storage key.
     * Key format: {directory}/YYYY/MM/uuid.ext
     */
    public function storeImage(UploadedFile $file, string $directory = 'images'): string
    {
        return $this->put($file, $directory);
    }

    /**
     * Store an audio file (MP3, WAV, AAC, etc.). Returns the storage key.
     * Key format: music/audio/YYYY/MM/uuid.ext
     */
    public function storeAudio(UploadedFile $file, string $directory = 'music/audio'): string
    {
        return $this->put($file, $directory);
    }

    /**
     * Store a document (verification ID, contract). Returns the storage key.
     *
     * Destination is `videos/documents/` and NOT `documents/`, which looks wrong and is
     * deliberate: the media worker enforces signed URLs by PREFIX, and `/videos/` is the
     * only prefix it currently protects. Anything written to `documents/` was served
     * publicly, unsigned, forever - that is how passports ended up downloadable by anyone
     * with the URL.
     *
     * Writing under the protected prefix means an identity document is signature-gated the
     * moment it lands, with no worker deploy required. The worker change that protects
     * `/documents/` properly is committed but needs a Cloudflare token with
     * Workers Scripts:Edit; when that ships, this can move back and the ugly prefix goes
     * away. The security property is the same either way.
     *
     * Key format: videos/documents/YYYY/MM/uuid.ext
     */
    public function storeDocument(UploadedFile $file, string $directory = 'videos/documents'): string
    {
        return $this->put($file, $directory);
    }

    /**
     * Store one piece of report evidence (a screenshot/photo a reporter
     * attaches to back up a video/comment/story/user/conversation/live-
     * stream/Space report). Private by construction - `reports/evidence/`
     * is in PRIVATE_PREFIXES, so this always lands in the private bucket
     * and is only ever handed out as a short-lived signed link to an
     * admin reviewing the report, never a public URL.
     *
     * Key format: reports/evidence/YYYY/MM/uuid.ext
     */
    public function storeReportEvidence(UploadedFile $file): string
    {
        return $this->put($file, 'reports/evidence');
    }

    /**
     * Return the full public URL for a stored key.
     * On B2: https://media.teezer.live/videos/2025/05/uuid.mp4 - the CDN host,
     * never the bucket's own endpoint, which is private and unreachable.
     * On local/public: http://localhost/storage/videos/2025/05/uuid.mp4
     */
    public function url(string $key): string
    {
        // A private key has no public URL by definition - the bucket refuses
        // anonymous reads - so return an expiring presigned link instead of a
        // CDN URL that would only ever 401. Callers that just want "the URL for
        // this thing" then keep working for both kinds of media.
        if (self::isPrivateKey($key) && $this->privateDiskConfigured()) {
            return $this->temporaryUrl($key);
        }

        // Signing happens in the disk itself (see SignedFilesystemAdapter), not
        // here. This method briefly had its own copy, which is exactly the
        // duplication that let VideoResource drift onto a retired algorithm -
        // one signer, at the lowest layer everything already goes through.
        return Storage::disk($this->disk())->url($key);
    }

    /**
     * Return a time-limited signed URL for private/sensitive files.
     * Useful for verification documents that should not be permanently public.
     * Falls back to regular URL on disks that don't support temporary URLs.
     */
    public function temporaryUrl(string $key, int $minutes = 30): string
    {
        $disk = $this->diskFor($key);
        try {
            return Storage::disk($disk)->temporaryUrl($key, now()->addMinutes($minutes));
        } catch (\RuntimeException) {
            // Local/public disks don't support temporary URLs - return regular URL
            return Storage::disk($disk)->url($key);
        }
    }

    /**
     * Delete a file by its storage key. Silently ignores missing files.
     *
     * Deletes from every disk in disks(), not just the active one, so a
     * moderation takedown or an account erasure cannot be quietly skipped by a
     * misconfigured FILESYSTEM_DISK and leave the object still reachable
     * through the CDN.
     */
    public function delete(?string $key): void
    {
        if (!$key) {
            return;
        }

        foreach ($this->disks() as $name) {
            try {
                if (Storage::disk($name)->exists($key)) {
                    Storage::disk($name)->delete($key);
                }
            } catch (\Throwable) {
                // Never let an unreachable secondary bucket abort the delete on
                // the primary - a partial delete beats no delete at all.
            }
        }
    }

    public function exists(string $key): bool
    {
        foreach ($this->disks() as $name) {
            try {
                if (Storage::disk($name)->exists($key)) {
                    return true;
                }
            } catch (\Throwable) {
                // Ignore an unreachable secondary and trust the active disk.
            }
        }

        return false;
    }

    /**
     * Size in bytes of a stored object, or null if it is in neither bucket.
     * Used by upload-completion checks that need to confirm the client's PUT
     * actually landed before a DB row is written.
     */
    public function size(string $key): ?int
    {
        foreach ($this->disks() as $name) {
            try {
                if (Storage::disk($name)->exists($key)) {
                    return Storage::disk($name)->size($key);
                }
            } catch (\Throwable) {
                // Try the next disk.
            }
        }

        return null;
    }

    /**
     * Internal helper: upload a file and return its storage key.
     */
    private function put(UploadedFile $file, string $directory): string
    {
        $year = now()->format('Y');
        $mon  = now()->format('m');
        // Content-sniffed extension first, not the client-supplied filename's -
        // a filename can claim any extension it wants regardless of what the
        // upload validation rule actually checked (file content). Then the same
        // guard as MediaPresignService::generateObjectKey(): a malformed or
        // hostile extension can't turn into a path segment or an unexpected
        // served content type.
        $ext = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension() ?: 'bin');
        if (!preg_match('/^[a-z0-9]{1,5}$/', $ext)) {
            $ext = 'bin';
        }
        $name = Str::uuid() . '.' . $ext;
        $path = "{$directory}/{$year}/{$mon}";
        $key  = "{$path}/{$name}";

        // Routed on the finished key, so a document lands in the private bucket
        // by virtue of its prefix - no caller has to know which bucket exists.
        Storage::disk($this->diskFor($key))->putFileAs($path, $file, $name);

        return $key;
    }
}
