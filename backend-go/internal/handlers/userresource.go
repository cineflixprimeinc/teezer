// userResource ports App\Http\Resources\UserResource. show() always injects the
// computed profile stats + auth-context fields, so this renderer takes them
// explicitly rather than re-deriving. social_links is always present (Laravel's
// whenLoaded default is [] here, not omission).
package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"

	"reelsoo/backend-go/internal/sqlc"
)

// Injected stat attrs are pointers: nil means "not provided by this endpoint",
// so the renderer falls back to the profile totals exactly like UserResource's
// `$attr(...) ?? $this->profile?->total_*` chain. show() supplies all of them;
// the followers/following lists supply only some (following injects a live
// followers_count + total_likes_received; followers uses profile fallbacks).
type userResourceInput struct {
	user        sqlc.GetUserForShowRow
	authed      bool
	socialLinks []sqlc.GetUserSocialLinksRow

	followersCount     *int64
	followingCount     *int64
	videosCount        *int64
	totalLikesReceived *int64
	totalVideoViews    *int64
	hasStory           bool

	isFollowing  bool
	isBlocked    bool
	followStatus string
}

func renderUserResource(in userResourceInput, mediaBase string) fiber.Map {
	u := in.user

	var avatar any
	if u.Avatar.Valid && u.Avatar.String != "" {
		avatar = mediaJoin(mediaBase, u.Avatar.String)
	}

	links := make([]fiber.Map, len(in.socialLinks))
	for i, l := range in.socialLinks {
		links[i] = fiber.Map{"platform": l.Platform, "url": l.Url}
	}

	followStatus := "none"
	isFollowing := false
	isBlocked := false
	if in.authed {
		isFollowing = in.isFollowing
		isBlocked = in.isBlocked
		if in.followStatus != "" {
			followStatus = in.followStatus
		}
	}

	return fiber.Map{
		"id":           u.ID,
		"name":         u.Name,
		"username":     u.Username,
		"avatar":       avatar,
		"bio":          nullableText(u.Bio),
		"country":      nullableText(u.Country),
		"location":     nullableText(u.Location),
		"categories":   parseCategories(u.Categories),
		"website":      nullableText(u.Website),
		"social_links": links,
		"is_verified":  u.IsVerified,
		"is_private":   u.IsPrivate,
		"role":         u.Role,

		"followers_count":      coalesceInt(in.followersCount, int64(u.TotalFollowers)),
		"following_count":      coalesceInt(in.followingCount, int64(u.TotalFollowing)),
		"likes_count":          coalesceInt(in.totalLikesReceived, u.TotalLikes), // total_likes_received ?? profile.total_likes
		"videos_count":         coalesceInt(in.videosCount, int64(u.TotalVideos)),
		"total_likes_received": ptrOrNil(in.totalLikesReceived),
		"total_video_views":    ptrOrNil(in.totalVideoViews),

		"is_following":  isFollowing,
		"is_blocked":    isBlocked,
		"follow_status": followStatus,

		"created_at": toIso8601(u.CreatedAt),
		"has_story":  in.hasStory,
	}
}

func coalesceInt(p *int64, fallback int64) int64 {
	if p != nil {
		return *p
	}
	return fallback
}

func ptrOrNil(p *int64) any {
	if p != nil {
		return *p
	}
	return nil
}

// parseCategories mirrors `$this->categories ?? []` (User casts categories to an
// array). Null/invalid → [].
func parseCategories(raw []byte) any {
	if len(raw) == 0 {
		return []any{}
	}
	var v []any
	if err := json.Unmarshal(raw, &v); err != nil {
		return []any{}
	}
	return v
}
