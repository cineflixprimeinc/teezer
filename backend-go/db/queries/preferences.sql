-- name: AdjustUserVideoPreference :exec
-- Mirrors UserVideoPreference::adjust(): insert at max(0, delta) on first
-- interaction, otherwise clamp weight to [0, 100] and bump interaction_count.
-- Done as a single atomic upsert instead of Laravel's upsert-then-update
-- pair, which avoids the race window the PHP version has between its two
-- queries.
INSERT INTO user_video_preferences (user_id, pref_type, pref_value, weight, interaction_count, updated_at)
VALUES ($1, $2, $3, GREATEST(0, $4::numeric), 1, now())
ON CONFLICT (user_id, pref_type, pref_value)
DO UPDATE SET
    weight = GREATEST(0, LEAST(100, user_video_preferences.weight + $4::numeric)),
    interaction_count = user_video_preferences.interaction_count + 1,
    updated_at = now();
