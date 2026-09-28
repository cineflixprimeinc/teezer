<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Fetches the open-source word/domain lists used by TextModerationService:
 *   • LDNOOBW bad-words list  → storage profanity file
 *   • disposable-email-domains blocklist → storage disposable file
 *
 * Run on deploy and/or weekly. Falls back silently to the config seeds if a
 * download fails, so a network hiccup never empties the filters.
 */
class UpdateModerationLists extends Command
{
    protected $signature = 'moderation:update-lists';
    protected $description = 'Download the latest profanity + disposable-email lists for text moderation';

    public function handle(): int
    {
        $this->fetch('profanity', (string) config('text_moderation.sources.profanity'), (string) config('text_moderation.profanity_file'));
        $this->fetch('disposable', (string) config('text_moderation.sources.disposable'), (string) config('text_moderation.disposable_file'));

        // Drop cached lists so the next request reloads from the fresh files.
        foreach (['textmod:severe', 'textmod:profanity', 'textmod:disposable'] as $key) {
            \Illuminate\Support\Facades\Cache::forget($key);
        }

        return self::SUCCESS;
    }

    private function fetch(string $label, string $url, string $path): void
    {
        if ($url === '' || $path === '') {
            return;
        }
        try {
            $res = Http::timeout(30)->retry(2, 500)->get($url);
            if (!$res->successful() || trim($res->body()) === '') {
                $this->warn("[$label] download failed (HTTP {$res->status()}) - keeping existing list.");
                return;
            }
            Storage::disk('local')->put($path, $res->body());
            $lines = substr_count($res->body(), "\n") + 1;
            $this->info("[$label] updated → {$path} (~{$lines} entries).");
        } catch (\Throwable $e) {
            $this->warn("[$label] error: {$e->getMessage()} - keeping existing list.");
        }
    }
}
