// Story creation: StoryController::store - the last write in the story domain.
//
// Multipart, exactly like the app sends it: media[] files plus the flat fields,
// plus `layers` as a JSON *string* (not repeated form fields - the Laravel
// controller json_decodes one blob, and the mobile client already posts it that
// way).
//
// Ported exactly: the validation set (caption 200, the visibility/status enums,
// the mime allow-list, 10 files, 200 MB each), draft vs published semantics
// (published expires in 24h, a draft never expires), per-file image/video typing
// from the sniffed content type, order_index following the upload order, and the
// layer field mapping including Laravel's substr() truncations and its defaults
// for absent x/y/scale/rotation/colour/font.
//
// Two deliberate divergences, both harmless:
//   - Object keys. Laravel's $file->store() produces stories/{userId}/{hash}.ext;
//     internal/storage's buildKey produces stories/{userId}/YYYY/MM/{uuid}.ext.
//     The key is opaque - it is stored in media_url and handed straight back to
//     the signer - so the layout differs but nothing reads meaning from it.
//   - z_index defaults to the layer's array position when absent, which is what
//     Laravel's `$layer['zIndex'] ?? $idx` does.
//
// NOT ported: dispatchMentionNotifications. Laravel still owns notifications
// across every ported domain, and a mention notification is not data the story
// itself depends on.
package handlers

