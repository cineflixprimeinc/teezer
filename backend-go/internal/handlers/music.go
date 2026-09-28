// Music mirrors MusicLibraryController:
//
//	GET  /music/library        → Library        (studio browser, filtered + paged)
//	GET  /music/picker         → Picker         (upload-modal picker)
//	GET  /music/trending       → Trending       (top 10 by all-time plays)
//	GET  /music/weekly-popular → WeeklyPopular  (top N by plays in last 7 days)
//	POST /music/:id/play       → Play           (counter + play log)
//	POST /music/:id/use        → Use            (counter + usage log)
//
// NOT ported, deliberately:
//
//   - GET /music/{id} (show). It signs original-audio URLs through
//     MediaPresignService, whose scheme has to match nginx's secure_link_md5
//     byte-for-byte - the PHP comment records that a hand-rolled signer here
//     already caused silent 403s on every original track. Porting it means
//     proving that parity first, which is its own piece of work.
//   - GET /music/{id}/videos. Needs VideoResource plus attachViewerFlags
//     (liked/saved/followed per row for the caller); that belongs with the
//     videos group, not smuggled in behind music.
//
// Play and Use are writes, but only counter increments plus an append-only log
// - the same shape as saves.go - so they carry no money, no notification and no
// realtime publish.
package handlers

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

type MusicHandler struct {
	queries      *sqlc.Queries
	mediaBaseURL string
}

func NewMusicHandler(q *sqlc.Queries, mediaBaseURL string) *MusicHandler {
	return &MusicHandler{queries: q, mediaBaseURL: mediaBaseURL}
}

// genreForCategory mirrors the PHP $genreMap. A category not in the map is not
// a genre filter at all - the caller then treats it as a mood.
var genreForCategory = map[string]string{
	"hip_hop":    "Hip-hop",
	"electronic": "Electronic",
	"rock":       "Rock",
	"jazz":       "Jazz",
	"rnb":        "R&B",
	"classical":  "Classical",
	"indie":      "Indie",
	"nepali":     "Nepali",
	"pop":        "Pop",
}

// paging matches Laravel's paginate(): ?page=1 based, clamped so a hostile
// ?page=-5 cannot produce a negative OFFSET.
func paging(c *fiber.Ctx, perPage int32) (limit, offset int32, page int32) {
	page = 1
	if p, err := strconv.Atoi(c.Query("page", "1")); err == nil && p > 1 {
		page = int32(p)
	}
	return perPage, (page - 1) * perPage, page
}

// paginatorMeta is the subset of Laravel's paginator payload the clients read.
func paginatorMeta(total int64, perPage, page int32) fiber.Map {
	last := int32(1)
	if perPage > 0 {
		last = int32((total + int64(perPage) - 1) / int64(perPage))
		if last < 1 {
			last = 1
		}
	}
	return fiber.Map{
		"current_page": page,
		"last_page":    last,
		"per_page":     perPage,
		"total":        total,
	}
}

func (h *MusicHandler) trackJSON(
	id int64, title string, artist, album, cover, audio pgtype.Text,
	duration pgtype.Int4, plays, uses int64,
	genre, mood, language, license pgtype.Text,
	featured, recommended bool, sourceType, status string,
) fiber.Map {
	return fiber.Map{
		"id":           id,
		"title":        title,
		"artist_name":  nullableText(artist),
		"album":        nullableText(album),
		"cover_url":    mediaOrNil(h.mediaBaseURL, cover),
		"audio_url":    mediaOrNil(h.mediaBaseURL, audio),
		"duration":     nullableInt4(duration),
		"plays_count":  plays,
		"uses_count":   uses,
		"genre":        nullableText(genre),
		"mood":         nullableText(mood),
		"language":     nullableText(language),
		"license_type": nullableText(license),
		"featured":     featured,
		"recommended":  recommended,
		"source_type":  sourceType,
		"status":       status,
	}
}

