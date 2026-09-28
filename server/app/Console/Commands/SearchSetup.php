<?php

namespace App\Console\Commands;

use App\Services\SearchService;
use Illuminate\Console\Command;

class SearchSetup extends Command
{
    protected $signature   = 'search:setup';
    protected $description = 'Create and configure Typesense collections (users, videos, hashtags, sounds)';

    public function handle(SearchService $search): int
    {
        $this->info('Setting up Typesense collections...');

        try {
            $search->setupIndexes();
            $this->info('All collections created and configured successfully.');
            $this->line('  Collections: users, videos, hashtags, sounds');
            $this->warn('  Collections were recreated empty - run `php artisan search:sync` to populate them.');
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Setup failed: ' . $e->getMessage());
            $this->line('Make sure Typesense is running and TYPESENSE_HOST / TYPESENSE_API_KEY are set in .env');
            return Command::FAILURE;
        }
    }
}