import (
	"encoding/json"
	"io"
	"mime/multipart"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

const (
	storyMaxFiles     = 10
	storyMaxFileBytes = 204800 * 1024 // Laravel's max:204800 is KILOBYTES -> 200 MB
	storyCaptionMax   = 200
	storyLinkMax      = 500
	storyLocationMax  = 255
)

// storyMediaFormats is the `mimes:` allow-list, mapped to the extension Laravel
// would derive. Sniffed from content, never trusted from the filename - an
// attacker-supplied name must not decide what gets written to storage.
var storyMediaFormats = map[string]struct {
	ext  string
	kind string
}{
	"image/jpeg":      {"jpg", "image"},
	"image/png":       {"png", "image"},
	"image/webp":      {"webp", "image"},
	"image/gif":       {"gif", "image"},
	"image/heic":      {"heic", "image"},
	"image/heif":      {"heif", "image"},
	"image/avif":      {"avif", "image"},
	"video/mp4":       {"mp4", "video"},
	"video/quicktime": {"mov", "video"},
	"video/webm":      {"webm", "video"},
}

var storyVisibilities = map[string]bool{"everyone": true, "followers": true, "close_friends": true, "only_me": true}

// incomingLayer is the wire shape the composer posts - camelCase, matching the
// keys StoryController reads out of the decoded JSON.
type incomingLayer struct {
	Type         string   `json:"type"`
	Text         *string  `json:"text"`
	URL          *string  `json:"url"`
	UserID       *int64   `json:"userId"`
	Hashtag      *string  `json:"hashtag"`
	LocationName *string  `json:"locationName"`
	SlideIndex   *int     `json:"slideIndex"`
	X            *float64 `json:"x"`
	Y            *float64 `json:"y"`
	Scale        *float64 `json:"scale"`
	Rotation     *float64 `json:"rotation"`
	Color        *string  `json:"color"`
	Font         *string  `json:"font"`
	ZIndex       *int     `json:"zIndex"`
}

// Store creates a story. POST /stories
func (h *StoriesHandler) Store(c *fiber.Ctx) error {
	userID := auth.UserID(c)
	ctx := c.Context()

	form, err := c.MultipartForm()
	if err != nil {
		return storyValidationError(c, "media", "The media field must be an array.")
	}

	/* ── Flat fields ─────────────────────────────────────────────────── */
	caption := strings.TrimSpace(formValue(form, "caption"))
	if len([]rune(caption)) > storyCaptionMax {
		return storyValidationError(c, "caption", "The caption may not be greater than 200 characters.")
	}

	visibility := formValue(form, "visibility")
	if visibility == "" {
		visibility = "everyone"
	}
	if !storyVisibilities[visibility] {
		return storyValidationError(c, "visibility", "The selected visibility is invalid.")
	}

	status := formValue(form, "status")
	if status == "" {
		status = "published"
	}
	if status != "draft" && status != "published" {
		return storyValidationError(c, "status", "The selected status is invalid.")
	}

	link := strings.TrimSpace(formValue(form, "link"))
	if link != "" {
		// Laravel's `url` rule: must parse AND have a scheme + host.
		u, perr := url.ParseRequestURI(link)
		if perr != nil || u.Scheme == "" || u.Host == "" || len(link) > storyLinkMax {
			return storyValidationError(c, "link", "The link format is invalid.")
		}
	}
	location := truncate(strings.TrimSpace(formValue(form, "location")), storyLocationMax)

	/* ── Media ───────────────────────────────────────────────────────── */
	files := form.File["media[]"]
	if len(files) == 0 {
		files = form.File["media"]
	}
	if len(files) > storyMaxFiles {
		return storyValidationError(c, "media", "The media may not have more than 10 items.")
	}

	// Every file is read and type-checked BEFORE anything is written, so a
	// rejected third file can't leave the first two orphaned in the bucket.
	type pending struct {
		data        []byte
		ext, kind   string
		contentType string
	}
	uploads := make([]pending, 0, len(files))
	for _, fh := range files {
		if fh.Size > storyMaxFileBytes {
			return storyValidationError(c, "media", "The media may not be greater than 200MB.")
		}
		data, rerr := readUpload(fh, storyMaxFileBytes)
		if rerr != nil {
			return serverError(c)
		}
		ct := sniffContentType(data)
		spec, ok := storyMediaFormats[ct]
		if !ok {
			return storyValidationError(c, "media", "The media must be a file of type: jpg, jpeg, png, webp, gif, mp4, mov, webm, heic, heif, avif.")
		}
		uploads = append(uploads, pending{data: data, ext: spec.ext, kind: spec.kind, contentType: ct})
	}

	// Checked AFTER the mime loop, deliberately. `media` is NULLABLE in Laravel's
	// rules, so a layers-only story never touches object storage at all - and an
	// INVALID file must still fail validation (422) rather than being masked by a
	// 500 about the bucket. Laravel validates first and only then writes; this
	// keeps the same order.
	if len(uploads) > 0 && !h.storage.Configured() {
		return serverError(c)
	}

	/* ── Layers ──────────────────────────────────────────────────────── */
	var layers []incomingLayer
	if raw := formValue(form, "layers"); raw != "" {
		// Laravel does `json_decode($raw, true) ?? []` - malformed JSON is
		// silently an empty list, not a 422. Mirrored so a client that posts
		// junk layers still gets its story.
		_ = json.Unmarshal([]byte(raw), &layers)
	}

	/* ── Write ───────────────────────────────────────────────────────── */
	// One clock for the whole request, forced to UTC before it touches a
	// tz-naive timestamp column (see the timezone note in the migration log).
	now := time.Now().UTC()
	expires := pgtype.Timestamp{}
	if status == "published" {
		expires = pgtype.Timestamp{Time: now.Add(24 * time.Hour), Valid: true}
	}

	story, err := h.queries.InsertStory(ctx, sqlc.InsertStoryParams{
		UserID:         userID,
		Caption:        nullText(caption),
		Visibility:     visibility,
		AllowReplies:   formBool(form, "allow_replies", true),
		AllowResharing: formBool(form, "allow_resharing", true),
		SaveToArchive:  formBool(form, "save_to_archive", true),
		Status:         status,
		Location:       nullText(location),
		Link:           nullText(link),
		ExpiresAt:      expires,
	})
	if err != nil {
		return serverError(c)
	}

	dir := "stories/" + strconv.FormatInt(userID, 10)
	for i, up := range uploads {
		key, uerr := h.storage.StoreImage(ctx, up.data, dir, up.ext, up.contentType)
		if uerr != nil {
			return serverError(c)
		}
		if err := h.queries.InsertStoryMedia(ctx, sqlc.InsertStoryMediaParams{
			StoryID:    story.ID,
			MediaType:  up.kind,
			MediaUrl:   pgtype.Text{String: key, Valid: true},
			OrderIndex: int16(i),
		}); err != nil {
			return serverError(c)
		}
	}

	for idx, l := range layers {
		if err := h.queries.InsertStoryLayer(ctx, buildLayerParams(story.ID, idx, l)); err != nil {
			return serverError(c)
		}
	}

	/* ── Response ────────────────────────────────────────────────────── */
	media, layerRows, err := h.mediaAndLayers(ctx, []int64{story.ID})
	if err != nil {
		return serverError(c)
	}
	msg := "Story published successfully."
	if status == "draft" {
		msg = "Story saved as draft."
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"data":    h.formatStory(sqlc.Story(story), media[story.ID], layerRows[story.ID]),
		"message": msg,
	})
}

