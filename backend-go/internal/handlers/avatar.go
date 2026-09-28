// Avatar upload/remove - App\Http\Controllers\Api\ProfileController::updateAvatar
// and removeAvatar. The first Go handlers that WRITE to object storage (R2 via
// the storage package); everything before this only read media back.
//
// Laravel's rule is `image|max:5120|mimes:jpeg,png,webp`: at most 5 MB, and one
// of three formats. `image` and `mimes` in Laravel check the file's real MIME
// (from its bytes), not the client's Content-Type header or the filename - so we
// sniff the bytes here too, which is also the only honest way to reject a
// renamed .exe.
package handlers

import (
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

// max:5120 is kilobytes in Laravel, i.e. 5 MB.
const avatarMaxBytes = 5120 * 1024

// The `mimes:jpeg,png,webp` set, mapped to the extension Laravel would derive
// and the sniffed MIME we accept for it. jpg is folded to jpeg, as Laravel's
// mimes rule does.
var avatarFormats = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

/* ── POST /profile/avatar ───────────────────────────────────────────── */

func (h *ProfileHandler) UpdateAvatar(c *fiber.Ctx) error {
	if h.storage == nil || !h.storage.Configured() {
		return storageUnavailable(c)
	}
	ctx := c.Context()
	userID := auth.UserID(c)

	fileHeader, err := c.FormFile("avatar")
	if err != nil {
		return validationError(c, "avatar", "The avatar field is required.")
	}
	// max:5120 - checked before reading the whole thing into memory.
	if fileHeader.Size > avatarMaxBytes {
		return validationError(c, "avatar", "The avatar field must not be greater than 5120 kilobytes.")
	}

	data, err := readMultipart(fileHeader)
	if err != nil {
		return serverError(c)
	}

	// image + mimes: decide from the bytes, not the filename or the sent header.
	// Both rules run, so their messages compound the way Laravel's do: the
	// `image` message only when it is not an image at all, the `mimes` message
	// always. A GIF (an image, wrong format) therefore gets one message; a text
	// file gets two - matching $validator->errors() exactly.
	detected := http.DetectContentType(data)
	ext, ok := avatarFormats[detected]
	if !ok {
		msgs := make([]string, 0, 2)
		if !strings.HasPrefix(detected, "image/") {
			msgs = append(msgs, "The avatar field must be an image.")
		}
		msgs = append(msgs, "The avatar field must be a file of type: jpeg, png, webp.")
		return validationErrors(c, map[string][]string{"avatar": msgs})
	}
	contentType := sniffContentType(data)

	// Delete the object this one replaces (best-effort, exactly as Laravel: a
	// failed cleanup must not fail the upload the user is watching).
	if old, err := h.queries.GetUserAvatar(ctx, userID); err == nil && old.Valid && old.String != "" {
		_ = h.storage.Delete(ctx, old.String)
	}

	key, err := h.storage.StoreImage(ctx, data, "avatars", ext, contentType)
	if err != nil {
		return storageUnavailable(c)
	}

	if err := h.queries.UpdateUserAvatar(ctx, sqlc.UpdateUserAvatarParams{
		ID:     userID,
		Avatar: pgtype.Text{String: key, Valid: true},
	}); err != nil {
		return serverError(c)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Avatar updated.",
		"data":    fiber.Map{"avatar_url": mediaJoin(h.mediaBaseURL, key)},
	})
}

/* ── DELETE /profile/avatar ─────────────────────────────────────────── */

func (h *ProfileHandler) RemoveAvatar(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	// removeAvatar is a no-op when there is nothing to remove - and it still
	// returns 200, so the client's "removed" state is idempotent.
	if old, err := h.queries.GetUserAvatar(ctx, userID); err == nil && old.Valid && old.String != "" {
		if h.storage != nil && h.storage.Configured() {
			_ = h.storage.Delete(ctx, old.String)
		}
		if err := h.queries.UpdateUserAvatar(ctx, sqlc.UpdateUserAvatarParams{
			ID:     userID,
			Avatar: pgtype.Text{}, // NULL
		}); err != nil {
			return serverError(c)
		}
	}

	return c.JSON(fiber.Map{"success": true, "message": "Avatar removed."})
}

/* ── helpers ────────────────────────────────────────────────────────── */

func readMultipart(fh *multipart.FileHeader) ([]byte, error) {
	f, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	// The size was already gate-checked; cap the read anyway so a lying
	// Content-Length can't make us allocate past the limit.
	return io.ReadAll(io.LimitReader(f, avatarMaxBytes+1))
}

// sniffContentType returns the MIME to store the object under. http.DetectContentType
// gives e.g. "image/png" or "image/jpeg"; webp it reports as the RIFF container,
// so restore the real type from our own detection.
func sniffContentType(data []byte) string {
	ct := http.DetectContentType(data)
	if ext, ok := avatarFormats[ct]; ok && ext == "webp" {
		return "image/webp"
	}
	// DetectContentType does not recognise WEBP; catch it by its RIFF/WEBP magic.
	if len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	return ct
}

// storageUnavailable is the clean 503 for "R2 is not configured / unreachable",
// distinct from a 500: the request was fine, the media backend was not.
func storageUnavailable(c *fiber.Ctx) error {
	return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
		"success": false,
		"message": "Media storage is unavailable.",
	})
}
