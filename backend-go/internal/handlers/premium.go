// Premium mirrors PremiumController::index field-for-field:
//
//	GET /premium → Index (plans, feature grid, comparison matrix, FAQ)
//
// The whole premium page in one read: no auth, because the page has to sell to
// signed-out users too. The caller's own subscription is deliberately NOT here
// - that stays on GET /studio/subscriptions, so there is one source of truth
// for whether someone already pays.
//
// NOT ported: nothing. This endpoint is read-only and self-contained, which is
// why it was picked as the first of the premium group. The write half
// (iap/verify, which moves money through IapService + PremiumBonusService)
// stays in Laravel.
package handlers

import (
	"context"
	"encoding/json"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/sqlc"
)

type PremiumHandler struct {
	queries      *sqlc.Queries
	pool         *pgxpool.Pool
	mediaBaseURL string
}

func NewPremiumHandler(q *sqlc.Queries, pool *pgxpool.Pool, mediaBaseURL string) *PremiumHandler {
	return &PremiumHandler{queries: q, pool: pool, mediaBaseURL: mediaBaseURL}
}

// setting reads an admin_coin_settings value, falling back when absent. Laravel's
// AdminCoinSetting::getValue does the same; a missing key is normal, not an error.
func (h *PremiumHandler) setting(ctx context.Context, key string, def int) int {
	raw, err := h.queries.GetAdminSetting(ctx, key)
	if err != nil {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return n
}

func (h *PremiumHandler) Index(c *fiber.Ctx) error {
	ctx := c.Context()
	platform := c.Query("platform")

	plans, err := h.queries.ListPremiumPlans(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	planKeys := make(map[string]bool, len(plans))
	for _, p := range plans {
		planKeys[p.Key] = true
	}

	// "First one wins" rather than trusting the data to hold exactly one
	// default: an admin mid-edit can easily have none or two, and neither
	// should render a page with nothing selected. Same precedence as PHP -
	// is_default, then is_popular, then the first row.
	defaultKey := ""
	for _, p := range plans {
		if p.IsDefault {
			defaultKey = p.Key
			break
		}
	}
	if defaultKey == "" {
		for _, p := range plans {
			if p.IsPopular {
				defaultKey = p.Key
				break
			}
		}
	}
	if defaultKey == "" && len(plans) > 0 {
		defaultKey = plans[0].Key
	}

	outPlans := make([]fiber.Map, 0, len(plans))
	for _, p := range plans {
		productID := p.AndroidProductID
		if platform == "ios" {
			productID = p.IosProductID
		}

		// features is a JSON array of strings; a null column is an empty list,
		// not a null, so the client can iterate without a guard.
		features := []string{}
		if len(p.Features) > 0 {
			_ = json.Unmarshal(p.Features, &features)
		}

		outPlans = append(outPlans, fiber.Map{
			"key":         p.Key,
			"name":        p.Name,
			"tagline":     nullableText(p.Tagline),
			"price":       numericFloat(p.Price),
			"currency":    p.Currency,
			"period":      p.Period,
			"features":    features,
			"is_popular":  p.IsPopular,
			"badge_label": nullableText(p.BadgeLabel),
			"theme":       p.Theme,
			"product_id":  nullableText(productID),
		})
	}

	features, err := h.queries.ListPremiumFeatures(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	outFeatures := make([]fiber.Map, 0, len(features))
	for _, f := range features {
		outFeatures = append(outFeatures, fiber.Map{
			"icon":        f.Icon,
			"title":       f.Title,
			"description": nullableText(f.Description),
			"badge":       nullableText(f.Badge),
		})
	}

	comparisons, err := h.queries.ListPremiumComparisons(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	outComparison := make([]fiber.Map, 0, len(comparisons))
	for _, row := range comparisons {
		raw := map[string]string{}
		if len(row.Values) > 0 {
			_ = json.Unmarshal(row.Values, &raw)
		}
		// Only emit columns for tiers that still exist, so a retired plan cannot
		// leave an orphan column behind.
		vals := map[string]string{}
		for k, v := range raw {
			if planKeys[k] {
				vals[k] = v
			}
		}

		var highlight any
		if row.HighlightPlan.Valid && planKeys[row.HighlightPlan.String] {
			highlight = row.HighlightPlan.String
		}

		outComparison = append(outComparison, fiber.Map{
			"label":          row.Label,
			"values":         vals,
			"highlight_plan": highlight,
		})
	}

	faqs, err := h.queries.ListPremiumFaqs(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	outFaq := make([]fiber.Map, 0, len(faqs))
	for _, q := range faqs {
		outFaq = append(outFaq, fiber.Map{"question": q.Question, "answer": q.Answer})
	}

	legal, err := h.queries.GetAdminSetting(ctx, "premium_legal_note")
	if err != nil || legal == "" {
		legal = "Billed through your app store. Cancel anytime - access continues until the end of the billing period you already paid for."
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"plans":        outPlans,
			"default_plan": nilIfEmpty(defaultKey),
			"features":     outFeatures,
			"comparison":   outComparison,
			"faq":          outFaq,
			"trial": fiber.Map{
				"enabled": h.setting(ctx, "premium_trial_enabled", 1) != 0,
				"days":    h.setting(ctx, "premium_trial_days", 7),
			},
			"legal_note":   legal,
			"social_proof": h.socialProof(ctx),
		},
	})
}

// socialProof returns the pill's data, or nil when there is nothing honest to
// show. Mirrors PremiumController::socialProof.
func (h *PremiumHandler) socialProof(ctx context.Context) any {
	min := h.setting(ctx, "premium_social_proof_min", 50)

	real, err := h.queries.CountRecentSubscribers(ctx)
	if err != nil {
		return nil
	}

	// premium_social_proof_count overrides the counted figure when set above
	// zero. It exists so the pill can be reviewed before the product has any
	// subscribers - with none, the real count is 0 and the pill can never be
	// seen. Setting it publishes a number the database does not support, so it
	// is off by default and the response says so via is_estimate.
	override := h.setting(ctx, "premium_social_proof_count", 0)
	count := int(real)
	if override > 0 {
		count = override
	}

	if count < min {
		return nil
	}

	return fiber.Map{
		"count":       count,
		"window_days": 30,
		"is_estimate": override > 0,
		"avatars":     h.socialProofFaces(ctx),
	}
}

func (h *PremiumHandler) socialProofFaces(ctx context.Context) []fiber.Map {
	out := []fiber.Map{}
	if h.setting(ctx, "premium_social_proof_faces", 1) == 0 {
		return out
	}

	const want = 4

	subs, err := h.queries.ListRecentSubscriberFaces(ctx, want)
	if err != nil {
		return out
	}

	ids := make([]int64, 0, want)
	for _, s := range subs {
		ids = append(ids, s.ID)
		out = append(out, fiber.Map{
			"name":   faceName(s.Name, s.Username),
			"avatar": mediaJoin(h.mediaBaseURL, s.Avatar.String),
		})
	}

	// Top up with recent public members when there are not four subscribers -
	// which is every day before the product sells. These are NOT a claim that
	// they subscribed; the pill's sentence is about the count beside them, and
	// that count is governed separately by premium_social_proof_count.
	if len(out) < want {
		fill, err := h.queries.ListPublicFacesExcluding(ctx, sqlc.ListPublicFacesExcludingParams{
			ExcludeIds: ids,
			Limit:      int32(want - len(out)),
		})
		if err != nil {
			return out
		}
		for _, u := range fill {
			out = append(out, fiber.Map{
				"name":   faceName(u.Name, u.Username),
				"avatar": mediaJoin(h.mediaBaseURL, u.Avatar.String),
			})
		}
	}

	return out
}

/* ── Small conversions ──────────────────────────────────────────────────────
   numericFloat (stories.go) and mediaJoin (videoresource.go) are reused rather
   than redefined; these three have no existing equivalent.
   ────────────────────────────────────────────────────────────────────────── */

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// faceName matches PHP's `$u->name ?: $u->username` - an empty name falls
// through to the handle, so a face is never labelled with a blank.
func faceName(name, username string) string {
	if name == "" {
		return username
	}
	return name
}
