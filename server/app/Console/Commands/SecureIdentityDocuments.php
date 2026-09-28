<?php

namespace App\Console\Commands;

use App\Models\VerificationRequest;
use App\Services\MediaPresignService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Move identity documents behind the CDN's signed-URL wall.
 *
 * WHY THIS EXISTS, and why the destination prefix looks odd:
 *
 * The media worker enforces signed URLs by PREFIX, and today the only protected prefix is
 * `/videos/`. Everything else on the bucket - including `/documents/`, which holds
 * passports, national IDs and verification selfies - was served publicly, unsigned, with
 * no expiry. I downloaded a real user's government ID from the open internet to confirm it.
 *
 * The clean fix is to add `/documents/` to the worker's PROTECTED_PREFIXES (that change is
 * committed). But deploying the worker needs a Cloudflare token with Workers Scripts:Edit,
 * and the tokens available are read-only. Waiting on a credential while passports sit
 *公开 on a CDN is not an option.
 *
 * So: move the objects UNDER the prefix that is already protected. `videos/documents/…`
 * is enforced by the live worker the moment the object lands there - no deploy required.
 *
 * Once the worker can be deployed with `/documents/` protected, this can be reversed and
 * the prefix renamed back. The security property is identical either way; only the name
 * is ugly.
 */
class SecureIdentityDocuments extends Command
{
    protected $signature   = 'security:secure-documents {--dry-run : Show what would move, change nothing}';
    protected $description = 'Move identity documents under the CDN-protected prefix and re-key them';

    /** Objects under this prefix are already signature-enforced by the live media worker. */
    private const SAFE_PREFIX = 'videos/documents/';
    private const OLD_PREFIX  = 'documents/';

    public function handle(MediaPresignService $presign): int
    {
        $dry  = (bool) $this->option('dry-run');
        $disk = Storage::disk(config('filesystems.default', 'b2'));

        $columns = [
            'document_key'       => 'document_url',
            'selfie_key'         => 'selfie_url',
            'supporting_doc_key' => 'supporting_doc_url',
        ];

        $requests = VerificationRequest::query()
            ->where(function ($q) {
                foreach (['document_key', 'selfie_key', 'supporting_doc_key'] as $c) {
                    $q->orWhere($c, 'like', self::OLD_PREFIX . '%');
                }
            })
            ->get();

        $this->info(($dry ? '[DRY RUN] ' : '') . "Requests with exposed documents: {$requests->count()}");

        $moved = 0;
        $failed = 0;

        foreach ($requests as $req) {
            $patch = [];
            // Capture the old keys BEFORE the save. getOriginal() re-syncs to the new values
            // the moment save() runs, so reading it afterwards returns the NEW key and the
            // delete silently no-ops - which is exactly what happened on the first run and
            // left every passport still sitting at its public URL.
            $oldKeys = [];

            foreach ($columns as $keyCol => $urlCol) {
                $oldKey = $req->getAttribute($keyCol);

                if (! $oldKey || ! str_starts_with($oldKey, self::OLD_PREFIX)) {
                    continue;
                }

                $newKey = self::SAFE_PREFIX . substr($oldKey, strlen(self::OLD_PREFIX));

                $this->line("  #{$req->id} {$keyCol}: {$oldKey} → {$newKey}");

                if ($dry) { $moved++; continue; }

                try {
                    if (! $disk->exists($oldKey)) {
                        // Already moved, or the object is gone. Re-key anyway so the row
                        // stops pointing at the public path.
                        $this->warn("      source missing - re-keying only");
                    } elseif (! $disk->exists($newKey)) {
                        $disk->copy($oldKey, $newKey);
                    }

                    $patch[$keyCol] = $newKey;
                    // Store the PUBLIC form of the new key. The model's accessor signs it
                    // at read time; this column is only a fallback.
                    $patch[$urlCol] = $presign->publicUrl($newKey);
                    $oldKeys[]      = $oldKey;

                    $moved++;
                } catch (\Throwable $e) {
                    $failed++;
                    $this->error("      FAILED: {$e->getMessage()}");
                }
            }

            if ($patch && ! $dry) {
                // Update the DB BEFORE deleting the old object. If the delete fails we have
                // a harmless orphan; if the DB update failed after a delete, the document
                // would be unreachable - losing a user's passport is worse than leaving a
                // copy behind for a minute.
                $req->forceFill($patch)->save();

                foreach ($oldKeys as $old) {
                    try {
                        $disk->delete($old);
                        $this->line("      deleted public original: {$old}");
                    } catch (\Throwable $e) {
                        $this->warn("      old object NOT deleted: {$e->getMessage()}");
                    }
                }
            }
        }

        /*
         * Sweep the public originals.
         *
         * This runs unconditionally, not just for rows migrated in THIS pass, because the
         * first run's delete silently no-oped (getOriginal() had already re-synced) and left
         * every passport still live at its public URL. A copy that is merely "no longer
         * referenced" is not deleted - and an undeleted passport on a public CDN is the
         * whole bug. Only ever deletes an object whose protected twin is confirmed present.
         */
        $orphans = 0;
        foreach ($disk->allFiles(rtrim(self::OLD_PREFIX, '/')) as $oldKey) {
            $twin = self::SAFE_PREFIX . substr($oldKey, strlen(self::OLD_PREFIX));

            if (! $disk->exists($twin)) {
                $this->warn("  orphan kept (no protected copy): {$oldKey}");
                continue;
            }

            $this->line(($dry ? '  [would delete] ' : '  deleting public original: ') . $oldKey);

            if (! $dry) {
                try {
                    $disk->delete($oldKey);
                    $orphans++;
                } catch (\Throwable $e) {
                    $failed++;
                    $this->error("      FAILED to delete: {$e->getMessage()}");
                }
            }
        }

        $this->newLine();
        $this->info(($dry ? '[DRY RUN] ' : '') . "Objects moved: {$moved}, public originals deleted: {$orphans}, failed: {$failed}");

        if (! $dry && $failed === 0 && $moved > 0) {
            $this->info('Identity documents are now behind the signed-URL wall.');
        }

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
