-- Stories: the read surface (feed / activeUserIds / show / viewers) plus the
-- interaction writes (view / react / destroy). Story CREATION stays in Laravel
-- for now - it needs the media upload path.
--
-- SOFT DELETES: `stories` uses Laravel's SoftDeletes trait, which applies
-- `deleted_at IS NULL` as an invisible global scope on every Eloquent query.
-- Go has no equivalent, so EVERY query here has to spell it out. Omitting it
-- silently serves stories the owner has already deleted - which is exactly what
-- these queries did before this increment. Same trap the comments port hit; add
-- the clause to any new stories query without thinking about it.

-- name: ListActiveStoryUserIds :many
-- activeUserIds(): distinct authors with a live, publicly-visible story - the
-- app's story-ring indicators. close_friends/only_me are excluded here on
-- purpose (they are not "active" to anyone but the owner).
SELECT DISTINCT user_id
FROM stories
WHERE status = 'published'
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
  AND visibility IN ('everyone', 'followers')
ORDER BY user_id;

-- name: ListAcceptedFollowingIDs :many
-- The users I follow (accepted). feed() unions this with my own id.
SELECT following_id
FROM followers
WHERE follower_id = $1 AND status = 'accepted';

-- name: ListFeedStories :many
-- feed()'s story rows for [me + everyone I follow], newest first, plus the
-- author columns the grouped payload needs. The visibility gate is the security
-- boundary: my own stories at any visibility, but from others only
-- everyone/followers - never their close_friends/only_me. Bounded at 300 like
-- Laravel (grouping + the per-user limit happen in Go).
SELECT
    s.id, s.user_id, s.caption, s.visibility, s.allow_replies, s.allow_resharing,
    s.save_to_archive, s.status, s.location, s.link, s.expires_at, s.created_at,
    u.username     AS author_username,
    u.name         AS author_name,
    u.avatar       AS author_avatar,
    u.is_verified  AS author_verified
FROM stories s
JOIN users u ON u.id = s.user_id
WHERE s.user_id = ANY($1::bigint[])
  AND s.status = 'published'
  AND s.deleted_at IS NULL
  AND (s.expires_at IS NULL OR s.expires_at > now())
  AND (s.user_id = $2 OR s.visibility IN ('everyone', 'followers'))
ORDER BY s.created_at DESC
LIMIT 300;

-- name: ListStoryMediaForStories :many
-- All media for a set of stories, ordered so each story's slides stay in
-- order_index order after grouping.
SELECT id, story_id, media_type, media_url, thumbnail_url, duration_seconds,
       order_index, source_type, shared_video_id
FROM story_media
WHERE story_id = ANY($1::bigint[])
ORDER BY story_id, order_index;

-- name: ListStoryLayersForStories :many
-- All layers for a set of stories, with the mentioned user's handle joined in.
SELECT
    l.id, l.story_id, l.slide_index, l.type, l.text, l.url, l.mentioned_user_id,
    l.hashtag, l.location_name, l.x_percent, l.y_percent, l.scale_value,
    l.rotation, l.color, l.font, l.z_index,
    mu.username AS mentioned_username
FROM story_layers l
LEFT JOIN users mu ON mu.id = l.mentioned_user_id
WHERE l.story_id = ANY($1::bigint[])
ORDER BY l.story_id, l.z_index;

