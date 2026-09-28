// Wallet & coins READ surface, mirroring WalletController (legacy stubs) and
// StudioWalletCoinsController's read methods field-for-field:
//
//	GET /wallet                          → WalletController::show        ({data:[]})
//	GET /wallet/transactions             → WalletController::transactions({data:[]})
//	GET /studio/wallets-coins            → index    (wallet + commission + methods)
//	GET /studio/wallets-coins/packages   → packages (coin store catalog)
//	GET /studio/wallets-coins/transactions → transactions (paginated ledger)
//	GET /studio/wallets-coins/iap/products → iapProducts (store product ids)
//
// NOT ported (deferred — payment gateways / receipt verification, all cross-
// service): createOrder + the PayPal/Stripe/Razorpay/bank capture endpoints and
// iap/verify. Those credit coins through StripeService/PayPalService/
// RazorpayService/IapService and GiftCommissionService and stay in Laravel.
//
// index() mirrors Wallet::firstOrCreate, so it will create a zero wallet for a
// user who has none (idempotent — matches Laravel exactly). AdminCoinSetting
// values are read straight from admin_coin_settings; Laravel wraps that read in
// a 5-minute Cache::remember, so a value changed in the admin panel converges
// within 5 min rather than instantly — acceptable for a read-through settings
// row (the table is the source of truth either way).
package handlers

import (
	"context"
	"math"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

type WalletHandler struct {
	queries      *sqlc.Queries
	mediaBaseURL string
}

func NewWalletHandler(q *sqlc.Queries, mediaBaseURL string) *WalletHandler {
	return &WalletHandler{queries: q, mediaBaseURL: mediaBaseURL}
}

// ── Legacy wallet (both return an empty payload in Laravel) ────────────────

func (h *WalletHandler) LegacyShow(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "data": []any{}})
}

func (h *WalletHandler) LegacyTransactions(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{"success": true, "data": []any{}})
}

// ── GET /studio/wallets-coins ──────────────────────────────────────────────

func (h *WalletHandler) Index(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	wallet, err := h.queries.GetWalletByUserID(ctx, userID)
	if err != nil {
		if err != pgx.ErrNoRows {
			return serverError(c)
		}
		// firstOrCreate: no wallet yet → create the zero row, then read it back.
		if err := h.queries.CreateWalletIfMissing(ctx, userID); err != nil {
			return serverError(c)
		}
		wallet, err = h.queries.GetWalletByUserID(ctx, userID)
		if err != nil {
			return serverError(c)
		}
	}

	commissionRate := phpFloatCast(h.setting(ctx, "commission_rate", "30"))
	minWithdrawal := phpFloatCast(h.setting(ctx, "min_withdrawal_usd", "10"))
	coinUsdRate := phpIntCast(h.setting(ctx, "coin_usd_rate", "100"))

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"wallet": fiber.Map{
				"coin_balance":           wallet.CoinsBalance,
				"bonus_coin_balance":     wallet.BonusCoinBalance,
				"earned_coin_balance":    wallet.EarnedCoinBalance,
				"wallet_balance_usd":     numericFloat(wallet.WalletBalanceUsd),
				"pending_balance_usd":    numericFloat(wallet.PendingBalanceUsd),
				"total_received_coins":   wallet.TotalReceivedCoins,
				"total_commission_coins": wallet.TotalCommissionCoins,
				"total_net_earned_coins": wallet.TotalNetEarnedCoins,
				"total_spent_coins":      wallet.TotalSpentCoins,
				"total_purchased_coins":  wallet.TotalPurchasedCoins,
			},
			"commission": fiber.Map{
				"rate":               commissionRate,
				"min_withdrawal_usd": minWithdrawal,
				"coin_usd_rate":      coinUsdRate,
			},
			"payment_methods": fiber.Map{
				"card":      phpBool(h.setting(ctx, "card_enabled", "1")),
				"paypal":    phpBool(h.setting(ctx, "paypal_enabled", "1")),
				"applepay":  phpBool(h.setting(ctx, "applepay_enabled", "1")),
				"googlepay": phpBool(h.setting(ctx, "googlepay_enabled", "1")),
				"upi":       phpBool(h.setting(ctx, "upi_enabled", "1")),
				"bank":      phpBool(h.setting(ctx, "bank_enabled", "1")),
			},
		},
	})
}

