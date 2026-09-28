<?php

namespace App\Observers;

use App\Models\VideoLike;

class VideoLikeObserver
{
    public function created(VideoLike $like): void
    {
        $video = $like->video;
        if (!$video) {
            return;
        }

        $video->increment('likes_count');
        $video->user->profile?->increment('total_likes');
    }

    public function deleted(VideoLike $like): void
    {
        $video = $like->video;
        if (!$video) {
            return;
        }

        $video->newQuery()->whereKey($video->id)->where('likes_count', '>', 0)->decrement('likes_count');
        $video->user->profile()->where('total_likes', '>', 0)->decrement('total_likes');
    }
}