-- name: ListViewedStoryIDs :many
-- Which of these stories the viewer has already seen (feed's has_unseen flag).
SELECT story_id
FROM story_views
WHERE viewer_id = $1 AND story_id = ANY($2::bigint[]);

-- name: ListMyActiveStories :many
-- myStories(): my own published + unexpired stories, newest first.
SELECT id, user_id, caption, visibility, allow_replies, allow_resharing,
       save_to_archive, status, location, link, expires_at, created_at, deleted_at
FROM stories
WHERE user_id = $1
  AND status = 'published'
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY created_at DESC;

-- name: ListDraftStories :many
-- drafts(): my draft stories, newest first.
SELECT id, user_id, caption, visibility, allow_replies, allow_resharing,
       save_to_archive, status, location, link, expires_at, created_at, deleted_at
FROM stories
WHERE user_id = $1 AND status = 'draft' AND deleted_at IS NULL
ORDER BY created_at DESC;

-- name: GetStoryForShow :one
-- show(): one story by id (findOrFail). Visibility is enforced in the handler
-- (canViewStory), not here - the row is needed to make that decision.
SELECT id, user_id, caption, visibility, allow_replies, allow_resharing,
       save_to_archive, status, location, link, expires_at, created_at, deleted_at
FROM stories
WHERE id = $1 AND deleted_at IS NULL;

-- name: ListPublishedStoriesForUser :many
-- userStories(): a profile's published + unexpired stories, newest first.
SELECT id, user_id, caption, visibility, allow_replies, allow_resharing,
       save_to_archive, status, location, link, expires_at, created_at, deleted_at
FROM stories
WHERE user_id = $1
  AND status = 'published'
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY created_at DESC;

-- name: GetUserForStories :one
-- userStories(): the profile being viewed, with the columns the private-account
-- gate needs. Banned users are a 404 (findOrFail where is_banned=false).
SELECT id, username, name, avatar, is_verified, is_private
FROM users
WHERE username = $1 AND is_banned = false;

-- name: GetStoryOwner :one
-- viewers()/canViewStory helper: just the owner + live-status columns.
SELECT user_id, status, expires_at, visibility FROM stories WHERE id = $1 AND deleted_at IS NULL;

-- name: ListStoryViewers :many
-- viewers(): who viewed a story (excluding the owner), with each viewer's
-- reaction if any plus the two per-row flags the viewer sheet renders -
-- `replied` (story_messages) and `follows_me` - newest view first. The EXISTS
-- subselects keep this one round trip however long the list gets.
SELECT
    u.id,
    u.username,
    u.name        AS display_name,
    u.avatar,
    u.is_verified,
    sv.viewed_at,
    sr.reaction_type,
    EXISTS (
        SELECT 1 FROM story_messages sm
        WHERE sm.story_id = sv.story_id AND sm.sender_id = sv.viewer_id
    ) AS replied,
    EXISTS (
        SELECT 1 FROM followers f
        WHERE f.follower_id = sv.viewer_id AND f.following_id = $2
          AND f.status = 'accepted'
    ) AS follows_me
FROM story_views sv
JOIN users u ON u.id = sv.viewer_id
LEFT JOIN story_reactions sr ON sr.user_id = sv.viewer_id AND sr.story_id = $1
WHERE sv.story_id = $1 AND sv.viewer_id <> $2
ORDER BY sv.viewed_at DESC;

/* ── Interaction writes ─────────────────────────────────────────────────── */

-- name: GetLiveStoryForInteraction :one
-- view()/react()/share()/reply()'s findOrFail: the story must be published,
-- unexpired and not soft-deleted. allow_replies/allow_resharing come back too
-- so reply()/share() can enforce their switches without a second round trip
-- (Laravel puts them in the same where-chain or reads the row it just loaded).
SELECT id, user_id, status, expires_at, visibility, allow_replies, allow_resharing
FROM stories
WHERE id = $1
  AND status = 'published'
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
LIMIT 1;

-- name: InsertStoryView :one
-- view() step 1a (StoryAnalyticsService::recordView): claim the UNIQUE
-- (story_id, viewer_id) row with the full analytics context attached. RETURNING
-- id tells the caller this was the viewer's FIRST view - which gates the
-- realtime nudge; ON CONFLICT DO NOTHING returning no row means an existing
-- viewer took the rewatch/progress path instead.
INSERT INTO story_views (
    story_id, viewer_id, story_owner_id, platform, device, session_id,
    view_events, watch_duration, completed, viewed_at, last_viewed_at
) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, now(), now())
ON CONFLICT (story_id, viewer_id) DO NOTHING
RETURNING id;

