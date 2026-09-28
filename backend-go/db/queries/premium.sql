-- name: ListPremiumPlans :many
-- Mirrors PremiumController::index's plans query. Ordered by sort then id so
-- the tie-break is stable - two plans sharing a sort value must not swap
-- positions between requests.
SELECT key, name, tagline, price, currency, period, features,
       is_popular, badge_label, is_default, theme,
       ios_product_id, android_product_id
FROM subscription_plans
WHERE is_enabled = TRUE
ORDER BY sort, id;

-- name: ListPremiumFeatures :many
SELECT icon, title, description, badge
FROM premium_features
WHERE is_enabled = TRUE
ORDER BY sort, id;

-- name: ListPremiumComparisons :many
SELECT label, values, highlight_plan
FROM premium_comparisons
WHERE is_enabled = TRUE
ORDER BY sort, id;

-- name: ListPremiumFaqs :many
SELECT question, answer
FROM premium_faqs
WHERE is_enabled = TRUE
ORDER BY sort, id;

-- name: CountRecentSubscribers :one
-- DISTINCT user_id, not COUNT(*): one person resubscribing twice in the window
-- is one person upgrading, and the pill says "creators", not "purchases".
-- Matches Laravel's ->distinct('user_id')->count('user_id').
SELECT COUNT(DISTINCT user_id) FROM subscriptions
WHERE started_at >= now() - INTERVAL '30 days';

-- name: ListRecentSubscriberFaces :many
-- Real subscribers first for the social-proof row. Public accounts with a
-- picture only - an avatar here tells everyone that person pays.
SELECT u.id, u.name, u.username, u.avatar
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE s.started_at >= now() - INTERVAL '30 days'
  AND u.is_private = FALSE
  AND u.avatar IS NOT NULL
ORDER BY s.started_at DESC
LIMIT $1;

-- name: ListPublicFacesExcluding :many
-- Tops the row up when there are not enough subscribers - which is every day
-- before the product sells. These are NOT a claim that they subscribed; see
-- the note in the handler.
SELECT id, name, username, avatar
FROM users
WHERE is_private = FALSE
  AND avatar IS NOT NULL
  AND NOT (id = ANY(@exclude_ids::bigint[]))
ORDER BY id DESC
LIMIT $1;

-- name: GetAdminSetting :one
SELECT value FROM admin_coin_settings WHERE key = $1;
