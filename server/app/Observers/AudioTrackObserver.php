<?php

namespace App\Observers;

use App\Models\AudioTrack;
use App\Jobs\SyncSearchDocument;
use App\Services\SearchService;

class AudioTrackObserver
{
    public function __construct(private readonly SearchService $search) {}

    public function saved(AudioTrack $track): void
    {
        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_SOUND, $track->id);
    }

    public function deleted(AudioTrack $track): void
    {
        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_SOUND, $track->id, 'remove');
    }
}