-- name: TouchStoryViewRewatch :exec
-- view() step 1b - a REwatch by an already-recorded viewer: accumulate onto the
-- one unique-viewer row instead of inserting a second. unique_viewers stays
-- pinned however many times they come back; view_events counts every watch.
UPDATE story_views SET
    view_events    = view_events + 1,
    watch_duration = watch_duration + $3,
    completed      = completed OR $4,
    last_viewed_at = now()
WHERE story_id = $1 AND viewer_id = $2;

-- name: FoldStoryViewProgress :exec
-- view() progress_only branch - "I am reporting how long the watch I already
-- recorded lasted", never a second watch. Accumulates the measurement onto the
-- viewer's row WITHOUT bumping view_events.
UPDATE story_views SET
    watch_duration = watch_duration + $3,
    completed      = completed OR $4,
    last_viewed_at = now()
WHERE story_id = $1 AND viewer_id = $2;

-- name: InsertStoryViewEvent :exec
-- Append-only per-watch/per-slide detail. Drop-off and completion live here -
-- they cannot be reconstructed from the deduplicated story_views row.
INSERT INTO story_view_events (
    story_id, viewer_id, story_owner_id, story_media_id, slide_index,
    platform, device, session_id, watch_duration, completed
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

-- name: LatestStoryViewEventID :one
-- The event row a progress report folds itself INTO rather than appending a
-- second row for the same watch.
SELECT id FROM story_view_events
WHERE story_id = $1 AND viewer_id = $2
ORDER BY id DESC LIMIT 1;

-- name: FoldStoryViewEventProgress :exec
UPDATE story_view_events SET
    watch_duration = watch_duration + $3,
    completed      = completed OR $4
WHERE id = $1;

-- name: UpsertStoryReaction :exec
-- react(): one reaction per user per story - swapping ❤️ for 🔥 updates the row
-- rather than adding a second. Mirrors Laravel's upsert on the same unique key.
INSERT INTO story_reactions (story_id, user_id, reaction_type, created_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (story_id, user_id)
DO UPDATE SET reaction_type = EXCLUDED.reaction_type, created_at = now();

-- name: SoftDeleteOwnStory :one
-- destroy(): Story uses SoftDeletes, so Laravel's $story->delete() sets
-- deleted_at - it does NOT remove the row. A hard DELETE here would diverge
-- from Laravel AND cascade story_media/story_layers/story_views/story_reactions
-- away for good. Scoped to the owner (Laravel's where user_id = me + findOrFail)
-- and to rows not already deleted, so a repeat delete is a clean 404.
UPDATE stories
SET deleted_at = now()
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
RETURNING id;

-- name: DeleteStoryReaction :execrows
-- removeReaction(): take back one's own reaction. Idempotent by contract -
-- removing nothing is success (`removed=false`), not a 404. Returns rows
-- affected so the handler can report which happened.
DELETE FROM story_reactions WHERE story_id = $1 AND user_id = $2;

-- name: InsertStoryShare :exec
-- share(): a share is an EVENT ("sent it"), not a state ("has seen it") - no
-- dedup; sending to three friends is genuinely three shares.
INSERT INTO story_shares (story_id, sharer_id, story_owner_id, channel, target_user_id, platform)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: SelectStoryAnalytics :one
-- The live analytics aggregates for ONE story in a single pass - identical
-- arithmetic to StoryAnalyticsService::recompute: COUNT(*) is the unique-
-- viewer headline, SUM(view_events) is total events including rewatches, and
-- replies count DISTINCT senders so one person replying ten times is still
-- one reply. Views/reactions exclude the owner, shares do not have to.
-- Named args: `story_id` exists on every table involved, so sqlc needs the
-- alias hint to infer parameter names.
SELECT
    (SELECT COUNT(*) FROM story_views v
       WHERE v.story_id = sqlc.arg(story_id) AND v.viewer_id <> sqlc.arg(owner_id))::bigint AS unique_viewers,
    (SELECT COALESCE(SUM(v.view_events), 0) FROM story_views v
       WHERE v.story_id = sqlc.arg(story_id) AND v.viewer_id <> sqlc.arg(owner_id))::bigint AS total_view_events,
    (SELECT COALESCE(SUM(v.watch_duration), 0) FROM story_views v
       WHERE v.story_id = sqlc.arg(story_id) AND v.viewer_id <> sqlc.arg(owner_id))::bigint AS total_watch_seconds,
    (SELECT COUNT(*) FROM story_views v
       WHERE v.story_id = sqlc.arg(story_id) AND v.viewer_id <> sqlc.arg(owner_id) AND v.completed)::bigint AS completion_count,
    (SELECT COUNT(DISTINCT m.sender_id) FROM story_messages m
       WHERE m.story_id = sqlc.arg(story_id) AND m.sender_id <> sqlc.arg(owner_id))::bigint AS reply_count,
    (SELECT COUNT(*) FROM story_shares sh
       WHERE sh.story_id = sqlc.arg(story_id))::bigint AS share_count;

-- name: CountStoryReactionsByType :many
-- reactions_breakdown for the analytics shape: one row per reaction type that
-- has at least one non-owner reactor. Zero types are filled client-side of the
-- query, from the same REACTIONS list Laravel uses.
SELECT sr.reaction_type, COUNT(*)::bigint AS cnt
FROM story_reactions sr
WHERE sr.story_id = sqlc.arg(story_id) AND sr.user_id <> sqlc.arg(owner_id)
GROUP BY sr.reaction_type;

-- name: UpsertStoryAnalyticsRollup :exec
-- Keep the DERIVED story_analytics rollup row fresh on every write path, the
-- same way StoryAnalyticsService::refresh does. Recompute-by-upsert (not blind
-- increments): a retried write converges instead of drifting.
INSERT INTO story_analytics (
    story_id, story_owner_id, unique_viewers, reaction_count, reply_count,
    share_count, total_view_events, completion_count, total_watch_seconds,
    reactions_breakdown, recomputed_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, now(), now(), now()
)
ON CONFLICT (story_id) DO UPDATE SET
    story_owner_id      = EXCLUDED.story_owner_id,
    unique_viewers      = EXCLUDED.unique_viewers,
    reaction_count      = EXCLUDED.reaction_count,
    reply_count         = EXCLUDED.reply_count,
    share_count         = EXCLUDED.share_count,
    total_view_events   = EXCLUDED.total_view_events,
    completion_count    = EXCLUDED.completion_count,
    total_watch_seconds = EXCLUDED.total_watch_seconds,
    reactions_breakdown = EXCLUDED.reactions_breakdown,
    recomputed_at       = EXCLUDED.recomputed_at,
    updated_at          = now();

/* ── reply(): story reply -> story_messages + a real DM ─────────────────── */

-- name: InsertStoryMessage :exec
-- The story_messages row Laravel writes first. This is what the viewers sheet's
-- `replied` flag reads, and it is SEPARATE from the DM below - both exist.
INSERT INTO story_messages (story_id, sender_id, receiver_id, message, created_at)
VALUES ($1, $2, $3, $4, now());

-- name: PickStoryPreviewMedia :one
-- The thumbnail Laravel attaches to the DM. It prefers a real slide (image or
-- video) and falls back to the story's first media of any type. Laravel picks
-- randomly among image/video slides; ordering by order_index instead makes the
-- preview deterministic - a random cover on a reply notification has no upside
-- and makes the endpoint untestable.
SELECT media_type, media_url, thumbnail_url
FROM story_media
WHERE story_id = $1
ORDER BY (media_type IN ('image','video')) DESC, order_index
LIMIT 1;

-- name: GetConversationBetween :one
-- Conversations are keyed by the ORDERED pair (user_a = lower id), so a thread
-- is found regardless of who opens it. Caller must pass min/max.
SELECT id, status, received_by
FROM conversations
WHERE user_a_id = $1 AND user_b_id = $2
LIMIT 1;

-- name: InsertConversation :one
-- A story reply bypasses the normal message-request flow and lands approved -
-- replying to someone's story is consent enough, which is what Laravel does.
INSERT INTO conversations (user_a_id, user_b_id, initiated_by, received_by, status, approved_at, created_at, updated_at)
VALUES ($1, $2, $3, $4, 'approved', now(), now(), now())
RETURNING id;

-- name: ApproveConversation :exec
-- A pending request the OWNER received is upgraded to approved by the reply, so
-- the thread shows up in their inbox instead of staying buried in requests.
UPDATE conversations
SET status = 'approved', approved_at = now(), updated_at = now()
WHERE id = $1;

-- name: InsertStoryReplyMessage :one
INSERT INTO direct_messages (
    conversation_id, sender_id, receiver_id, body, message_type,
    story_id, story_thumbnail_url, created_at, updated_at
) VALUES ($1, $2, $3, $4, 'story_reply', $5, $6, now(), now())
RETURNING id;

/* ── store(): create a story ────────────────────────────────────────────── */

-- name: InsertStory :one
-- expires_at is passed in rather than computed here: a draft has none, and a
-- published story expires 24h out. Both are computed by the caller from the
-- SAME clock as the rest of the request.
INSERT INTO stories (
    user_id, caption, visibility, allow_replies, allow_resharing,
    save_to_archive, status, location, link, expires_at, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
RETURNING id, user_id, caption, visibility, allow_replies, allow_resharing,
          save_to_archive, status, location, link, expires_at, created_at, deleted_at;

-- name: InsertStoryMedia :exec
-- Laravel's store() sets only media_url and order_index - thumbnail_url and
-- duration_seconds stay NULL and are filled later by the transcode path, so
-- this deliberately does not invent values for them.
INSERT INTO story_media (story_id, media_type, media_url, order_index)
VALUES ($1, $2, $3, $4);

-- name: InsertStoryLayer :exec
-- One overlay. Column order and the defaults below mirror StoryController's
-- StoryLayer::create block exactly, including its substr() truncations, which
-- the handler applies before calling this.
INSERT INTO story_layers (
    story_id, slide_index, type, text, url, mentioned_user_id, hashtag,
    location_name, x_percent, y_percent, scale_value, rotation, color, font, z_index
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);

/* ── fromVideo() / report() ─────────────────────────────────────────────── */

-- name: GetVideoForStoryShare :one
-- fromVideo()'s findOrFail plus the consent columns. allow_sharing is the flag
-- this endpoint historically ignored - it existed on `videos` the whole time and
-- was simply never read, so ANY published video could be pushed into a stranger's
-- story regardless of the creator's setting. It is load-bearing; see the handler.
SELECT id, user_id, status, video_url, thumbnail_url, duration, allow_sharing
FROM videos
WHERE id = $1;

-- name: InsertSharedVideoStoryMedia :exec
-- The story references the video's existing object key instead of re-uploading
-- it - source_type='shared_video' is what the read surface keys off to sign the
-- URL through the videos path rather than the stories one.
INSERT INTO story_media (
    story_id, media_type, source_type, shared_video_id,
    media_url, thumbnail_url, duration_seconds, order_index
) VALUES ($1, 'video', 'shared_video', $2, $3, $4, $5, 0);

-- name: IncrementVideoShares :exec
-- Laravel does this inside a try/catch and ignores failures ("quietly track as a
-- share"), so the caller treats an error here as non-fatal too.
UPDATE videos SET shares_count = shares_count + 1 WHERE id = $1;

-- name: GetPublishedStoryForReport :one
-- report()'s findOrFail. Laravel scopes to status='published' and gets
-- `deleted_at IS NULL` free from the SoftDeletes global scope - spelled out here
-- because Go has no equivalent. Note there is deliberately NO expiry check:
-- Laravel lets an expired-but-not-deleted story still be reported.
SELECT id FROM stories WHERE id = $1 AND status = 'published' AND deleted_at IS NULL;

-- name: UpsertStoryReport :exec
-- One report per person per story; re-reporting updates the reason and resets
-- the row to pending, exactly like Laravel's upsert on the same unique key.
INSERT INTO story_reports (story_id, reporter_id, reason, status, created_at)
VALUES ($1, $2, $3, 'pending', now())
ON CONFLICT (story_id, reporter_id)
DO UPDATE SET reason = EXCLUDED.reason, status = 'pending';