func (h *MusicHandler) Library(c *fiber.Ctx) error {
	ctx := c.Context()
	limit, offset, page := paging(c, 20)

	category := strings.TrimSpace(c.Query("category", "all"))
	genreExact, moodExact := "", ""
	onlyFeatured, onlyRecommended, onlyTeezer, onlyArtist := false, false, false, false
	orderByPlays := false

	switch {
	case category == "trending":
		orderByPlays = true
	case category == "featured":
		onlyFeatured = true
	case category == "recommended":
		onlyRecommended = true
	case category == "teezer_originals":
		onlyTeezer = true
	case category == "artist_originals":
		onlyArtist = true
	case genreForCategory[category] != "":
		genreExact = genreForCategory[category]
	case category != "" && category != "all":
		// PHP does ucfirst($category) and matches it as a mood.
		moodExact = ucfirst(category)
	}

	args := sqlc.ListMusicLibraryParams{
		Limit:           limit,
		Offset:          offset,
		Search:          strings.TrimSpace(c.Query("search")),
		Mood:            c.Query("mood"),
		Genre:           c.Query("genre"),
		Language:        c.Query("language"),
		UsageRights:     c.Query("usage_rights"),
		DurationBucket:  c.Query("duration"),
		OnlyFeatured:    onlyFeatured,
		OnlyRecommended: onlyRecommended,
		OnlyTeezer:      onlyTeezer,
		OnlyArtist:      onlyArtist,
		GenreExact:      genreExact,
		MoodExact:       moodExact,
		OrderByPlays:    orderByPlays,
	}

	rows, err := h.queries.ListMusicLibrary(ctx, args)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	total, err := h.queries.CountMusicLibrary(ctx, sqlc.CountMusicLibraryParams{
		Search: args.Search, Mood: args.Mood, Genre: args.Genre, Language: args.Language,
		UsageRights: args.UsageRights, DurationBucket: args.DurationBucket,
		OnlyFeatured: onlyFeatured, OnlyRecommended: onlyRecommended,
		OnlyTeezer: onlyTeezer, OnlyArtist: onlyArtist,
		GenreExact: genreExact, MoodExact: moodExact,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	out := make([]fiber.Map, 0, len(rows))
	for _, t := range rows {
		out = append(out, h.trackJSON(t.ID, t.Title, t.ArtistName, t.Album, t.CoverUrl, t.AudioUrl,
			t.Duration, t.PlaysCount, t.UsesCount, t.Genre, t.Mood, t.Language, t.LicenseType,
			t.Featured, t.Recommended, t.SourceType, t.Status))
	}

	m := paginatorMeta(total, limit, page)
	m["data"] = out
	return c.JSON(fiber.Map{"success": true, "data": m})
}

func (h *MusicHandler) Picker(c *fiber.Ctx) error {
	ctx := c.Context()
	limit, offset, page := paging(c, 20)

	typ := c.Query("type")
	args := sqlc.ListMusicPickerParams{
		Limit:       limit,
		Offset:      offset,
		Search:      strings.TrimSpace(c.Query("search")),
		Mood:        c.Query("mood"),
		Genre:       c.Query("genre"),
		OnlyReels:   typ == "reels",
		OnlyStories: typ == "stories",
	}

	rows, err := h.queries.ListMusicPicker(ctx, args)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	total, err := h.queries.CountMusicPicker(ctx, sqlc.CountMusicPickerParams{
		Search: args.Search, Mood: args.Mood, Genre: args.Genre,
		OnlyReels: args.OnlyReels, OnlyStories: args.OnlyStories,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	out := make([]fiber.Map, 0, len(rows))
	for _, t := range rows {
		out = append(out, h.trackJSON(t.ID, t.Title, t.ArtistName, t.Album, t.CoverUrl, t.AudioUrl,
			t.Duration, t.PlaysCount, t.UsesCount, t.Genre, t.Mood, t.Language, t.LicenseType,
			t.Featured, t.Recommended, t.SourceType, t.Status))
	}

	m := paginatorMeta(total, limit, page)
	m["data"] = out
	return c.JSON(fiber.Map{"success": true, "data": m})
}

func (h *MusicHandler) Trending(c *fiber.Ctx) error {
	rows, err := h.queries.ListTrendingMusic(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	out := make([]fiber.Map, 0, len(rows))
	for _, t := range rows {
		out = append(out, h.trackJSON(t.ID, t.Title, t.ArtistName, t.Album, t.CoverUrl, t.AudioUrl,
			t.Duration, t.PlaysCount, t.UsesCount, t.Genre, t.Mood, t.Language, t.LicenseType,
			t.Featured, t.Recommended, t.SourceType, t.Status))
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

func (h *MusicHandler) WeeklyPopular(c *fiber.Ctx) error {
	ctx := c.Context()

	// min($limit, 20) with a floor of 1 - PHP's min() alone would happily
	// accept ?limit=0 and return an empty list.
	limit := int32(5)
	if n, err := strconv.Atoi(c.Query("limit", "5")); err == nil {
		if n > 20 {
			n = 20
		}
		if n < 1 {
			n = 1
		}
		limit = int32(n)
	}

	rows, err := h.queries.ListWeeklyPopularMusic(ctx, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	out := make([]fiber.Map, 0, limit)
	for _, t := range rows {
		out = append(out, fiber.Map{
			"id":          t.ID,
			"title":       t.Title,
			"artist_name": nullableText(t.ArtistName),
			"cover_url":   mediaOrNil(h.mediaBaseURL, t.CoverUrl),
			"audio_url":   mediaOrNil(h.mediaBaseURL, t.AudioUrl),
			"plays_count": t.PlaysCount,
			"duration":    nullableInt4(t.Duration),
			"week_plays":  t.WeekPlays,
		})
	}

	// No play logged in the window is normal on a quiet week, so fall back to
	// all-time rather than returning an empty chart. Same branch as the PHP.
	if len(out) == 0 {
		fb, err := h.queries.ListPopularMusicFallback(ctx, limit)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		for _, t := range fb {
			out = append(out, fiber.Map{
				"id":          t.ID,
				"title":       t.Title,
				"artist_name": nullableText(t.ArtistName),
				"cover_url":   mediaOrNil(h.mediaBaseURL, t.CoverUrl),
				"audio_url":   mediaOrNil(h.mediaBaseURL, t.AudioUrl),
				"plays_count": t.PlaysCount,
				"duration":    nullableInt4(t.Duration),
			})
		}
	}

	return c.JSON(fiber.Map{"success": true, "data": out})
}

func (h *MusicHandler) Play(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()

	// findOrFail equivalent: a play against a track that does not exist is a
	// 404, not a silently swallowed no-op.
	if _, err := h.queries.MusicTrackExists(ctx, id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Not found."})
	}

	var body struct {
		Source string `json:"source"`
	}
	_ = c.BodyParser(&body)
	source := body.Source
	if source == "" {
		source = "studio" // PHP default
	}

	if err := h.queries.IncrementMusicPlays(ctx, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	// The log is analytics; losing a row must not fail a play the counter has
	// already recorded.
	_ = h.queries.InsertMusicPlayLog(ctx, sqlc.InsertMusicPlayLogParams{
		TrackID: id,
		UserID:  nullableUser(auth.UserID(c)),
		Source:  pgtype.Text{String: source, Valid: true},
	})

	return c.JSON(fiber.Map{"success": true})
}

func (h *MusicHandler) Use(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()

	if _, err := h.queries.MusicTrackExists(ctx, id); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Not found."})
	}

	var body struct {
		ContentID   *int64  `json:"content_id"`
		ContentType *string `json:"content_type"`
	}
	_ = c.BodyParser(&body)

	// Mirrors the PHP 'in:reel,video,story,photo' rule.
	if body.ContentType != nil {
		switch *body.ContentType {
		case "reel", "video", "story", "photo", "":
		default:
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"success": false,
				"message": "The selected content type is invalid.",
			})
		}
	}

	if err := h.queries.IncrementMusicUses(ctx, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	_ = h.queries.InsertMusicUsage(ctx, sqlc.InsertMusicUsageParams{
		TrackID:     id,
		UserID:      nullableUser(auth.UserID(c)),
		ContentID:   nullableInt64(body.ContentID),
		ContentType: textFromPtr(body.ContentType),
	})

	return c.JSON(fiber.Map{"success": true})
}

/* ── Small conversions ─────────────────────────────────────────────────────*/

// mediaOrNil is textOrNil plus the CDN base, so a NULL cover stays null instead
// of becoming a URL pointing at nothing.
func mediaOrNil(base string, t pgtype.Text) any {
	if !t.Valid || t.String == "" {
		return nil
	}
	return mediaJoin(base, t.String)
}

// nullableUser keeps guest plays anonymous rather than attributing them to 0.
func nullableUser(id int64) pgtype.Int8 {
	if id == 0 {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: id, Valid: true}
}

func nullableInt64(v *int64) pgtype.Int8 {
	if v == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

func textFromPtr(v *string) pgtype.Text {
	if v == nil || *v == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}

func ucfirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
