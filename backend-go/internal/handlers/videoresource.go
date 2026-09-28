// videoResource ports App\Http\Resources\VideoResource field-for-field. It is
// the shared serializer behind every video-returning endpoint (show, feed,
// trending, user videos, …), so correctness here is load-bearing.
//
// Faithful details worth noting:
//   - video_url + quality_urls are HMAC-SHA256 signed CDN URLs the Cloudflare
//     Worker validates (signedCdnURL); thumbnails/avatars/covers are plain
//     Storage::url joins.
//   - TTL is 2h for non-published (private/draft/removed) content, 24h public.
//   - whenLoaded / when() semantics: a belongsTo relation eager-loaded as NULL
//     (no audio/music track) OMITS the key entirely - Laravel's whenLoaded
//     returns MissingValue for a null relation. Collection relations
//     (hashtags, tagged_users) are always present (possibly empty).
//   - quality_urls keys: PHP coerces canonical-integer JSON keys to ints, then
//     re-derives the label from the R2 path (/quality/<label>/); non-integer
//     keys are used verbatim. Both object and array JSON shapes are handled.
package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/sqlc"
)

// videoResourceInput carries a video plus everything a caller eager-loaded for
// it. Pointers/slices left nil model an unloaded-or-null relation. The flags
// mirror the two attributes controllers set out-of-band (show()/FeedService).
type videoResourceInput struct {
	video      sqlc.GetVideoForShowRow
	authUserID int64 // 0 => guest

	user        *sqlc.GetVideoUserWithProfileRow
	hashtags    []string
	audioTrack  *sqlc.AudioTrack
	musicTrack  *sqlc.MusicTrack
	taggedUsers []sqlc.GetVideoTaggedUsersRow

	// whenLoaded gates for the two collection relations: present (possibly
	// empty) only when the caller eager-loaded them, omitted otherwise. The
	// belongsTo relations (user/audio/music) self-gate on their nil pointer.
	hashtagsLoaded    bool
	taggedUsersLoaded bool

	isLiked     bool
	isSaved     bool
	isFollowing bool

	// visible_comments_count when the caller ran withVisibleCommentsCount;
	// nil falls back to the raw comments_count column (matches the resource's
	// array_key_exists check).
	visibleCommentsCount *int64
	// watch_time_seconds when set by show(); nil omits the key.
	watchTimeSeconds *int64
}

var qualityLabelRe = regexp.MustCompile(`/quality/([^/]+)/`)
var canonicalIntRe = regexp.MustCompile(`^(0|-?[1-9][0-9]*)$`)

