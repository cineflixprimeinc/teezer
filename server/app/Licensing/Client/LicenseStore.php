<?php

namespace App\Licensing\Client;

use Illuminate\Support\Str;

/**
 * Reads and writes the licence file on the customer's own VPS.
 *
 * The file holds the signed token plus purely local bookkeeping. It lives
 * outside the web root (storage/app/license/license.json by default), is
 * written 0600, and is never served, rendered, logged or returned by any
 * endpoint - see the "never exposed" list in the spec.
 *
 * There is no fallback to an environment variable or a database row on
 * purpose: one location for the licence means one place to secure, one place
 * to back up, and no ambiguity about which copy is authoritative.
 *
 * CLIENT-SIDE - ships in the marketplace package.
 */
class LicenseStore
{
    public function __construct(private readonly string $path) {}

    public function path(): string
    {
        return $this->path;
    }

    public function exists(): bool
    {
        return is_file($this->path);
    }

    /**
     * @return array<string,mixed>|null null when absent or unreadable. A
     *         corrupt file is treated exactly like a missing one; it must not
     *         throw on a request path.
     */
    public function read(): ?array
    {
        if (! is_file($this->path) || ! is_readable($this->path)) {
            return null;
        }

        $raw = @file_get_contents($this->path);
        if ($raw === false || $raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * Atomic write: a temp file in the same directory, then rename. A crash
     * mid-write must never leave a half-written licence that the next request
     * reads as invalid and blocks the whole site on.
     */
    public function write(array $data): bool
    {
        $directory = dirname($this->path);

        if (! is_dir($directory) && ! @mkdir($directory, 0700, true) && ! is_dir($directory)) {
            return false;
        }

        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return false;
        }

        $temp = $directory . '/.license.' . bin2hex(random_bytes(6)) . '.tmp';

        if (@file_put_contents($temp, $json, LOCK_EX) === false) {
            @unlink($temp);
            return false;
        }

        // chmod BEFORE the rename so the file is never briefly world-readable
        // at its final, predictable path.
        @chmod($temp, 0600);

        if (! @rename($temp, $this->path)) {
            @unlink($temp);
            return false;
        }

        @chmod($this->path, 0600);

        return true;
    }

    public function token(): ?string
    {
        $data = $this->read();
        $token = $data['token'] ?? null;

        return is_string($token) && $token !== '' ? $token : null;
    }

    /**
     * This installation's identity, generated ONCE at install time and stable
     * for the life of the installation.
     *
     * It is what stops one purchased licence being copied onto unlimited
     * VPSes: the signed token names an installation_id, and a clone carries
     * the same id, so the licence server sees the same installation reporting
     * from two places rather than two independent installs. Regenerating it
     * locally does not help an attacker - the token still names the original.
     */
    public function installationId(): ?string
    {
        $data = $this->read();
        $id = $data['installation_id'] ?? null;

        return is_string($id) && $id !== '' ? $id : null;
    }

    /** inst_ + 26 lowercase base32 chars, ULID-shaped so it sorts by time. */
    public static function generateInstallationId(): string
    {
        return 'inst_' . strtolower((string) Str::ulid());
    }

    /**
     * Record the outcome of a heartbeat WITHOUT disturbing the token.
     *
     * Separate from write() because a heartbeat that returns a fresh token and
     * one that merely confirms the existing one are different operations, and
     * conflating them is how a working licence gets clobbered by a partial
     * response.
     */
    public function touchVerification(string $status, ?string $message = null): bool
    {
        $data = $this->read();
        if ($data === null) {
            return false;
        }

        $data['last_verified_at']     = now()->toIso8601String();
        $data['last_verify_status']   = $status;
        $data['last_verify_message']  = $message;

        return $this->write($data);
    }
}
