// Gifts catalog read, mirroring GiftController::index field-for-field:
//
//	GET /gifts → the live 200-gift catalog, cheapest first by sort_order.
//
// The controller uses get(['id','slug','name','icon_url','coin_value',
// 'cash_value']) on a RAW Eloquent model ($timestamps=false), so the payload is
// exactly those six columns with the model's casts applied:
//   - coin_value : integer column, no cast → JSON number
//   - cash_value : decimal:4 cast → JSON STRING with 4 fixed places ("0.1900")
//   - icon_url   : raw stored value (a "/gifts/..svg" path), NOT Storage::url'd
//   - slug/icon_url are nullable → null when absent
//
// NOT ported: POST /gifts/send — it moves coins through
// GiftCommissionService::processReceivedGift (row-locked balance mutation +
// NotificationService), a cross-service write that stays in Laravel.
package handlers

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/sqlc"
)

type GiftsHandler struct {
	queries *sqlc.Queries
}

func NewGiftsHandler(q *sqlc.Queries) *GiftsHandler {
	return &GiftsHandler{queries: q}
}

func (h *GiftsHandler) Index(c *fiber.Ctx) error {
	rows, err := h.queries.ListActiveGifts(c.Context())
	if err != nil {
		return serverError(c)
	}
	data := make([]fiber.Map, 0, len(rows))
	for _, g := range rows {
		data = append(data, fiber.Map{
			"id":         g.ID,
			"slug":       nullableText(g.Slug),
			"name":       g.Name,
			"icon_url":   nullableText(g.IconUrl),
			"coin_value": g.CoinValue,
			"cash_value": numericFixed(g.CashValue, 4),
		})
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

// numericFixed renders a NUMERIC as a fixed-places decimal STRING, matching
// Eloquent's decimal:N cast (number_format($v, N, '.', '')). The column already
// stores ≤N decimals, so no rounding occurs.
func numericFixed(n pgtype.Numeric, places int) string {
	return strconv.FormatFloat(numericFloat(n), 'f', places, 64)
}
