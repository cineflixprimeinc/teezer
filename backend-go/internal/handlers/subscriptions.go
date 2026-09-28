// Premium subscription reads, mirroring StudioSubscriptionController's read
// methods field-for-field:
//
//	GET /studio/subscriptions            → current     (active sub or null)
//	GET /studio/subscriptions/iap/products → iapProducts (store product ids)
//
// NOT ported (deferred — payment gateways / receipt verify / bonus grant, all
// cross-service): createIntent + captureStripe/Paypal/Razorpay + cancel +
// iap/verify. Those move money and grant coins through StripeService/
// PayPalService/RazorpayService/IapService + PremiumBonusService and stay in
// Laravel.
package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

type SubscriptionsHandler struct {
	queries *sqlc.Queries
}

func NewSubscriptionsHandler(q *sqlc.Queries) *SubscriptionsHandler {
	return &SubscriptionsHandler{queries: q}
}

// ── GET /studio/subscriptions ──────────────────────────────────────────────

func (h *SubscriptionsHandler) Current(c *fiber.Ctx) error {
	sub, err := h.queries.GetCurrentSubscription(c.Context(), auth.UserID(c))
	if err != nil {
		if err == pgx.ErrNoRows {
			return c.JSON(fiber.Map{"success": true, "data": nil})
		}
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": formatSubscription(sub)})
}

// formatSubscription mirrors StudioSubscriptionController::formatSubscription.
func formatSubscription(s sqlc.GetCurrentSubscriptionRow) fiber.Map {
	// isActive(): status === 'active' && expires_at?->isFuture().
	isActive := s.Status == "active" && s.ExpiresAt.Valid && s.ExpiresAt.Time.After(time.Now().UTC())
	return fiber.Map{
		"id":           s.ID,
		"plan":         s.Plan,
		"status":       s.Status,
		"price":        numericFloat(s.Price),
		"currency":     s.Currency,
		"started_at":   toIso8601(s.StartedAt),
		"expires_at":   toIso8601(s.ExpiresAt),
		"cancelled_at": toIso8601(s.CancelledAt),
		"is_active":    isActive,
	}
}

// ── GET /studio/subscriptions/iap/products ─────────────────────────────────

func (h *SubscriptionsHandler) IapProducts(c *fiber.Ctx) error {
	ctx := c.Context()

	platform := c.Query("platform")
	if platform == "" {
		return validationError(c, "platform", "The platform field is required.")
	}
	if platform != "ios" && platform != "android" {
		return validationError(c, "platform", "The selected platform is invalid.")
	}

	enabled := phpBool(adminCoinSetting(ctx, h.queries, subsEnabledKey(platform), "0"))

	products := []fiber.Map{}
	if enabled {
		for _, plan := range []string{"monthly", "annual"} {
			productID := h.productIDFor(ctx, platform, "premium_"+plan)
			if productID == "" {
				continue // not configured in the store yet
			}
			products = append(products, fiber.Map{
				"plan":       plan,
				"product_id": productID,
				"price":      h.priceFor(ctx, plan),
			})
		}
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"enabled":  enabled && len(products) > 0,
			"products": products,
		},
	})
}

// productIDFor mirrors IapService::productIdFor: "{apple|google}_product_{planId}".
func (h *SubscriptionsHandler) productIDFor(ctx context.Context, platform, planID string) string {
	prefix := "apple"
	if platform == "android" {
		prefix = "google"
	}
	return adminCoinSetting(ctx, h.queries, prefix+"_product_"+planID, "")
}

// priceFor mirrors StudioSubscriptionController::priceFor.
func (h *SubscriptionsHandler) priceFor(ctx context.Context, plan string) float64 {
	if plan == "annual" {
		return phpFloatCast(adminCoinSetting(ctx, h.queries, "subscription_annual_price", "39.99"))
	}
	return phpFloatCast(adminCoinSetting(ctx, h.queries, "subscription_monthly_price", "4.99"))
}

func subsEnabledKey(platform string) string {
	if platform == "android" {
		return "google_sub_iap_enabled"
	}
	return "apple_sub_iap_enabled"
}

// adminCoinSetting reads an admin_coin_settings value (raw string), falling back
// to def when the row is absent — AdminCoinSetting::getValue($key, $default).
func adminCoinSetting(ctx context.Context, q *sqlc.Queries, key, def string) string {
	v, err := q.GetAdminCoinSetting(ctx, key)
	if err != nil {
		return def
	}
	return v
}
