-- Music library reads. The Laravel original builds its WHERE clause with a
-- chain of if(filled(...)) branches; that is expressed here as
-- "NULLIF(@x,'') IS NULL OR <predicate>", so one prepared statement covers every
-- combination of filters instead of sqlc needing a query per permutation.
--
-- ILIKE, not LOWER(...) LIKE: the original uses 'ilike' and Postgres can use a
-- trigram index on it, which LOWER() would defeat.

-- name: ListMusicLibrary :many
-- MusicLibraryController::library. Category handling is folded into the
-- ORDER BY / WHERE below and mirrors the PHP match() arm for arm.
SELECT id, title, artist_name, album, cover_url, audio_url, duration,
       plays_count, uses_count, genre, mood, language, license_type,
       featured, recommended, source_type, status, created_at
FROM music_tracks
WHERE source_type = 'library'
  AND status = 'published'
  AND show_in_studio = TRUE
  AND (NULLIF(@search::text, '') IS NULL
       OR title ILIKE '%' || @search::text || '%'
       OR artist_name ILIKE '%' || @search::text || '%')
  AND (NULLIF(@mood::text, '') IS NULL OR mood ILIKE '%' || @mood::text || '%')
  AND (NULLIF(@genre::text, '') IS NULL OR genre ILIKE '%' || @genre::text || '%')
  AND (NULLIF(@language::text, '') IS NULL OR language ILIKE '%' || @language::text || '%')
  AND (NULLIF(@usage_rights::text, '') IS NULL OR license_type = @usage_rights::text)
  -- duration buckets: short <60, medium 60-180, long 181-300, very_long >300
  AND (NULLIF(@duration_bucket::text, '') IS NULL
       OR (@duration_bucket::text = 'short'     AND duration < 60)
       OR (@duration_bucket::text = 'medium'    AND duration BETWEEN 60 AND 180)
       OR (@duration_bucket::text = 'long'      AND duration BETWEEN 181 AND 300)
       OR (@duration_bucket::text = 'very_long' AND duration > 300)
       OR @duration_bucket::text NOT IN ('short','medium','long','very_long'))
  AND (NOT @only_featured::bool OR featured = TRUE)
  AND (NOT @only_recommended::bool OR recommended = TRUE)
  AND (NOT @only_reelsoo::bool
       OR artist_name ILIKE '%reelsoo%' OR created_by_admin_id IS NOT NULL)
  AND (NOT @only_artist::bool
       OR (artist_name NOT ILIKE '%reelsoo%' AND created_by_admin_id IS NULL))
  AND (NULLIF(@genre_exact::text, '') IS NULL OR genre ILIKE '%' || @genre_exact::text || '%')
  AND (NULLIF(@mood_exact::text, '') IS NULL OR mood ILIKE '%' || @mood_exact::text || '%')
ORDER BY
  CASE WHEN @order_by_plays::bool THEN plays_count END DESC NULLS LAST,
  id DESC
LIMIT $1 OFFSET $2;

-- name: CountMusicLibrary :one
SELECT COUNT(*) FROM music_tracks
WHERE source_type = 'library'
  AND status = 'published'
  AND show_in_studio = TRUE
  AND (NULLIF(@search::text, '') IS NULL
       OR title ILIKE '%' || @search::text || '%'
       OR artist_name ILIKE '%' || @search::text || '%')
  AND (NULLIF(@mood::text, '') IS NULL OR mood ILIKE '%' || @mood::text || '%')
  AND (NULLIF(@genre::text, '') IS NULL OR genre ILIKE '%' || @genre::text || '%')
  AND (NULLIF(@language::text, '') IS NULL OR language ILIKE '%' || @language::text || '%')
  AND (NULLIF(@usage_rights::text, '') IS NULL OR license_type = @usage_rights::text)
  AND (NULLIF(@duration_bucket::text, '') IS NULL
       OR (@duration_bucket::text = 'short'     AND duration < 60)
       OR (@duration_bucket::text = 'medium'    AND duration BETWEEN 60 AND 180)
       OR (@duration_bucket::text = 'long'      AND duration BETWEEN 181 AND 300)
       OR (@duration_bucket::text = 'very_long' AND duration > 300)
       OR @duration_bucket::text NOT IN ('short','medium','long','very_long'))
  AND (NOT @only_featured::bool OR featured = TRUE)
  AND (NOT @only_recommended::bool OR recommended = TRUE)
  AND (NOT @only_reelsoo::bool
       OR artist_name ILIKE '%reelsoo%' OR created_by_admin_id IS NOT NULL)
  AND (NOT @only_artist::bool
       OR (artist_name NOT ILIKE '%reelsoo%' AND created_by_admin_id IS NULL))
  AND (NULLIF(@genre_exact::text, '') IS NULL OR genre ILIKE '%' || @genre_exact::text || '%')
  AND (NULLIF(@mood_exact::text, '') IS NULL OR mood ILIKE '%' || @mood_exact::text || '%');

