<?php

namespace App\Console\Commands;

use App\Services\SearchService;
use Illuminate\Console\Command;

class SearchSync extends Command
{
    protected $signature   = 'search:sync {--type=all : Which collection to sync - users|videos|hashtags|sounds|all}';
    protected $description = 'Sync existing database records into Typesense collections';

    public function handle(SearchService $search): int
    {
        $type = $this->option('type');
        $this->info("Syncing [{$type}] to Typesense...");

        try {
            if (in_array($type, ['all', 'users'])) {
                $n = $search->syncUsers();
                $this->line("  Users synced:    {$n}");
            }

            if (in_array($type, ['all', 'videos'])) {
                $n = $search->syncVideos();
                $this->line("  Videos synced:   {$n}");
            }

            if (in_array($type, ['all', 'hashtags'])) {
                $n = $search->syncHashtags();
                $this->line("  Hashtags synced: {$n}");
            }

            if (in_array($type, ['all', 'sounds'])) {
                $n = $search->syncSounds();
                $this->line("  Sounds synced:   {$n}");
            }

            $this->info('Sync complete.');
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Sync failed: ' . $e->getMessage());
            $this->line('Make sure Typesense is running and TYPESENSE_HOST / TYPESENSE_API_KEY are set in .env');
            return Command::FAILURE;
        }
    }
}
