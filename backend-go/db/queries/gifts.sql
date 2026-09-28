-- Gifts catalog + premium subscription reads (GiftController::index,
-- StudioSubscriptionController::current/iapProducts).

-- name: ListActiveGifts :many
-- The live catalog, cheapest first by sort_order (deliberate price ties).
SELECT id, slug, name, icon_url, coin_value, cash_value
FROM gifts
WHERE is_active = true
ORDER BY sort_order;

-- name: GetCurrentSubscription :one
-- The user's active, unexpired subscription, newest first (latest()).
SELECT id, plan, status, price, currency, started_at, expires_at, cancelled_at
FROM subscriptions
WHERE user_id = $1 AND status = 'active' AND expires_at > now()
ORDER BY created_at DESC
LIMIT 1;