func renderVideoResource(in videoResourceInput, mediaBase, signingSecret string) fiber.Map {
	v := in.video
	isPrivate := v.Status != "published"
	ttl := 1440
	if isPrivate {
		ttl = 120
	}

	commentsCount := int64(v.CommentsCount)
	if in.visibleCommentsCount != nil {
		commentsCount = *in.visibleCommentsCount
	}

	var videoURL any
	if v.VideoUrl != "" {
		videoURL = signedCdnURL(mediaBase, signingSecret, v.VideoUrl, ttl)
	}
	var thumbnailURL any
	if v.ThumbnailUrl.Valid && v.ThumbnailUrl.String != "" {
		thumbnailURL = mediaJoin(mediaBase, v.ThumbnailUrl.String)
	}

	mediaItems, hasMedia := parseMediaItems(v.MediaItems, mediaBase)

	language := "en"
	if v.Language.Valid && v.Language.String != "" {
		language = v.Language.String
	}

	var aspectRatio any
	if v.Width.Valid && v.Height.Valid && v.Width.Int16 != 0 && v.Height.Int16 != 0 {
		aspectRatio = round(float64(v.Width.Int16)/float64(v.Height.Int16), 4)
	}

	m := fiber.Map{
		"id":            v.ID,
		"title":         nullableText(v.Title),
		"caption":       nullableText(v.Caption),
		"video_url":     videoURL,
		"thumbnail_url": thumbnailURL,
		"mime_type":     nullableText(v.MimeType),
		"media_type":    mediaType(hasMedia, v.MimeType),

		"category":       nullableText(v.Category),
		"location":       nullableText(v.Location),
		"language":       language,
		"allow_download": v.AllowDownload,

		"duration":     nullableInt2(v.Duration),
		"file_size":    nullableInt8(v.FileSize),
		"width":        nullableInt2(v.Width),
		"height":       nullableInt2(v.Height),
		"aspect_ratio": aspectRatio,
		"status":       v.Status,
		"is_pinned":    v.IsPinned,
		"pinned_at":    toIso8601(v.PinnedAt),

		"allow_comments":  v.AllowComments,
		"allow_duet":      v.AllowDuet,
		"allow_stitch":    v.AllowStitch,
		"is_ai_generated": v.IsAiGenerated,

		"views_count":    v.ViewsCount,
		"likes_count":    v.LikesCount,
		"comments_count": commentsCount,
		"saves_count":    v.SavesCount,
		"shares_count":   v.SharesCount,

		"engagement_rate": engagementRate(v, commentsCount),

		"is_liked": in.authUserID != 0 && in.isLiked,
		"is_saved": in.authUserID != 0 && in.isSaved,

		"audio_type": nullableText(v.AudioType),

		"scheduled_at": toIso8601(v.ScheduledAt),
		"created_at":   toIso8601(v.CreatedAt),
	}

	if in.hashtagsLoaded {
		m["hashtags"] = stringSlice(in.hashtags)
	}

	// media_items / quality_urls: present only when non-empty ($this->when).
	if hasMedia {
		m["media_items"] = mediaItems
	}
	if qu := parseQualityUrls(v.QualityUrls, mediaBase, signingSecret, ttl); qu != nil {
		m["quality_urls"] = qu
	}
	if in.watchTimeSeconds != nil {
		m["watch_time_seconds"] = *in.watchTimeSeconds
	}

	// audio (belongsTo, key omitted when the relation is null).
	if in.audioTrack != nil {
		m["audio"] = fiber.Map{
			"id":     in.audioTrack.ID,
			"title":  in.audioTrack.Title,
			"artist": nullableText(in.audioTrack.Artist),
		}
	}

	if in.musicTrack != nil {
		mt := in.musicTrack
		isOriginal := mt.SourceType == "original"
		cover := musicCoverURL(mt, isOriginal, mediaBase)
		m["music_track"] = fiber.Map{
			"id":          mt.ID,
			"title":       mt.Title,
			"artist":      nullableText(mt.ArtistName),
			"cover_url":   cover,
			"audio_url":   nullableText(mt.AudioUrl),
			"duration":    nullableInt4(mt.Duration),
			"uses_count":  mt.UsesCount,
			"source_type": mt.SourceType,
		}
		soundType := "library_music"
		if isOriginal {
			soundType = "original_audio"
		}
		m["main_sound"] = fiber.Map{
			"type":        soundType,
			"id":          mt.ID,
			"title":       mt.Title,
			"artist_name": nullableText(mt.ArtistName),
			"cover_url":   cover,
			"route":       "/sound/" + strconv.FormatInt(mt.ID, 10),
		}
	}

	if in.user != nil {
		u := in.user
		var avatar any
		if u.Avatar.Valid && u.Avatar.String != "" {
			avatar = mediaJoin(mediaBase, u.Avatar.String)
		}
		m["user"] = fiber.Map{
			"id":              u.ID,
			"username":        u.Username,
			"name":            u.Name,
			"avatar":          avatar,
			"is_verified":     u.IsVerified,
			"is_following":    in.authUserID != 0 && in.isFollowing,
			"followers_count": u.TotalFollowers,
			"likes_count":     u.TotalLikes,
		}
	}

	if in.taggedUsersLoaded {
		tagged := make([]fiber.Map, len(in.taggedUsers))
		for i, u := range in.taggedUsers {
			var avatar any
			if u.Avatar.Valid && u.Avatar.String != "" {
				avatar = mediaJoin(mediaBase, u.Avatar.String)
			}
			tagged[i] = fiber.Map{
				"id":           u.ID,
				"username":     u.Username,
				"display_name": u.Name,
				"avatar_url":   avatar,
				"verified":     u.IsVerified,
			}
		}
		m["tagged_users"] = tagged
	}

	return m
}

func mediaType(hasMedia bool, mime pgtype.Text) string {
	if hasMedia {
		return "image_carousel"
	}
	if mime.Valid && strings.HasPrefix(mime.String, "image/") {
		return "image"
	}
	return "video"
}

// musicCoverURL: originals store an R2 key in cover_url (join it); library
// tracks and http-prefixed values are already absolute.
func musicCoverURL(mt *sqlc.MusicTrack, isOriginal bool, base string) any {
	if !mt.CoverUrl.Valid || mt.CoverUrl.String == "" {
		return nil
	}
	c := mt.CoverUrl.String
	if isOriginal && !strings.HasPrefix(c, "http") {
		return mediaJoin(base, c)
	}
	return c
}