// buildLayerParams applies Laravel's defaults and substr() truncations.
func buildLayerParams(storyID int64, idx int, l incomingLayer) sqlc.InsertStoryLayerParams {
	p := sqlc.InsertStoryLayerParams{
		StoryID:    storyID,
		SlideIndex: int16(deref(l.SlideIndex, 0)),
		Type:       truncate(orDefault(l.Type, "text"), 20),
		Text:       nullText(derefStr(l.Text)),
		Hashtag:    nullText(truncate(derefStr(l.Hashtag), 200)),
		XPercent:   numeric(deref(l.X, 50)),
		YPercent:   numeric(deref(l.Y, 50)),
		ScaleValue: numeric(deref(l.Scale, 1)),
		Rotation:   numeric(deref(l.Rotation, 0)),
		Color:      truncate(orDefault(derefStr(l.Color), "#ffffff"), 20),
		Font:       truncate(orDefault(derefStr(l.Font), "classic"), 30),
		ZIndex:     int16(deref(l.ZIndex, idx)),
	}
	if l.URL != nil && *l.URL != "" {
		p.Url = pgtype.Text{String: truncate(*l.URL, 500), Valid: true}
	}
	if l.LocationName != nil && *l.LocationName != "" {
		p.LocationName = pgtype.Text{String: truncate(*l.LocationName, 255), Valid: true}
	}
	if l.UserID != nil && *l.UserID > 0 {
		p.MentionedUserID = pgtype.Int8{Int64: *l.UserID, Valid: true}
	}
	return p
}

/* ── small helpers ──────────────────────────────────────────────────── */

func formValue(f *multipart.Form, key string) string {
	if v := f.Value[key]; len(v) > 0 {
		return v[0]
	}
	return ""
}

// formBool mirrors Laravel's $request->boolean(): "1"/"true"/"on"/"yes" are
// true, anything else present is false, and absent falls back to the default.
func formBool(f *multipart.Form, key string, def bool) bool {
	v := formValue(f, key)
	if v == "" {
		return def
	}
	switch strings.ToLower(v) {
	case "1", "true", "on", "yes":
		return true
	default:
		return false
	}
}

// readUpload is avatar.go's readMultipart with a caller-supplied ceiling - a
// story video is 40x the avatar limit.
func readUpload(fh *multipart.FileHeader, limit int64) ([]byte, error) {
	f, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, limit+1))
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func orDefault(s, def string) string {
	if strings.TrimSpace(s) == "" {
		return def
	}
	return s
}

func deref[T any](p *T, def T) T {
	if p == nil {
		return def
	}
	return *p
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func nullText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func storyValidationError(c *fiber.Ctx, field, msg string) error {
	return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
		"success": false,
		"message": msg,
		"errors":  fiber.Map{field: []string{msg}},
	})
}

// numeric builds the pgtype.Numeric the decimal(x,2) layer columns want. Going
// through the text scanner keeps the value exact at 2 decimal places instead of
// relying on a float round-trip.
func numeric(f float64) pgtype.Numeric {
	var n pgtype.Numeric
	if err := n.Scan(strconv.FormatFloat(f, 'f', 2, 64)); err != nil {
		_ = n.Scan("0.00")
	}
	return n
}

// storyReportReasons is Laravel's `in:` list for report().
var storyReportReasons = map[string]bool{
	"spam": true, "inappropriate": true, "violence": true,
	"hate_speech": true, "misinformation": true, "other": true,
}

