<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Story extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'user_id', 'caption', 'visibility', 'allow_replies', 'allow_resharing',
        'save_to_archive', 'status', 'location', 'link', 'tagged_users',
        'stickers', 'music_id', 'expires_at',
        'settings',
        // AI-generated label and repost attribution - see the migration that
        // added these for why reposted_from_* are plain columns, not FKs.
        'is_ai_generated', 'reposted_from_story_id', 'reposted_from_user_id',
    ];

    protected function casts(): array
    {
        return [
            'allow_replies'    => 'boolean',
            'allow_resharing'  => 'boolean',
            'save_to_archive'  => 'boolean',
            'is_ai_generated'  => 'boolean',
            'tagged_users'     => 'array',
            'stickers'         => 'array',
            // The per-story settings document - see config/stories.php.
            'settings'         => 'array',
            'expires_at'       => 'datetime',
        ];
    }

    public function user()   { return $this->belongsTo(User::class); }
    public function media()  { return $this->hasMany(StoryMedia::class)->orderBy('order_index'); }
    public function layers() { return $this->hasMany(StoryLayer::class)->orderBy('z_index'); }

    public function scopeActive($query)
    {
        return $query->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }

    /**
     * Batch-resolve, for a list of user ids, whether each one currently has
     * an active viewer-visible story and whether the viewer has seen it -
     * same gradient/seen ring the profile screen, Inbox and feed already
     * draw, for list surfaces (Search, Suggested accounts) that render many
     * users at once and would otherwise need one query per row.
     *
     * Returns [$userId => ['has_story' => bool, 'has_unseen' => bool]] -
     * callers merge this into whatever array shape they already build.
     *
     * Same everyone/followers-if-accepted/own visibility rule
     * StoryController::activeUserIds() and Video::attachStoryFlags() use
     * (deliberately not close_friends - matching that same lightweight
     * existence-check precedent). Duplicated here rather than shared with
     * Video::attachStoryFlags() because that method attaches attributes
     * directly onto Video model instances - these callers only have plain
     * arrays to merge into, not models to attach to.
     */
    public static function batchRingFlags(iterable $userIds, ?User $viewer): array
    {
        $ids = collect($userIds)->filter()->unique()->values();
        if (!$viewer || $ids->isEmpty()) {
            return [];
        }

        $activeStories = static::query()
            ->whereIn('user_id', $ids)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn ($q) => $q
                ->where('visibility', 'everyone')
                ->orWhere(fn ($f) => $f->where('visibility', 'followers')
                    ->whereExists(fn ($ex) => $ex->selectRaw('1')
                        ->from('followers')
                        ->whereColumn('followers.following_id', 'stories.user_id')
                        ->where('followers.follower_id', $viewer->id)
                        ->where('followers.status', 'accepted')))
                ->orWhere('user_id', $viewer->id))
            ->get(['id', 'user_id']);

        $storyIdsByCreator = $activeStories->groupBy('user_id')->map(fn ($rows) => $rows->pluck('id'));
        $allActiveStoryIds = $activeStories->pluck('id');
        $viewedStoryIds    = $allActiveStoryIds->isEmpty()
            ? collect()
            : \Illuminate\Support\Facades\DB::table('story_views')
                ->where('viewer_id', $viewer->id)
                ->whereIn('story_id', $allActiveStoryIds)
                ->pluck('story_id')->flip();

        $flags = [];
        foreach ($ids as $userId) {
            $creatorStoryIds = $storyIdsByCreator->get($userId) ?? collect();
            $flags[$userId] = [
                'has_story'  => $creatorStoryIds->isNotEmpty(),
                'has_unseen' => $creatorStoryIds->contains(fn ($sid) => !$viewedStoryIds->has($sid)),
            ];
        }
        return $flags;
    }
}