-- name: ListMusicPicker :many
-- MusicLibraryController::picker. Note the OR group: a track shows if it is
-- flagged for the picker OR allowed on reels OR allowed on stories.
-- mood/genre match EXACTLY here, unlike library's ILIKE - kept as-is.
SELECT id, title, artist_name, album, cover_url, audio_url, duration,
       plays_count, uses_count, genre, mood, language, license_type,
       featured, recommended, source_type, status, created_at
FROM music_tracks
WHERE source_type = 'library'
  AND status = 'published'
  AND (show_in_upload_picker = TRUE OR allow_reels = TRUE OR allow_stories = TRUE)
  AND (NULLIF(@search::text, '') IS NULL
       OR title ILIKE '%' || @search::text || '%'
       OR artist_name ILIKE '%' || @search::text || '%')
  AND (NULLIF(@mood::text, '') IS NULL OR mood = @mood::text)
  AND (NULLIF(@genre::text, '') IS NULL OR genre = @genre::text)
  AND (NOT @only_reels::bool OR allow_reels = TRUE)
  AND (NOT @only_stories::bool OR allow_stories = TRUE)
ORDER BY plays_count DESC, id DESC
LIMIT $1 OFFSET $2;

-- name: CountMusicPicker :one
SELECT COUNT(*) FROM music_tracks
WHERE source_type = 'library'
  AND status = 'published'
  AND (show_in_upload_picker = TRUE OR allow_reels = TRUE OR allow_stories = TRUE)
  AND (NULLIF(@search::text, '') IS NULL
       OR title ILIKE '%' || @search::text || '%'
       OR artist_name ILIKE '%' || @search::text || '%')
  AND (NULLIF(@mood::text, '') IS NULL OR mood = @mood::text)
  AND (NULLIF(@genre::text, '') IS NULL OR genre = @genre::text)
  AND (NOT @only_reels::bool OR allow_reels = TRUE)
  AND (NOT @only_stories::bool OR allow_stories = TRUE);

-- name: ListTrendingMusic :many
-- MusicLibraryController::trending - top 10 library tracks by all-time plays.
SELECT id, title, artist_name, album, cover_url, audio_url, duration,
       plays_count, uses_count, genre, mood, language, license_type,
       featured, recommended, source_type, status, created_at
FROM music_tracks
WHERE source_type = 'library' AND status = 'published'
ORDER BY plays_count DESC, id DESC
LIMIT 10;

-- name: ListWeeklyPopularMusic :many
-- Plays logged in the last 7 days, most-played first. Returns nothing when no
-- play has been logged in the window - the handler then falls back to all-time,
-- exactly as the PHP does.
SELECT mt.id, mt.title, mt.artist_name, mt.cover_url, mt.audio_url,
       mt.plays_count, mt.duration, COUNT(pl.id) AS week_plays
FROM music_play_logs pl
JOIN music_tracks mt ON mt.id = pl.track_id
WHERE pl.played_at >= now() - INTERVAL '7 days'
  AND mt.status = 'published'
GROUP BY mt.id, mt.title, mt.artist_name, mt.cover_url, mt.audio_url,
         mt.plays_count, mt.duration
ORDER BY week_plays DESC
LIMIT $1;

-- name: ListPopularMusicFallback :many
-- The all-time fallback for weekly-popular. Not filtered to source_type, same
-- as the PHP fallback branch.
SELECT id, title, artist_name, cover_url, audio_url, plays_count, duration
FROM music_tracks
WHERE status = 'published'
ORDER BY plays_count DESC, id DESC
LIMIT $1;

-- name: MusicTrackExists :one
SELECT id FROM music_tracks WHERE id = $1;

-- name: IncrementMusicPlays :exec
UPDATE music_tracks SET plays_count = plays_count + 1, updated_at = now() WHERE id = $1;

-- name: IncrementMusicUses :exec
UPDATE music_tracks SET uses_count = uses_count + 1, updated_at = now() WHERE id = $1;

-- name: InsertMusicPlayLog :exec
INSERT INTO music_play_logs (track_id, user_id, source, played_at)
VALUES ($1, $2, $3, now());

-- name: InsertMusicUsage :exec
INSERT INTO music_usages (track_id, user_id, content_id, content_type, used_at)
VALUES ($1, $2, $3, $4, now());
