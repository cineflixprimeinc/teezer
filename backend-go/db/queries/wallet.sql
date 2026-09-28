-- Wallet & coins read surface (StudioWalletCoinsController index/packages/
-- transactions/iapProducts + WalletController stubs).

-- name: GetWalletByUserID :one
SELECT id, coins_balance, bonus_coin_balance, earned_coin_balance,
       wallet_balance_usd, pending_balance_usd, total_received_coins,
       total_commission_coins, total_net_earned_coins, total_spent_coins,
       total_purchased_coins
FROM wallets
WHERE user_id = $1;

-- name: CreateWalletIfMissing :exec
-- Mirrors Wallet::firstOrCreate: DB defaults match the controller's explicit
-- zeros, so user_id + timestamps is enough. ON CONFLICT keeps it idempotent
-- (unique on user_id) under a race.
INSERT INTO wallets (user_id, created_at, updated_at)
VALUES ($1, now(), now())
ON CONFLICT (user_id) DO NOTHING;

-- name: CountWalletTransactions :one
SELECT count(*)
FROM wallet_transactions
WHERE wallet_id = sqlc.arg('wallet_id')
  AND (sqlc.narg('type')::varchar IS NULL OR type = sqlc.narg('type'));

-- name: ListWalletTransactions :many
SELECT id, type, description, gross_coins, commission_coins, net_coins,
       amount, balance_after_coins, wallet_balance_after_usd, status,
       reference_id, created_at
FROM wallet_transactions
WHERE wallet_id = sqlc.arg('wallet_id')
  AND (sqlc.narg('type')::varchar IS NULL OR type = sqlc.narg('type'))
ORDER BY created_at DESC
LIMIT sqlc.arg('lim') OFFSET sqlc.arg('off');

-- name: ListActiveCoinPackages :many
-- front_only=false → every active package (all=1); true → front-visible only.
SELECT id, plan_name, coins, price_usd, badge, icon, icon_url,
       is_front_visible, sort_order
FROM coin_packages
WHERE is_active = true
  AND (NOT sqlc.arg('front_only')::boolean OR is_front_visible = true)
ORDER BY sort_order;

-- name: ListIapCoinPackages :many
-- Active packages that carry a store product id for the given platform.
SELECT id, plan_name, coins, price_usd, badge, icon, sort_order,
       ios_product_id, android_product_id
FROM coin_packages
WHERE is_active = true
  AND ( (sqlc.arg('platform')::text = 'ios'     AND ios_product_id     IS NOT NULL)
     OR (sqlc.arg('platform')::text = 'android' AND android_product_id IS NOT NULL) )
ORDER BY sort_order;

-- name: GetAdminCoinSetting :one
SELECT value FROM admin_coin_settings WHERE key = $1;
