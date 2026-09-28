<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Highlight;
use App\Models\Profile;
use App\Models\SocialLink;
use App\Rules\CleanUsername;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function __construct(private StorageService $storage) {}

    /**
     * Who viewed my profile - recent unique signed-in viewers (latest view per
     * viewer), newest first. Backs the eye icon's viewer preview + the list.
     */
    public function profileViews(Request $request): JsonResponse
    {
        $me = $request->user();

        // Private mode is reciprocal: you can't see who viewed you.
        if ($this->viewPrivacy($me) === 'private') {
            return response()->json(['success' => true, 'data' => ['enabled' => false, 'count' => 0, 'viewers' => [], 'next_cursor' => null]]);
        }
        if (!Schema::hasTable('profile_views') || !Schema::hasColumn('profile_views', 'last_viewed_at')) {
            return response()->json(['success' => true, 'data' => ['enabled' => true, 'count' => 0, 'viewers' => [], 'next_cursor' => null]]);
        }

        $limit  = min(30, max(5, (int) $request->query('limit', 20)));
        $cursor = $this->decodeCursor($request->query('cursor'));
        $since  = now()->subDays(7);

        // Short-lived cache of the FIRST page only (the hot request) keyed by a
        // per-owner generation token that a new view bumps - so a fresh view is
        // never masked by a stale cache, yet repeated opens hit Redis not PG.
        $cacheKey = null;
        if (!$cursor) {
            try {
                $ver = (int) (Redis::connection('default')->get('pv:ver:' . $me->id) ?? 0);
                $cacheKey = "pv:list:{$me->id}:v{$ver}:l{$limit}";
                $hit = Redis::connection('default')->get($cacheKey);
                if ($hit) {
                    return response()->json(['success' => true, 'data' => json_decode($hit, true)]);
                }
            } catch (\Throwable) { $cacheKey = null; }
        }

        // One indexed range scan over (profile_user_id, last_viewed_at) - no
        // GROUP BY (the table is already one row per viewer), no OFFSET.
        //   privacy filter (applied to the VIEWER's current setting):
        //     everyone  → always visible
        //     followers → visible only if the owner follows the viewer
        //     private   → hidden (defensive; such rows shouldn't exist)
        $rows = DB::table('profile_views as pv')
            ->join('users as u', 'u.id', '=', 'pv.viewer_id')
            ->where('pv.profile_user_id', $me->id)
            ->whereNotNull('pv.viewer_id')
            ->where('pv.viewer_id', '!=', $me->id)
            ->where('u.is_banned', false)
            ->where('pv.last_viewed_at', '>=', $since)
            ->where(function ($q) use ($me) {
                $q->whereRaw("COALESCE(u.profile_view_privacy, CASE WHEN u.profile_view_history THEN 'everyone' ELSE 'private' END) = 'everyone'")
                  ->orWhere(function ($q2) use ($me) {
                      $q2->whereRaw("COALESCE(u.profile_view_privacy, '') = 'followers'")
                         ->whereExists(function ($sub) use ($me) {
                             $sub->select(DB::raw(1))->from('followers as f')
                                 ->whereColumn('f.following_id', 'u.id')
                                 ->where('f.follower_id', $me->id)
                                 ->where('f.status', 'accepted');
                         });
                  });
            })
            ->when($cursor, function ($q) use ($cursor) {
                // Keyset pagination: strictly older than the cursor row.
                $q->where(function ($w) use ($cursor) {
                    $w->where('pv.last_viewed_at', '<', $cursor['ts'])
                      ->orWhere(fn ($x) => $x->where('pv.last_viewed_at', '=', $cursor['ts'])->where('pv.id', '<', $cursor['id']));
                });
            })
            ->orderByDesc('pv.last_viewed_at')
            ->orderByDesc('pv.id')
            ->limit($limit + 1)
            ->get([
                'pv.id as pv_id', 'pv.last_viewed_at', 'pv.view_count',
                'u.id', 'u.username', 'u.name', 'u.avatar', 'u.is_verified',
            ]);

        $hasMore = $rows->count() > $limit;
        $page = $rows->take($limit);

        // Follow/mutual status for the owner → each viewer (one query, no N+1).
        $viewerIds = $page->pluck('id')->all();
        $iFollow = $theyFollow = [];
        if ($viewerIds) {
            $iFollow = DB::table('followers')->where('follower_id', $me->id)->whereIn('following_id', $viewerIds)->where('status', 'accepted')->pluck('following_id')->flip()->all();
            $theyFollow = DB::table('followers')->where('following_id', $me->id)->whereIn('follower_id', $viewerIds)->where('status', 'accepted')->pluck('follower_id')->flip()->all();
        }

        $viewers = $page->map(fn ($r) => [
            'id'            => (int) $r->id,
            'username'      => $r->username,
            'name'          => $r->name,
            'avatar'        => $r->avatar ? Storage::url($r->avatar) : StorageService::defaultAvatarUrl(),
            'is_verified'   => (bool) $r->is_verified,
            'viewed_at'     => $r->last_viewed_at,
            'view_count'    => (int) $r->view_count,
            'is_following'  => isset($iFollow[$r->id]),
            'is_mutual'     => isset($iFollow[$r->id]) && isset($theyFollow[$r->id]),
        ])->values();

        $last = $page->last();
        $payload = [
            'enabled'     => true,
            'count'       => $viewers->count(),
            'viewers'     => $viewers,
            'next_cursor' => $hasMore && $last ? $this->encodeCursor($last->last_viewed_at, (int) $last->pv_id) : null,
        ];

        if ($cacheKey) {
            try { Redis::connection('default')->setex($cacheKey, 25, json_encode($payload)); } catch (\Throwable) {}
        }

        return response()->json(['success' => true, 'data' => $payload]);
    }

    /** Effective 3-way profile-view privacy, tolerant of the legacy boolean. */
    private function viewPrivacy($user): string
    {
        $p = $user->profile_view_privacy ?? null;
        if (in_array($p, ['everyone', 'followers', 'private'], true)) {
            return $p;
        }
        return ($user->profile_view_history ?? true) ? 'everyone' : 'private';
    }

    /** Opaque keyset cursor "{isoTs}|{id}" → base64. */
    private function encodeCursor($ts, int $id): string
    {
        return base64_encode((string) $ts . '|' . $id);
    }

    private function decodeCursor(?string $c): ?array
    {
        if (!$c) return null;
        $raw = base64_decode($c, true);
        if ($raw === false || !str_contains($raw, '|')) return null;
        [$ts, $id] = explode('|', $raw, 2);
        return ['ts' => $ts, 'id' => (int) $id];
    }

    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->load([
            'profile', 'socialLinks', 'highlights',
            'creatorProgress.level',
        ]);

        return response()->json([
            'success' => true,
            'data'    => $this->profileResource($user),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'name'          => ['sometimes', 'string', 'max:100'],
            'username'      => ['sometimes', 'string', 'max:50', 'unique:users,username,' . $request->user()->id, 'regex:/^[a-zA-Z0-9_\.]+$/', new CleanUsername],
            'bio'           => ['nullable', 'string', 'max:500'],
            'location'      => ['nullable', 'string', 'max:255'],
            'website'       => ['nullable', 'string', 'max:500'],
            'category'      => ['nullable', 'string', 'max:100'],
            'date_of_birth' => ['nullable', 'date', 'before:today', 'after:1900-01-01'],
            'country'       => ['nullable', 'string', 'max:100'],
            'is_private'        => ['nullable', 'boolean'],
            'message_privacy'   => ['nullable', 'in:everyone,friends,followers,no_one'],
            'gender'        => ['nullable', 'string', 'in:prefer_not_to_say,male,female,non_binary,other'],
            'language'      => ['nullable', 'string', 'max:8'],
            'interests'     => ['nullable', 'array', 'max:50'],
            'interests.*'   => ['string', 'max:60'],
            'categories'    => ['nullable', 'array', 'max:3'],
            'categories.*'  => ['string', 'max:60'],
        ]);

        $user = $request->user();

        // Normalize website (allow bare domain like "example.com")
        if ($request->filled('website')) {
            $website = trim($request->website);
            if ($website !== '' && !preg_match('#^https?://#i', $website)) {
                $website = 'https://' . ltrim($website, '/');
            }
            $request->merge(['website' => $website]);
        }

        // Update user fields (all account-level fields live on users for consistency)
        $user->update($request->only([
            'name', 'username', 'bio', 'country', 'date_of_birth', 'is_private',
            'gender', 'language', 'interests', 'categories', 'website', 'location',
            'message_privacy',
        ]));

        // Mirror profile-level fields too (some legacy code reads from profile)
        Profile::updateOrCreate(
            ['user_id' => $user->id],
            $request->only(['location', 'website', 'category'])
        );

        return response()->json([
            'success' => true,
            'message' => 'Profile updated.',
            'data'    => $this->profileResource($user->fresh(['profile', 'socialLinks', 'highlights', 'creatorProgress.level'])),
        ]);
    }

    /**
     * Live username availability check (used during typing in account settings).
     * Returns: { available: bool, reason?: string }
     */
    public function checkUsername(Request $request): JsonResponse
    {
        $request->validate([
            'username' => ['required', 'string', 'max:50'],
        ]);

        $username = trim((string) $request->input('username'));
        $userId   = $request->user()->id;

        if (!preg_match('/^[a-zA-Z0-9_\.]+$/', $username)) {
            return response()->json([
                'success'   => true,
                'available' => false,
                'reason'    => 'Username can only contain letters, numbers, underscore, and dot.',
            ]);
        }

        if (strlen($username) < 3) {
            return response()->json([
                'success'   => true,
                'available' => false,
                'reason'    => 'Username must be at least 3 characters.',
            ]);
        }

        $taken = \App\Models\User::where('username', $username)
            ->where('id', '!=', $userId)
            ->exists();

        return response()->json([
            'success'   => true,
            'available' => !$taken,
            'reason'    => $taken ? 'Username already taken.' : null,
        ]);
    }

    /**
     * Finish profile completion for an account social sign-in just created.
     *
     * One call for all three fields rather than three update() calls, because
     * they are only meaningful together: a half-applied onboarding leaves an
     * account with a real name and still no birthday, and nothing afterwards
     * knows it was interrupted mid-write.
     *
     * Validation mirrors update() exactly - same regex, same uniqueness, same
     * CleanUsername profanity rule - so the two paths cannot drift into
     * disagreeing about what a username is.
     */
    public function completeSocialOnboarding(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name'     => ['required', 'string', 'min:2', 'max:100'],
            'username' => [
                'required', 'string', 'min:3', 'max:50',
                'unique:users,username,' . $user->id,
                'regex:/^[a-zA-Z0-9_\.]+$/',
                new CleanUsername,
            ],
            // The minimum age the platform actually publishes
            // (/policies/age-suitability, /policies/minor-safety) - enforced
            // here because nothing on the server enforced it before: register()
            // takes date_of_birth as `nullable, date`, so any date, or none at
            // all, was accepted. A client-side check alone protects nobody, as
            // this endpoint is reachable without the app.
            'date_of_birth' => [
                'required', 'date', 'after:1900-01-01',
                'before_or_equal:' . now()->subYears(13)->toDateString(),
            ],
        ], [
            'date_of_birth.before_or_equal' => 'You need to be at least 13 to use Teezer.',
        ]);

        try {
            DB::transaction(function () use ($user, $data) {
                $user->forceFill([
                    'name'          => trim($data['name']),
                    'username'      => trim($data['username']),
                    'date_of_birth' => $data['date_of_birth'],
                ]);
                $user->markSocialOnboardingComplete();
                $user->save();
            });
        } catch (\Illuminate\Database\QueryException $e) {
            // The unique rule above checks and the insert enforces, and between
            // those two moments somebody else can take the name. Rare, but the
            // alternative is a 500 on a race the user can simply retry out of.
            if (str_contains(strtolower($e->getMessage()), 'unique') || $e->getCode() === '23505') {
                return response()->json([
                    'success' => false,
                    'message' => 'That username was just taken. Please choose another.',
                    'errors'  => ['username' => ['That username was just taken. Please choose another.']],
                ], 422);
            }
            throw $e;
        }

        return response()->json([
            'success' => true,
            'message' => 'Profile completed.',
            'data'    => \App\Support\AuthUserResource::make($user->fresh()),
        ]);
    }

    public function updateAvatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'max:5120', 'mimes:jpeg,png,webp'],
        ]);

        $user = $request->user();

        if ($user->avatar) {
            $this->storage->delete($user->avatar);
        }

        $key = $this->storage->storeImage($request->file('avatar'), 'avatars');
        $user->update(['avatar' => $key]);

        return response()->json([
            'success' => true,
            'message' => 'Avatar updated.',
            'data'    => ['avatar_url' => $this->storage->url($key)],
        ]);
    }

    public function removeAvatar(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->avatar) {
            $this->storage->delete($user->avatar);
            $user->update(['avatar' => null]);
        }

        return response()->json(['success' => true, 'message' => 'Avatar removed.']);
    }

    public function socialLinks(Request $request): JsonResponse
    {
        $links = $request->user()->socialLinks;
        return response()->json(['success' => true, 'data' => $links]);
    }

    public function updateSocialLinks(Request $request): JsonResponse
    {
        $request->validate([
            'links'            => ['present', 'array', 'max:20'],
            'links.*.platform' => ['required', 'string', 'in:instagram,twitter,youtube,tiktok,facebook,website,other'],
            // Permissive http(s) URL with domain + TLD; allows `@` in path (YouTube/TikTok handles).
            'links.*.url'      => ['required', 'string', 'max:500', 'regex:/^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i'],
        ], [
            'links.*.url.regex' => 'Each social link must be a valid URL (e.g. https://example.com/yourname).',
        ]);

        $user  = $request->user();
        $input = $request->input('links', []);

        // Sync: delete all then re-insert (empty array clears all)
        $user->socialLinks()->delete();

        if (!empty($input)) {
            $now   = now();
            $links = collect($input)->map(fn($l) => [
                'user_id'    => $user->id,
                'platform'   => $l['platform'],
                'url'        => $l['url'],
                'created_at' => $now,
                'updated_at' => $now,
            ])->all();
            SocialLink::insert($links);
        }

        return response()->json([
            'success' => true,
            'message' => 'Social links updated.',
            'data'    => $user->socialLinks()->get(),
        ]);
    }

    public function highlights(Request $request): JsonResponse
    {
        $highlights = $request->user()->highlights()->orderBy('sort_order')->get();
        return response()->json(['success' => true, 'data' => $highlights]);
    }

    public function storeHighlight(Request $request): JsonResponse
    {
        $request->validate([
            'title'     => ['required', 'string', 'max:50'],
            'cover_url' => ['nullable', 'url'],
        ]);

        $user = $request->user();
        $count = $user->highlights()->count();

        $highlight = $user->highlights()->create([
            'title'      => $request->title,
            'cover_url'  => $request->cover_url,
            'sort_order' => $count,
        ]);

        return response()->json(['success' => true, 'data' => $highlight], 201);
    }

    public function updateHighlight(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'title'     => ['sometimes', 'string', 'max:50'],
            'cover_url' => ['nullable', 'url'],
        ]);

        $highlight = Highlight::where('user_id', $request->user()->id)->findOrFail($id);
        $highlight->update($request->only(['title', 'cover_url']));

        return response()->json(['success' => true, 'data' => $highlight]);
    }

    public function destroyHighlight(Request $request, int $id): JsonResponse
    {
        Highlight::where('user_id', $request->user()->id)->findOrFail($id)->delete();
        return response()->json(['success' => true]);
    }

    private function profileResource($user): array
    {
        return [
            'id'                => $user->id,
            'name'              => $user->name,
            'username'          => $user->username,
            'email'             => $user->email,
            'phone'             => $user->phone,
            'role'              => $user->role,
            // Read-only demo admin. Sent so the panel can explain itself up
            // front - a banner and disabled controls - rather than letting an
            // evaluator discover it by clicking Save and getting a 403. It is
            // presentation only: BlockDemoWrites refuses the write server-side
            // whatever the client believes.
            'is_demo'           => (bool) $user->is_demo,
            'permissions'       => $user->getPermissions(),
            'avatar'            => $user->avatar ? $this->storage->url($user->avatar) : StorageService::defaultAvatarUrl(),
            // See AuthUserResource::make() - callers deciding whether to show a
            // "remove photo" affordance must check this, not `avatar` truthiness.
            'has_avatar'        => (bool) $user->avatar,
            'bio'               => $user->bio,
            'website'           => $user->website,
            'location'          => $user->location,
            'gender'            => $user->gender,
            'language'          => $user->language ?? 'en',
            'interests'         => $user->interests ?? [],
            'categories'        => $user->categories ?? [],
            'country'           => $user->country,
            'date_of_birth'     => $user->date_of_birth?->toDateString(),
            'is_verified'       => $user->is_verified,
            /**
             * Whether there is a live story to open - the gradient ring.
             *
             * The PUBLIC profile (UserController::show) has always returned this;
             * this endpoint never did. So your own profile could not draw a ring
             * however many stories you had posted - the client had nothing to
             * read. Same rule as the public one: published, and not expired.
             */
            'has_story'         => \App\Models\Story::where('user_id', $user->id)
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->exists(),
            // The Shop tab/button gate - see ShopController::approvedShop() for
            // the same "approved is the only real shop" rule. True here even on
            // your OWN profile only once actually approved; while onboarding is
            // in progress this stays false, same as everyone else sees.
            'has_approved_shop' => \App\Models\Shop::where('user_id', $user->id)
                ->where('status', \App\Models\Shop::STATUS_APPROVED)
                ->exists(),
            'is_private'             => $user->is_private,
            'message_privacy'        => $user->message_privacy ?? 'everyone',
            'active_status'          => (bool) ($user->active_status ?? true),
            'profile_discovery'      => (bool) ($user->profile_discovery ?? true),
            'show_to_search_engines' => (bool) ($user->show_to_search_engines ?? false),
            'comment_filter'         => (bool) ($user->comment_filter ?? true),
            'who_can_comment'        => $user->who_can_comment ?? 'everyone',
            'who_can_tag'            => $user->who_can_tag ?? 'friends',
            'who_can_duet'           => $user->who_can_duet ?? 'friends',
            'who_can_download'       => $user->who_can_download ?? 'everyone',
            'who_can_see_liked'      => $user->who_can_see_liked ?? 'only_me',
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'profile' => $user->profile ? [
                'location'        => $user->profile->location,
                'website'         => $user->profile->website,
                'category'        => $user->profile->category,
                'total_followers' => $user->profile->total_followers,
                'total_following' => $user->profile->total_following,
                'total_likes'     => $user->profile->total_likes,
                'total_videos'    => $user->profile->total_videos,
                'profile_views'   => $user->profile->profile_views,
                'creator_badge'   => $user->profile->creator_badge,
            ] : null,
            'social_links' => $user->socialLinks->map(fn($l) => [
                'platform' => $l->platform,
                'url'      => $l->url,
            ]),
            'highlights'       => $user->highlights,
            'creator_progress' => $user->creatorProgress ? [
                'xp'    => $user->creatorProgress->current_xp,
                'level' => $user->creatorProgress->level?->level_name,
            ] : null,
            'created_at' => $user->created_at->toIso8601String(),
        ];
    }

    /* ── GET /profile/accessibility ──────────────────────────────────────── */
    public function getAccessibility(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->accessibilityDefaults($request->user())]);
    }

    /* ── PATCH /profile/accessibility ────────────────────────────────────── */
    public function updateAccessibility(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $boolRule   = ['sometimes', 'boolean'];
        $stringRule = ['sometimes', 'string', 'max:30'];
        $request->validate([
            'larger_text'          => $boolRule,   'high_contrast'       => $boolRule,
            'reduce_transparency'  => $boolRule,   'reduce_motion'       => $boolRule,
            'autoplay_videos'      => $boolRule,   'captions_always_on'  => $boolRule,
            'audio_descriptions'   => $boolRule,   'keyboard_navigation' => $boolRule,
            'screen_reader'        => $boolRule,
            'text_size'            => $stringRule, 'pointer_size'        => $stringRule,
            'caption_style'        => $stringRule,
        ]);

        $user    = $request->user();
        $current = $this->accessibilityDefaults($user);
        $merged  = array_merge($current, array_filter(
            $request->only(array_keys($current)),
            fn($v) => !is_null($v)
        ));

        $user->update(['accessibility_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function accessibilityDefaults($user): array
    {
        $saved = $user->accessibility_preferences ?? [];
        $defaults = [
            'larger_text'         => false, 'text_size'            => 'small',
            'high_contrast'       => false, 'reduce_transparency'  => false,
            'reduce_motion'       => false, 'autoplay_videos'      => true,
            'pointer_size'        => 'default',
            'captions_always_on'  => false, 'caption_style'        => 'default',
            'audio_descriptions'  => false,
            // Opt-in: the prominent brand focus ring is a keyboard-nav aid. On by
            // default it drew a loud pink :focus-visible ring for everyone (incl.
            // mouse users clicking a comment box). Off unless the user enables it.
            'keyboard_navigation' => false, 'screen_reader'        => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) {
                $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
            }
        }
        return $defaults;
    }

    /* ── GET /profile/appearance ─────────────────────────────────────────── */
    public function getAppearance(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->appearanceDefaults($request->user())]);
    }

    /* ── PATCH /profile/appearance ───────────────────────────────────────── */
    public function updateAppearance(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'theme'          => ['sometimes', 'string', 'in:light,dark,system'],
            'app_icon'       => ['sometimes', 'string', 'in:default,midnight,retro'],
            'bold_text'      => ['sometimes', 'boolean'],
            'in_app_browser' => ['sometimes', 'boolean'],
        ]);

        $user    = $request->user();
        $current = $this->appearanceDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['appearance_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function appearanceDefaults($user): array
    {
        $saved = $user->appearance_preferences ?? [];
        $defaults = [
            'theme'          => 'system',
            'app_icon'       => 'default',
            'bold_text'      => false,
            'in_app_browser' => true,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/upload-preferences ─────────────────────────────────── */
    public function getUploadPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->uploadPreferencesDefaults($request->user())]);
    }

    /* ── PATCH /profile/upload-preferences ───────────────────────────────── */
    public function updateUploadPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'allow_comments'      => ['sometimes', 'boolean'],
            'allow_duet'          => ['sometimes', 'boolean'],
            'allow_stitch'        => ['sometimes', 'boolean'],
            'allow_download'      => ['sometimes', 'boolean'],
            'auto_caption'        => ['sometimes', 'boolean'],
            'high_quality_upload' => ['sometimes', 'boolean'],
            'is_ai_generated'     => ['sometimes', 'boolean'],
        ]);

        $user    = $request->user();
        $current = $this->uploadPreferencesDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['upload_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function uploadPreferencesDefaults($user): array
    {
        $saved = $user->upload_preferences ?? [];
        $defaults = [
            'allow_comments'      => true,
            'allow_duet'          => false,
            'allow_stitch'        => false,
            'allow_download'      => false,
            'auto_caption'        => false,
            'high_quality_upload' => false,
            'is_ai_generated'     => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/messages-preferences ───────────────────────────────── */
    public function getMessagesPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->messagesPrefDefaults($request->user())]);
    }

    /* ── PATCH /profile/messages-preferences ─────────────────────────────── */
    public function updateMessagesPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'who_can_message'    => ['sometimes', 'string', 'in:everyone,friends,followers,no_one'],
            'group_invites'      => ['sometimes', 'string', 'in:everyone,friends,no_one'],
            'message_requests'   => ['sometimes', 'boolean'],
            'read_receipts'      => ['sometimes', 'boolean'],
            'typing_indicators'  => ['sometimes', 'boolean'],
            'media_autodownload' => ['sometimes', 'boolean'],
        ]);

        $user    = $request->user();
        $current = $this->messagesPrefDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['messages_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function messagesPrefDefaults($user): array
    {
        $saved = $user->messages_preferences ?? [];
        $defaults = [
            'who_can_message'    => 'everyone',
            'group_invites'      => 'friends',
            'message_requests'   => true,
            'read_receipts'      => true,
            'typing_indicators'  => true,
            'media_autodownload' => true,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/wellbeing ──────────────────────────────────────────── */
    public function getWellbeing(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->wellbeingDefaults($request->user())]);
    }

    /* ── PATCH /profile/wellbeing ────────────────────────────────────────── */
    public function updateWellbeing(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'daily_limit_minutes'    => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'break_reminders'        => ['sometimes', 'boolean'],
            'break_interval_minutes' => ['sometimes', 'integer', 'min:5', 'max:240'],
            'bedtime_enabled'        => ['sometimes', 'boolean'],
            'bedtime_start'          => ['sometimes', 'string', 'max:5'],
            'bedtime_end'            => ['sometimes', 'string', 'max:5'],
            'restful_notifications'  => ['sometimes', 'boolean'],
        ]);

        $user    = $request->user();
        $current = $this->wellbeingDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['wellbeing_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function wellbeingDefaults($user): array
    {
        $saved = $user->wellbeing_preferences ?? [];
        $defaults = [
            'daily_limit_minutes'    => 0,       // 0 = no limit
            'break_reminders'        => false,
            'break_interval_minutes' => 30,
            'bedtime_enabled'        => false,
            'bedtime_start'          => '22:00',
            'bedtime_end'            => '07:00',
            'restful_notifications'  => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/ai-preferences ─────────────────────────────────────── */
    public function getAiPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->aiPrefDefaults($request->user())]);
    }

    /* ── PATCH /profile/ai-preferences ───────────────────────────────────── */
    public function updateAiPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $boolRule = ['sometimes', 'boolean'];
        $request->validate([
            'ai_recommendations'   => $boolRule,
            'ai_labels'            => $boolRule,
            'ai_captions'          => $boolRule,
            'ai_search'            => $boolRule,
            'ai_reply_suggestions' => $boolRule,
            'personalized_ads'     => $boolRule,
            'data_for_training'    => $boolRule,
        ]);

        $user    = $request->user();
        $current = $this->aiPrefDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['ai_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function aiPrefDefaults($user): array
    {
        $saved = $user->ai_preferences ?? [];
        $defaults = [
            'ai_recommendations'   => true,
            'ai_labels'            => true,
            'ai_captions'          => true,
            'ai_search'            => true,
            'ai_reply_suggestions' => true,
            'personalized_ads'     => false,
            'data_for_training'    => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = (bool) $v;
        }
        return $defaults;
    }

    /* ── GET /profile/spaces-preferences ─────────────────────────────────── */
    public function getSpacesPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->spacesPrefDefaults($request->user())]);
    }

    /* ── PATCH /profile/spaces-preferences ───────────────────────────────── */
    public function updateSpacesPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $boolRule = ['sometimes', 'boolean'];
        $request->validate([
            'notify_live_from_following' => $boolRule,
            'notify_scheduled_reminders' => $boolRule,
            'notify_speaker_invites'     => $boolRule,
            'join_muted'                 => $boolRule,
            'show_listening_activity'    => $boolRule,
            'allow_invites_from'         => ['sometimes', 'string', 'in:everyone,following,no_one'],
            'default_audio_quality'      => ['sometimes', 'string', 'in:standard,high,ultra'],
            'record_by_default'          => $boolRule,
        ]);

        $user    = $request->user();
        $current = $this->spacesPrefDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['spaces_preferences' => $merged]);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function spacesPrefDefaults($user): array
    {
        $saved = $user->spaces_preferences ?? [];
        $defaults = [
            // Notifications
            'notify_live_from_following' => true,
            'notify_scheduled_reminders' => true,
            'notify_speaker_invites'     => true,
            // In a room
            'join_muted'                 => true,
            'show_listening_activity'    => true,
            'allow_invites_from'         => 'everyone',
            // Defaults for rooms you host
            'default_audio_quality'      => 'standard',
            'record_by_default'          => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/family (Child Mode + Content Controls) ─────────────── */
    public function getFamily(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        $data = $this->familyDefaults($user);
        $data['pin_set'] = !empty($user->family_pin);
        return response()->json(['success' => true, 'data' => $data]);
    }

    /* ── PATCH /profile/family ───────────────────────────────────────────── */
    public function updateFamily(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $boolRule = ['sometimes', 'boolean'];
        $request->validate([
            'child_mode_enabled'        => $boolRule,
            'child_age_group'           => ['sometimes', 'string', 'in:under_7,8_12,13_15,16_17'],
            'daily_screen_time_minutes' => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'bedtime_enabled'           => $boolRule,
            'bedtime_start'             => ['sometimes', 'string', 'max:5'],
            'bedtime_end'               => ['sometimes', 'string', 'max:5'],
            'break_reminders'           => $boolRule,
            'safe_search'               => $boolRule,
            'sensitive_content_filter'  => $boolRule,
            'mature_content_filter'     => $boolRule,
            'hide_violence'             => $boolRule,
            'hide_adult_content'        => $boolRule,
            'educational_only'          => $boolRule,
        ]);

        $user    = $request->user();
        $current = $this->familyDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['family_preferences' => $merged]);

        $merged['pin_set'] = !empty($user->family_pin);
        return response()->json(['success' => true, 'data' => $merged]);
    }

    /* ── POST /profile/family/pin - set or change the parent PIN ──────────── */
    public function setFamilyPin(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'pin'         => ['required', 'string', 'regex:/^[0-9]{4,6}$/'],
            'current_pin' => ['nullable', 'string'],
        ]);

        $user = $request->user();

        // Changing an existing PIN requires the current one.
        if (!empty($user->family_pin)) {
            $current = (string) $request->input('current_pin');
            if ($current === '' || !\Illuminate\Support\Facades\Hash::check($current, $user->family_pin)) {
                return response()->json(['success' => false, 'message' => 'Current PIN is incorrect.'], 422);
            }
        }

        $user->forceFill(['family_pin' => \Illuminate\Support\Facades\Hash::make((string) $request->input('pin'))])->save();

        return response()->json(['success' => true, 'message' => 'Parent PIN saved.']);
    }

    /* ── POST /profile/family/pin/verify ─────────────────────────────────── */
    public function verifyFamilyPin(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate(['pin' => ['required', 'string']]);

        $user = $request->user();
        $ok   = !empty($user->family_pin)
            && \Illuminate\Support\Facades\Hash::check((string) $request->input('pin'), $user->family_pin);

        return response()->json(['success' => $ok, 'verified' => $ok], $ok ? 200 : 422);
    }

    private function familyDefaults($user): array
    {
        $saved = $user->family_preferences ?? [];
        $defaults = [
            'child_mode_enabled'        => false,
            'child_age_group'           => '13_15',
            'daily_screen_time_minutes' => 0,       // 0 = no limit
            'bedtime_enabled'           => false,
            'bedtime_start'             => '21:00',
            'bedtime_end'               => '07:00',
            'break_reminders'           => false,
            'safe_search'               => true,
            'sensitive_content_filter'  => true,
            'mature_content_filter'     => true,
            'hide_violence'             => false,
            'hide_adult_content'        => true,
            'educational_only'          => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/content-preferences ───────────────────────────────── */
    public function getContentPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->contentPrefDefaults($request->user()),
        ]);
    }

    /* ── PATCH /profile/content-preferences ──────────────────────────────── */
    public function updateContentPreferences(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'preferred_language'       => ['sometimes', 'string', 'max:10'],
            'preferred_country'        => ['sometimes', 'string', 'max:3'],
            'show_local_first'         => ['sometimes', 'boolean'],
            'show_trending'            => ['sometimes', 'boolean'],
            'sensitive_content_filter' => ['sometimes', 'boolean'],
            'autoplay_videos'          => ['sometimes', 'boolean'],
            'data_saver_mode'          => ['sometimes', 'boolean'],
            // One-shot UI flags (first-run Spaces welcome popup, etc.)
            'has_seen_spaces_onboarding' => ['sometimes', 'boolean'],
            // Player preferences (mobile "More options" sheet)
            'auto_scroll'              => ['sometimes', 'boolean'],
            'loop_video'               => ['sometimes', 'boolean'],
            'playback_speed'           => ['sometimes', 'numeric', 'in:0.5,0.75,1,1.25,1.5,2'],
            'default_quality'          => ['sometimes', 'string', 'in:auto,360,480,720,1080'],
            'theme'                    => ['sometimes', 'string', 'in:light,dark,system'],
        ]);

        $user    = $request->user();
        $current = $this->contentPrefDefaults($user);
        $merged  = array_merge($current, array_filter(
            $request->only(array_keys($current)),
            fn($v) => !is_null($v)
        ));

        $user->update(['content_preferences' => $merged]);

        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function contentPrefDefaults($user): array
    {
        $saved = $user->content_preferences ?? [];
        $defaults = [
            'preferred_language'       => $user->language ?? 'en',
            'preferred_country'        => $user->selected_country_code ?? $user->detected_country_code ?? 'US',
            'show_local_first'         => true,
            'show_trending'            => true,
            'sensitive_content_filter' => true,
            'autoplay_videos'          => true,
            'data_saver_mode'          => false,
            // One-shot UI flags (first-run Spaces welcome popup, etc.)
            'has_seen_spaces_onboarding' => false,
            // Player preferences (mobile "More options" sheet)
            'auto_scroll'              => false,
            'loop_video'               => true,
            'playback_speed'           => 1,
            'default_quality'          => 'auto',
            'theme'                    => 'light',
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = is_bool($defaults[$k]) ? (bool) $v : $v;
        }
        return $defaults;
    }

    /* ── GET /profile/notifications ──────────────────────────────────────── */
    public function getNotifications(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->notifDefaults($request->user()),
        ]);
    }

    /* ── PATCH /profile/notifications ────────────────────────────────────── */
    public function updateNotifications(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $boolRule = ['sometimes', 'boolean'];
        $request->validate([
            'push_likes'      => $boolRule, 'push_comments'   => $boolRule,
            'push_followers'  => $boolRule, 'push_mentions'   => $boolRule,
            'push_messages'   => $boolRule, 'push_live'       => $boolRule,
            'push_following'  => $boolRule, 'push_creator'    => $boolRule,
            'email_security'  => $boolRule, 'email_account'   => $boolRule,
            'email_promo'     => $boolRule, 'email_news'      => $boolRule,
            'sms_otp'         => $boolRule, 'sms_security'    => $boolRule,
            'sms_updates'     => $boolRule,
        ]);

        $user    = $request->user();
        $current = $this->notifDefaults($user);
        $merged  = array_merge($current, array_filter($request->only(array_keys($current)), fn($v) => !is_null($v)));

        $user->update(['notification_preferences' => $merged]);

        return response()->json(['success' => true, 'data' => $merged]);
    }

    private function notifDefaults($user): array
    {
        $saved = $user->notification_preferences ?? [];
        $defaults = [
            'push_likes'      => true,  'push_comments'   => true,
            'push_followers'  => true,  'push_mentions'   => true,
            'push_messages'   => true,  'push_live'       => false,
            'push_following'  => true,  'push_creator'    => false,
            'email_security'  => true,  'email_account'   => true,
            'email_promo'     => false, 'email_news'      => false,
            'sms_otp'         => true,  'sms_security'    => true,
            'sms_updates'     => false,
        ];
        foreach ($saved as $k => $v) {
            if (array_key_exists($k, $defaults)) $defaults[$k] = (bool) $v;
        }
        return $defaults;
    }

    /* ── PATCH /profile/privacy ──────────────────────────────────────────── */
    public function updatePrivacySettings(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'is_private'             => ['sometimes', 'boolean'],
            'message_privacy'        => ['sometimes', 'in:everyone,friends,followers,no_one'],
            'active_status'          => ['sometimes', 'boolean'],
            'profile_discovery'      => ['sometimes', 'boolean'],
            'show_to_search_engines' => ['sometimes', 'boolean'],
            'stories_allow_resharing' => ['sometimes', 'boolean'],
            'comment_filter'         => ['sometimes', 'boolean'],
            'who_can_comment'        => ['sometimes', 'in:everyone,followers,no_one'],
            'who_can_tag'            => ['sometimes', 'in:everyone,friends,followers,no_one'],
            'who_can_duet'           => ['sometimes', 'in:everyone,friends,no_one'],
            'who_can_download'       => ['sometimes', 'in:everyone,friends,no_one'],
            'who_can_see_liked'      => ['sometimes', 'in:everyone,only_me'],
            'profile_view_history'   => ['sometimes', 'boolean'],
            'profile_view_privacy'   => ['sometimes', 'in:everyone,followers,private'],
            'activity_status'        => ['sometimes', 'in:public,friends,no_one'],
        ]);

        $user = $request->user();
        $data = $request->only([
            'is_private', 'message_privacy', 'active_status', 'profile_discovery',
            'show_to_search_engines', 'stories_allow_resharing', 'comment_filter', 'who_can_comment', 'who_can_tag',
            'who_can_duet', 'who_can_download', 'who_can_see_liked', 'profile_view_history',
            'profile_view_privacy', 'activity_status',
        ]);
        // Keep the legacy on/off boolean and the 3-way enum in sync.
        if (array_key_exists('activity_status', $data)) {
            $data['active_status'] = $data['activity_status'] !== 'no_one';
        } elseif (array_key_exists('active_status', $data)) {
            $data['activity_status'] = $data['active_status'] ? 'public' : 'no_one';
        }
        // Profile-view 3-way enum ↔ legacy history boolean (history off = private).
        if (array_key_exists('profile_view_privacy', $data)) {
            $data['profile_view_history'] = $data['profile_view_privacy'] !== 'private';
        } elseif (array_key_exists('profile_view_history', $data)) {
            $data['profile_view_privacy'] = $data['profile_view_history'] ? 'everyone' : 'private';
        }
        $user->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Privacy settings updated.',
            'data'    => $this->privacyResource($user->fresh()),
        ]);
    }

    /* ── GET /profile/privacy ─────────────────────────────────────────────── */
    /**
     * GET /profile/close-friends
     *
     * The owner's list, as full user rows so the picker can render it without a
     * second round trip. Ordered by handle - the list is browsed, not ranked.
     */
    public function getCloseFriends(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $rows = \Illuminate\Support\Facades\DB::table('close_friends as cf')
            ->join('users as u', 'u.id', '=', 'cf.friend_id')
            ->where('cf.user_id', $request->user()->id)
            ->orderBy('u.username')
            ->get(['u.id', 'u.username', 'u.name', 'u.avatar', 'u.is_verified']);

        return response()->json(['success' => true, 'data' => $rows]);
    }

    /**
     * PUT /profile/close-friends
     *
     * Replaces the whole list rather than adding and removing one at a time.
     * The picker is a set of checkboxes the user confirms, so the honest write
     * is the set they confirmed - and a wholesale replace cannot drift out of
     * step with what they saw the way a stream of deltas can.
     *
     * Only people the owner actually follows may be added. That is the rule the
     * feature is described by, and enforcing it here rather than trusting the
     * client is what stops a crafted request seeding the list with strangers.
     */
    public function updateCloseFriends(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'user_ids'   => ['present', 'array', 'max:500'],
            'user_ids.*' => ['integer', 'distinct'],
        ]);

        $me  = $request->user()->id;
        $ids = array_values(array_unique(array_map('intval', $request->input('user_ids', []))));
        $ids = array_diff($ids, [$me]); // you are not your own close friend

        // Keep only accounts this user follows.
        $allowed = $ids ? \Illuminate\Support\Facades\DB::table('followers')
            ->where('follower_id', $me)
            ->whereIn('following_id', $ids)
            ->where('status', 'accepted')
            ->pluck('following_id')
            ->all() : [];

        \Illuminate\Support\Facades\DB::transaction(function () use ($me, $allowed) {
            \Illuminate\Support\Facades\DB::table('close_friends')->where('user_id', $me)->delete();
            if (!$allowed) {
                return;
            }
            $now = now();
            \Illuminate\Support\Facades\DB::table('close_friends')->insert(
                array_map(fn ($id) => [
                    'user_id'    => $me,
                    'friend_id'  => $id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ], $allowed),
            );
        });

        return response()->json(['success' => true, 'data' => ['count' => count($allowed)]]);
    }

    /** GET /profile/hidden-story-users - who can never see my stories. */
    public function getHiddenStoryUsers(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $rows = \Illuminate\Support\Facades\DB::table('hidden_story_users as h')
            ->join('users as u', 'u.id', '=', 'h.hidden_user_id')
            ->where('h.user_id', $request->user()->id)
            ->orderBy('u.username')
            ->get(['u.id', 'u.username', 'u.name', 'u.avatar', 'u.is_verified']);

        return response()->json(['success' => true, 'data' => $rows]);
    }

    /**
     * PUT /profile/hidden-story-users
     *
     * Replaces the whole list, like close friends: the picker is a set the user
     * confirms, and a replace cannot drift out of step with what they saw.
     *
     * Anyone may be hidden, not only followers - a public account's stories are
     * visible to strangers, so the ability to hide one cannot be limited to
     * people who follow you.
     */
    public function updateHiddenStoryUsers(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'user_ids'   => ['present', 'array', 'max:500'],
            'user_ids.*' => ['integer', 'distinct', 'exists:users,id'],
        ]);

        $me  = $request->user()->id;
        // Hiding yourself would remove your own stories from your own feed.
        $ids = array_values(array_diff(
            array_unique(array_map('intval', $request->input('user_ids', []))),
            [$me],
        ));

        \Illuminate\Support\Facades\DB::transaction(function () use ($me, $ids) {
            \Illuminate\Support\Facades\DB::table('hidden_story_users')->where('user_id', $me)->delete();
            if (!$ids) {
                return;
            }
            $now = now();
            \Illuminate\Support\Facades\DB::table('hidden_story_users')->insert(
                array_map(fn ($id) => [
                    'user_id'        => $me,
                    'hidden_user_id' => $id,
                    'created_at'     => $now,
                    'updated_at'     => $now,
                ], $ids),
            );
        });

        return response()->json(['success' => true, 'data' => ['count' => count($ids)]]);
    }

    public function getPrivacySettings(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        return response()->json([
            'success' => true,
            'data'    => $this->privacyResource($request->user()),
        ]);
    }

    private function privacyResource($user): array
    {
        return [
            'is_private'             => (bool) ($user->is_private ?? false),
            'active_status'          => (bool) ($user->active_status ?? true),
            'profile_discovery'      => (bool) ($user->profile_discovery ?? true),
            'show_to_search_engines' => (bool) ($user->show_to_search_engines ?? false),
            'stories_allow_resharing' => (bool) ($user->stories_allow_resharing ?? true),
            'comment_filter'         => (bool) ($user->comment_filter ?? true),
            'message_privacy'        => $user->message_privacy ?? 'everyone',
            'who_can_comment'        => $user->who_can_comment ?? 'everyone',
            'who_can_tag'            => $user->who_can_tag ?? 'friends',
            'who_can_duet'           => $user->who_can_duet ?? 'friends',
            'who_can_download'       => $user->who_can_download ?? 'everyone',
            'who_can_see_liked'      => $user->who_can_see_liked ?? 'only_me',
            'profile_view_history'   => (bool) ($user->profile_view_history ?? true),
            'profile_view_privacy'   => $this->viewPrivacy($user),
            'activity_status'        => $user->activity_status ?? 'public',
        ];
    }

    /* ── PATCH /profile/saved-privacy ────────────────────────────────────── */
    public function updateSavedPrivacy(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'saved_privacy' => ['required', 'in:private,followers,public'],
        ]);

        $request->user()->update([
            'saved_privacy' => $request->input('saved_privacy'),
        ]);

        return response()->json(['success' => true, 'message' => 'Saved privacy updated.']);
    }
}