// FromVideo publishes an existing video as a story. POST /stories/from-video
//
// The video is REFERENCED, not re-uploaded: story_media carries
// source_type='shared_video' plus the video's own object key, which is what the
// read surface keys off to sign the URL through the videos path.
//
// The consent check is the load-bearing part. `videos.allow_sharing` existed the
// whole time and this endpoint never read it, so any published video could be
// pushed into a stranger's story regardless of what its creator had set. Owners
// are exempt - the flag is about other people resharing, not the creator's own
// reach. Private/unlisted videos need no separate test: status must be
// 'published', and that is the only visibility column videos has.
func (h *StoriesHandler) FromVideo(c *fiber.Ctx) error {
	userID := auth.UserID(c)
	ctx := c.Context()

	// Accepts JSON or form-encoded, since this endpoint carries no files.
	var body struct {
		VideoID        int64   `json:"video_id" form:"video_id"`
		Visibility     string  `json:"visibility" form:"visibility"`
		AllowReplies   *bool   `json:"allow_replies" form:"allow_replies"`
		AllowResharing *bool   `json:"allow_resharing" form:"allow_resharing"`
		SaveToArchive  *bool   `json:"save_to_archive" form:"save_to_archive"`
		Layers         *string `json:"layers" form:"layers"`
	}
	if err := c.BodyParser(&body); err != nil || body.VideoID <= 0 {
		return storyValidationError(c, "video_id", "The video id field is required.")
	}
	visibility := body.Visibility
	if visibility == "" {
		visibility = "everyone"
	}
	if !storyVisibilities[visibility] {
		return storyValidationError(c, "visibility", "The selected visibility is invalid.")
	}

	video, err := h.queries.GetVideoForStoryShare(ctx, body.VideoID)
	if err != nil {
		// Laravel's `exists:videos,id` rule fails validation, not findOrFail.
		return storyValidationError(c, "video_id", "The selected video id is invalid.")
	}
	if video.Status != "published" {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false,
			"message": "This video is not ready to share to story.",
		})
	}
	if video.UserID != userID && !video.AllowSharing {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": "This creator has turned off sharing for this video.",
		})
	}

	// Always published with a 24h life - fromVideo has no draft path.
	story, err := h.queries.InsertStory(ctx, sqlc.InsertStoryParams{
		UserID:         userID,
		Visibility:     visibility,
		AllowReplies:   derefBool(body.AllowReplies, true),
		AllowResharing: derefBool(body.AllowResharing, true),
		SaveToArchive:  derefBool(body.SaveToArchive, true),
		Status:         "published",
		ExpiresAt:      pgtype.Timestamp{Time: time.Now().UTC().Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		return serverError(c)
	}

	var duration pgtype.Int2
	if video.Duration.Valid && video.Duration.Int16 > 0 {
		duration = video.Duration
	}
	if err := h.queries.InsertSharedVideoStoryMedia(ctx, sqlc.InsertSharedVideoStoryMediaParams{
		StoryID:         story.ID,
		SharedVideoID:   pgtype.Int8{Int64: video.ID, Valid: true},
		MediaUrl:        pgtype.Text{String: video.VideoUrl, Valid: true},
		ThumbnailUrl:    video.ThumbnailUrl,
		DurationSeconds: duration,
	}); err != nil {
		return serverError(c)
	}

	if body.Layers != nil && *body.Layers != "" {
		var layers []incomingLayer
		_ = json.Unmarshal([]byte(*body.Layers), &layers)
		for idx, l := range layers {
			if err := h.queries.InsertStoryLayer(ctx, buildLayerParams(story.ID, idx, l)); err != nil {
				return serverError(c)
			}
		}
	}

	// "Quietly track as a share" - Laravel wraps this in try/catch and ignores
	// failures, so a counter problem must not fail a story that already exists.
	_ = h.queries.IncrementVideoShares(ctx, video.ID)

	media, layerRows, err := h.mediaAndLayers(ctx, []int64{story.ID})
	if err != nil {
		return serverError(c)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"data":    h.formatStory(sqlc.Story(story), media[story.ID], layerRows[story.ID]),
		"message": "Story published successfully.",
	})
}

// Report files a report against a story. POST /stories/:id/report
func (h *StoriesHandler) Report(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}

	var body struct {
		Reason string `json:"reason" form:"reason"`
	}
	if err := c.BodyParser(&body); err != nil || !storyReportReasons[body.Reason] {
		return storyValidationError(c, "reason", "The selected reason is invalid.")
	}

	// Deliberately NOT the liveStory() gate: Laravel scopes report() to
	// status='published' only, with no expiry test and no canViewStory call - an
	// expired story can still be reported, and reporting is not a read.
	if _, err := h.queries.GetPublishedStoryForReport(c.Context(), storyID); err != nil {
		return notFound(c)
	}

	if err := h.queries.UpsertStoryReport(c.Context(), sqlc.UpsertStoryReportParams{
		StoryID:    storyID,
		ReporterID: auth.UserID(c),
		Reason:     body.Reason,
	}); err != nil {
		return serverError(c)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Story reported. We will review it shortly.",
	})
}

func derefBool(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}
