// Social links: GET /profile/social-links and PUT /profile/social-links, from
// App\Http\Controllers\Api\ProfileController (socialLinks/updateSocialLinks).
//
// Both return the raw SocialLink models rather than a mapped resource, so the
// payload is every column, with Eloquent's own date format (see toEloquentJSON).
// The profile/user resources map the same relation down to {platform, url} -
// that path keeps using GetUserSocialLinks.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

var socialLinkPlatforms = []string{"instagram", "twitter", "youtube", "tiktok", "facebook", "website", "other"}

// socialLinkURLPattern is the controller's own rule, not the generic 'url' one:
//
//	regex:/^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i
//
// Deliberately narrower than laravelIsURL - http(s) only, a real domain with a
// TLD, and it allows '@' in the path for YouTube/TikTok handles.
var socialLinkURLPattern = regexp.MustCompile(`(?i)^https?://([a-z0-9-]+\.)+[a-z]{2,}(/.*)?$`)

/* ── GET /profile/social-links ──────────────────────────────────────── */

func (h *ProfileHandler) SocialLinks(c *fiber.Ctx) error {
	links, err := h.queries.ListSocialLinks(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": renderSocialLinks(links)})
}

/* ── PUT /profile/social-links ──────────────────────────────────────── */

func (h *ProfileHandler) UpdateSocialLinks(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	// Decoded plainly rather than through parseJSONBody: this payload is a
	// nested array, and 'present' only asks whether the key is there.
	var body map[string]any
	if len(c.Body()) > 0 {
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return validationError(c, "links", "The links field must be present.")
		}
	}

	links, perr := parseSocialLinks(body)
	if perr != nil {
		return perr.send(c)
	}

	if err := h.replaceSocialLinks(ctx, userID, links); err != nil {
		return serverError(c)
	}

	fresh, err := h.queries.ListSocialLinks(ctx, userID) // $user->socialLinks()->get()
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{
		"success": true,
		"message": "Social links updated.",
		"data":    renderSocialLinks(fresh),
	})
}

type socialLinkInput struct {
	platform string
	url      string
}

// parseSocialLinks is the validate() block. 'links' is 'present|array|max:20',
// and each row's platform/url carry their own rules; every row is checked
// before returning, so links.0 and links.3 report together.
func parseSocialLinks(body map[string]any) ([]socialLinkInput, *prefError) {
	raw, ok := body["links"]
	if !ok {
		return nil, fieldFailure("links", "The links field must be present.")
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, fieldFailure("links", "The links field must be an array.")
	}
	if len(items) > 20 {
		return nil, fieldFailure("links", "The links field must not have more than 20 items.")
	}

	out := make([]socialLinkInput, 0, len(items))
	failures := map[string][]string{}
	for i, item := range items {
		row, _ := item.(map[string]any)
		platform, purl := "", ""

		switch v, present := row["platform"]; {
		case !present || v == nil || v == "":
			failures[fmt.Sprintf("links.%d.platform", i)] = []string{fmt.Sprintf("The links.%d.platform field is required.", i)}
		default:
			s, isString := v.(string)
			switch {
			case !isString:
				failures[fmt.Sprintf("links.%d.platform", i)] = []string{fmt.Sprintf("The links.%d.platform field must be a string.", i)}
			case !contains(socialLinkPlatforms, s):
				failures[fmt.Sprintf("links.%d.platform", i)] = []string{fmt.Sprintf("The selected links.%d.platform is invalid.", i)}
			default:
				platform = s
			}
		}

		switch v, present := row["url"]; {
		case !present || v == nil || v == "":
			failures[fmt.Sprintf("links.%d.url", i)] = []string{fmt.Sprintf("The links.%d.url field is required.", i)}
		default:
			s, isString := v.(string)
			switch {
			case !isString:
				failures[fmt.Sprintf("links.%d.url", i)] = []string{fmt.Sprintf("The links.%d.url field must be a string.", i)}
			case len(s) > 500:
				failures[fmt.Sprintf("links.%d.url", i)] = []string{fmt.Sprintf("The links.%d.url field must not be greater than 500 characters.", i)}
			case !socialLinkURLPattern.MatchString(s):
				// the controller's custom regex message
				failures[fmt.Sprintf("links.%d.url", i)] = []string{"Each social link must be a valid URL (e.g. https://example.com/yourname)."}
			default:
				purl = s
			}
		}

		out = append(out, socialLinkInput{platform: platform, url: purl})
	}
	if len(failures) > 0 {
		return nil, &prefError{errors: failures}
	}
	return out, nil
}

// replaceSocialLinks is the controller's sync: delete every row, then insert
// the payload (an empty array therefore clears them).
//
// DIVERGENCE, deliberate: Laravel runs the delete and the insert unwrapped, so
// a failing insert leaves the user with NO links - and one is reachable, since
// social_links has a UNIQUE(user_id, platform) that the validation does not
// enforce, so posting the same platform twice deletes everything and then 500s.
// Doing both in a transaction keeps the failure atomic. Every successful
// request is byte-identical either way; only Laravel's data loss is not
// reproduced.
func (h *ProfileHandler) replaceSocialLinks(ctx context.Context, userID int64, links []socialLinkInput) error {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op once committed

	q := h.queries.WithTx(tx)
	if err := q.DeleteSocialLinks(ctx, userID); err != nil {
		return err
	}

	// One timestamp for the whole batch, as Laravel's single $now is.
	now := pgtype.Timestamp{Time: time.Now().UTC(), Valid: true}
	for _, l := range links {
		if err := q.InsertSocialLink(ctx, sqlc.InsertSocialLinkParams{
			UserID:    userID,
			Platform:  l.platform,
			Url:       l.url,
			CreatedAt: now,
		}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func renderSocialLinks(links []sqlc.SocialLink) []fiber.Map {
	out := make([]fiber.Map, 0, len(links))
	for _, l := range links {
		out = append(out, fiber.Map{
			"id":         l.ID,
			"user_id":    l.UserID,
			"platform":   l.Platform,
			"url":        l.Url,
			"sort_order": l.SortOrder,
			"created_at": toEloquentJSON(l.CreatedAt),
			"updated_at": toEloquentJSON(l.UpdatedAt),
		})
	}
	return out
}

// toEloquentJSON is how a Model serialises a date: Model::serializeDate() hands
// the Carbon instance to toJSON(), i.e. toISOString() - UTC, six decimals, "Z"
// (2026-07-17T10:46:48.000000Z).
//
// This is NOT toIso8601 (which renders +00:00). That one mirrors the explicit
// ->toIso8601String() calls in the hand-written resources; this one is for
// payloads that hand back a raw model, where Eloquent picks the format.
func toEloquentJSON(t pgtype.Timestamp) any {
	if !t.Valid {
		return nil
	}
	return t.Time.UTC().Format("2006-01-02T15:04:05.000000") + "Z"
}

// notFound is bootstrap/app.php's NotFoundHttpException renderer, which also
// catches the ModelNotFoundException that findOrFail() throws.
func notFound(c *fiber.Ctx) error {
	return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
		"success": false,
		"message": "Resource not found.",
	})
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
