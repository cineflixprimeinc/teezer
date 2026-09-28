<?php

namespace App\Observers;

use App\Models\User;

class FollowerObserver
{
    // Observers on pivot tables require listening to created/deleted events
    // on the Follower model (if extracted) or handling via FollowController directly.
    // Phase 4: move follow/unfollow counter updates here from controller.
}