func engagementRate(v sqlc.GetVideoForShowRow, commentsCount int64) float64 {
	views := v.ViewsCount
	if views == 0 {
		return 0.0
	}
	interactions := v.LikesCount + commentsCount + int64(v.SharesCount) + int64(v.SavesCount)
	return round(float64(interactions)/float64(views)*100, 1)
}

func parseMediaItems(raw []byte, base string) ([]fiber.Map, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil || len(items) == 0 {
		return nil, false
	}
	out := make([]fiber.Map, len(items))
	for i, it := range items {
		var objectKey any
		var url any
		if k, ok := it["object_key"].(string); ok && k != "" {
			objectKey = k
			url = mediaJoin(base, k)
		}
		order := 0
		if o, ok := it["order"].(float64); ok {
			order = int(o)
		}
		var mime any
		if mt, ok := it["mime_type"].(string); ok {
			mime = mt
		}
		out[i] = fiber.Map{"object_key": objectKey, "url": url, "order": order, "mime_type": mime}
	}
	return out, true
}

// parseQualityUrls returns a JSON-object map of quality label → signed URL, or
// nil when empty (so the caller omits the key). Handles both the object form
// {"360": key, …} and the indexed-array form [key0, key1, …].
func parseQualityUrls(raw []byte, base, secret string, ttl int) map[string]any {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	out := map[string]any{}
	if strings.HasPrefix(trimmed, "[") {
		var arr []string
		if err := json.Unmarshal(raw, &arr); err != nil || len(arr) == 0 {
			return nil
		}
		for i, key := range arr {
			label := extractQualityLabel(key, "q"+strconv.Itoa(i))
			out[label] = signedCdnURL(base, secret, key, ttl)
		}
		return out
	}
	var obj map[string]string
	if err := json.Unmarshal(raw, &obj); err != nil || len(obj) == 0 {
		return nil
	}
	for k, key := range obj {
		label := k
		if canonicalIntRe.MatchString(k) {
			label = extractQualityLabel(key, "q"+k)
		}
		out[label] = signedCdnURL(base, secret, key, ttl)
	}
	return out
}

func extractQualityLabel(path, fallback string) string {
	if m := qualityLabelRe.FindStringSubmatch(path); m != nil {
		return m[1]
	}
	return fallback
}

// signedCdnURL mirrors VideoResource::signedCdnUrl:
// token = HMAC-SHA256("/<key>|<expires>", secret), appended as query params.
func signedCdnURL(base, secret, key string, ttlMinutes int) string {
	path := "/" + strings.TrimLeft(key, "/")
	expires := time.Now().Add(time.Duration(ttlMinutes) * time.Minute).Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%s|%d", path, expires)
	token := hex.EncodeToString(mac.Sum(nil))
	return mediaJoin(base, key) + "?expires=" + strconv.FormatInt(expires, 10) + "&token=" + token
}

// mediaJoin is Storage::disk($disk)->url($key) for the r2/public disk: base +
// "/" + key. Empty base falls back to the raw key (dev).
func mediaJoin(base, key string) string {
	if base == "" {
		return key
	}
	return base + "/" + strings.TrimLeft(key, "/")
}

// round to n decimals, matching PHP round()'s half-away-from-zero.
func round(x float64, n int) float64 {
	p := math.Pow(10, float64(n))
	return math.Round(x*p) / p
}

func stringSlice(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// musicTrackFromRow carries the eight music columns a video card renders into
// the sqlc.MusicTrack shape videoResource expects.
//
// Needed because music_tracks' mirror in db/schema/schema.sql grew when the
// music endpoints were ported: the video queries select a strict subset now, so
// sqlc emits per-query row structs instead of aliasing them to sqlc.MusicTrack.
// The unset fields are never read on this path - see musicCoverURL and the
// music block in videoResource.
func musicTrackFromRow(
	id int64, title string, artist, cover, audio pgtype.Text,
	duration pgtype.Int4, usesCount int64, sourceType string,
) sqlc.MusicTrack {
	return sqlc.MusicTrack{
		ID:         id,
		Title:      title,
		ArtistName: artist,
		CoverUrl:   cover,
		AudioUrl:   audio,
		Duration:   duration,
		UsesCount:  usesCount,
		SourceType: sourceType,
	}
}