// ── GET /studio/wallets-coins/packages ─────────────────────────────────────

func (h *WalletHandler) Packages(c *fiber.Ctx) error {
	ctx := c.Context()
	frontOnly := !filterValidateBool(c.Query("all"))

	rows, err := h.queries.ListActiveCoinPackages(ctx, frontOnly)
	if err != nil {
		return serverError(c)
	}

	data := make([]fiber.Map, 0, len(rows))
	for _, p := range rows {
		priceUsd := numericFloat(p.PriceUsd)
		perCoin := priceUsd / math.Max(float64(p.Coins), 1)
		data = append(data, fiber.Map{
			"id":               p.ID,
			"plan_name":        p.PlanName,
			"coins":            p.Coins,
			"price_usd":        priceUsd,
			"badge":            nullableText(p.Badge),
			"icon":             nullableText(p.Icon),
			"icon_url":         h.mediaURL(p.IconUrl),
			"is_front_visible": p.IsFrontVisible,
			"sort_order":       p.SortOrder,
			"per_coin_usd":     phpRound(perCoin, 6),
		})
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

// ── GET /studio/wallets-coins/transactions ─────────────────────────────────

func (h *WalletHandler) Transactions(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	wallet, err := h.queries.GetWalletByUserID(ctx, userID)
	if err != nil {
		if err == pgx.ErrNoRows {
			// No wallet → Laravel returns this exact minimal shape (meta:{total:0}).
			return c.JSON(fiber.Map{"success": true, "data": []any{}, "meta": fiber.Map{"total": 0}})
		}
		return serverError(c)
	}

	var typeParam pgtype.Text
	if t := c.Query("type"); t != "" {
		typeParam = pgtype.Text{String: t, Valid: true}
	}

	// perPage = min((int)per_page ?? 20, 50), then Laravel's paginate() applies
	// its `?: 15` default to a falsy (0) value.
	perPage := 20
	if raw := c.Query("per_page"); raw != "" {
		perPage = int(phpIntCast(raw))
	}
	if perPage > 50 {
		perPage = 50
	}
	if perPage == 0 {
		perPage = 15
	}

	total, err := h.queries.CountWalletTransactions(ctx, sqlc.CountWalletTransactionsParams{
		WalletID: wallet.ID,
		Type:     typeParam,
	})
	if err != nil {
		return serverError(c)
	}

	page := resolveCurrentPage(c.Query("page"))
	lastPage := 1
	if perPage > 0 && total > 0 {
		lastPage = int((total + int64(perPage) - 1) / int64(perPage))
	}
	offset := (page - 1) * perPage
	if offset < 0 {
		offset = 0
	}

	rows, err := h.queries.ListWalletTransactions(ctx, sqlc.ListWalletTransactionsParams{
		WalletID: wallet.ID,
		Type:     typeParam,
		Off:      int32(offset),
		Lim:      int32(perPage),
	})
	if err != nil {
		return serverError(c)
	}

	data := make([]fiber.Map, 0, len(rows))
	for _, t := range rows {
		data = append(data, fiber.Map{
			"id":                       t.ID,
			"type":                     t.Type,
			"description":              nullableText(t.Description),
			"gross_coins":              t.GrossCoins,
			"commission_coins":         t.CommissionCoins,
			"net_coins":                t.NetCoins,
			"amount_usd":               numericFloat(t.Amount),
			"balance_after_coins":      t.BalanceAfterCoins,
			"wallet_balance_after_usd": numericFloat(t.WalletBalanceAfterUsd),
			"status":                   t.Status,
			"reference_id":             nullableText(t.ReferenceID),
			"created_at":               toIso8601(t.CreatedAt),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"meta": fiber.Map{
			"current_page": page,
			"last_page":    lastPage,
			"per_page":     perPage,
			"total":        total,
		},
	})
}

// ── GET /studio/wallets-coins/iap/products ─────────────────────────────────

func (h *WalletHandler) IapProducts(c *fiber.Ctx) error {
	ctx := c.Context()

	platform := c.Query("platform")
	// validate(['platform' => ['required', Rule::in(['ios','android'])]]). An
	// empty value fails `required` first (implicit rule; `in` is skipped);
	// a present-but-wrong value fails `in`.
	if platform == "" {
		return validationError(c, "platform", "The platform field is required.")
	}
	if platform != "ios" && platform != "android" {
		return validationError(c, "platform", "The selected platform is invalid.")
	}

	enabled := h.coinsEnabled(ctx, platform)

	products := []fiber.Map{}
	if enabled {
		rows, err := h.queries.ListIapCoinPackages(ctx, platform)
		if err != nil {
			return serverError(c)
		}
		for _, p := range rows {
			productID := p.IosProductID
			if platform == "android" {
				productID = p.AndroidProductID
			}
			products = append(products, fiber.Map{
				"package_id": p.ID,
				"product_id": nullableText(productID),
				"plan_name":  p.PlanName,
				"coins":      p.Coins,
				"price_usd":  numericFloat(p.PriceUsd),
				"badge":      nullableText(p.Badge),
				"icon":       nullableText(p.Icon),
				"sort_order": p.SortOrder,
			})
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"enabled":  enabled,
			"products": products,
		},
	})
}

// ── helpers ────────────────────────────────────────────────────────────────

// setting reads an admin_coin_settings value (raw string), falling back to def
// when the row is absent — Laravel's AdminCoinSetting::getValue($key, $default).
func (h *WalletHandler) setting(ctx context.Context, key, def string) string {
	v, err := h.queries.GetAdminCoinSetting(ctx, key)
	if err != nil {
		return def
	}
	return v
}

// coinsEnabled mirrors IapService::coinsEnabled: a per-platform on/off flag.
func (h *WalletHandler) coinsEnabled(ctx context.Context, platform string) bool {
	key := "apple_coin_iap_enabled"
	if platform == "android" {
		key = "google_coin_iap_enabled"
	}
	return phpBool(h.setting(ctx, key, "0"))
}

// mediaURL ports Storage::disk(config('filesystems.default'))->url(): the
// default disk is r2, so this is the same public media base used everywhere.
func (h *WalletHandler) mediaURL(key pgtype.Text) any {
	if !key.Valid || key.String == "" {
		return nil
	}
	if h.mediaBaseURL == "" {
		return key.String
	}
	return h.mediaBaseURL + "/" + strings.TrimLeft(key.String, "/")
}

// resolveCurrentPage mirrors Paginator::resolveCurrentPage(): a valid int ≥1,
// else 1.
func resolveCurrentPage(raw string) int {
	if raw == "" {
		return 1
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return 1
	}
	return n
}

// phpFloatCast mirrors PHP's (float) cast of a string: the leading numeric
// prefix, else 0.
func phpFloatCast(s string) float64 {
	f, err := strconv.ParseFloat(phpNumericPrefix(s), 64)
	if err != nil {
		return 0
	}
	return f
}

// phpIntCast mirrors PHP's (int) cast of a string: leading sign+digits, else 0.
func phpIntCast(s string) int64 {
	s = strings.TrimLeft(s, " \t\n\r\v\f")
	i, n := 0, len(s)
	if i < n && (s[i] == '+' || s[i] == '-') {
		i++
	}
	for i < n && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	v, err := strconv.ParseInt(s[:i], 10, 64)
	if err != nil {
		return 0
	}
	return v
}

func phpNumericPrefix(s string) string {
	s = strings.TrimLeft(s, " \t\n\r\v\f")
	i, n := 0, len(s)
	if i < n && (s[i] == '+' || s[i] == '-') {
		i++
	}
	for i < n && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if i < n && s[i] == '.' {
		i++
		for i < n && s[i] >= '0' && s[i] <= '9' {
			i++
		}
	}
	if i < n && (s[i] == 'e' || s[i] == 'E') {
		j := i + 1
		if j < n && (s[j] == '+' || s[j] == '-') {
			j++
		}
		k := j
		for k < n && s[k] >= '0' && s[k] <= '9' {
			k++
		}
		if k > j {
			i = k
		}
	}
	return s[:i]
}

// phpRound mirrors PHP round() default mode (half away from zero, like
// math.Round).
func phpRound(x float64, prec int) float64 {
	p := math.Pow(10, float64(prec))
	return math.Round(x*p) / p
}

// filterValidateBool mirrors filter_var(FILTER_VALIDATE_BOOLEAN), the engine
// behind Request::boolean(): only 1/true/on/yes (case-insensitive) are truthy.
func filterValidateBool(s string) bool {
	switch strings.ToLower(s) {
	case "1", "true", "on", "yes":
		return true
	}
	return false
}
