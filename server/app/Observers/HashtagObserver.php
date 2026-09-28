<?php

namespace App\Observers;

use App\Models\Hashtag;
use App\Jobs\SyncSearchDocument;
use App\Services\SearchService;

class HashtagObserver
{
    public function __construct(private readonly SearchService $search) {}

    public function saved(Hashtag $hashtag): void
    {
        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_HASHTAG, $hashtag->id);
    }

    public function deleted(Hashtag $hashtag): void
    {
        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_HASHTAG, $hashtag->id, 'remove');
    }
}
