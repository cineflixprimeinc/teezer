<?php

namespace App\Observers;

use App\Models\User;
use App\Jobs\SyncSearchDocument;
use App\Services\SearchService;

class UserSearchObserver
{
    public function __construct(private readonly SearchService $search) {}

    public function saved(User $user): void
    {
        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_USER, $user->id);
    }

    public function deleted(User $user): void
    {
        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_USER, $user->id, 'remove');
    }
}
