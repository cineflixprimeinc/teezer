// Shared paginated video-list rendering. renderVideoList batches every per-page
// relation so a page of N videos costs a constant number of queries regardless
// of N or how many distinct creators the page spans (liked/trending/feed).
//
// videoListOpts maps each Laravel controller's with()/withVisibleCommentsCount()
// choices to which relations load; renderVideoResource's whenLoaded gates then
// omit whatever a page didn't load. is_liked/is_saved are always resolved for a
// logged-in viewer, so they aren't options.
package handlers

import (
	"context"

	"github.com/gofiber/fiber/v2"

	"reelsoo/backend-go/internal/sqlc"
)

type videoListOpts struct {
	loadUser          bool
	loadHashtags      bool
	loadVisibleCounts bool
	loadAudio         bool
	loadMusic         bool
	loadTagged        bool
}

func renderVideoList(ctx context.Context, q *sqlc.Queries, mediaBase, secret string, videos []sqlc.GetVideoForShowRow, authUserID int64, opts videoListOpts) ([]fiber.Map, error) {
	if len(videos) == 0 {
		return []fiber.Map{}, nil
	}

	ids := make([]int64, len(videos))
	creatorSet := map[int64]struct{}{}
	audioSet := map[int64]struct{}{}
	musicSet := map[int64]struct{}{}
	for i, v := range videos {
		ids[i] = v.ID
		creatorSet[v.UserID] = struct{}{}
		if opts.loadAudio && v.AudioTrackID.Valid {
			audioSet[v.AudioTrackID.Int64] = struct{}{}
		}
		if opts.loadMusic && v.MusicTrackID.Valid {
			musicSet[v.MusicTrackID.Int64] = struct{}{}
		}
	}

	creators := map[int64]*sqlc.GetVideoUserWithProfileRow{}
	if opts.loadUser {
		rows, err := q.GetVideoUsersWithProfile(ctx, keys(creatorSet))
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			cr := sqlc.GetVideoUserWithProfileRow(r)
			creators[cr.ID] = &cr
		}
	}

	hashtagsByVideo := map[int64][]string{}
	if opts.loadHashtags {
		rows, err := q.ListVideoHashtags(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			hashtagsByVideo[r.VideoID] = append(hashtagsByVideo[r.VideoID], r.Name)
		}
	}

	visibleByVideo := map[int64]int64{}
	if opts.loadVisibleCounts {
		rows, err := q.ListVisibleCommentCounts(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			visibleByVideo[r.VideoID] = r.Cnt
		}
	}

	audioByID := map[int64]*sqlc.AudioTrack{}
	if opts.loadAudio && len(audioSet) > 0 {
		rows, err := q.GetAudioTracksByIDs(ctx, keys(audioSet))
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			at := r
			audioByID[at.ID] = &at
		}
	}

	musicByID := map[int64]*sqlc.MusicTrack{}
	if opts.loadMusic && len(musicSet) > 0 {
		rows, err := q.GetMusicTracksByIDs(ctx, keys(musicSet))
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			mt := musicTrackFromRow(r.ID, r.Title, r.ArtistName, r.CoverUrl, r.AudioUrl,
				r.Duration, r.UsesCount, r.SourceType)
			musicByID[mt.ID] = &mt
		}
	}

	taggedByVideo := map[int64][]sqlc.GetVideoTaggedUsersRow{}
	if opts.loadTagged {
		rows, err := q.ListTaggedUsersForVideos(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			taggedByVideo[r.VideoID] = append(taggedByVideo[r.VideoID], sqlc.GetVideoTaggedUsersRow{
				ID: r.ID, Username: r.Username, Name: r.Name, Avatar: r.Avatar, IsVerified: r.IsVerified,
			})
		}
	}

	liked, saved, followed := map[int64]bool{}, map[int64]bool{}, map[int64]bool{}
	if authUserID != 0 {
		likedIDs, err := q.ListLikedVideoIDs(ctx, sqlc.ListLikedVideoIDsParams{UserID: authUserID, Column2: ids})
		if err != nil {
			return nil, err
		}
		for _, id := range likedIDs {
			liked[id] = true
		}
		savedIDs, err := q.ListSavedVideoIDs(ctx, sqlc.ListSavedVideoIDsParams{UserID: authUserID, Column2: ids})
		if err != nil {
			return nil, err
		}
		for _, id := range savedIDs {
			saved[id] = true
		}
		if opts.loadUser {
			followedIDs, err := q.ListFollowedCreatorIDs(ctx, sqlc.ListFollowedCreatorIDsParams{FollowerID: authUserID, Column2: keys(creatorSet)})
			if err != nil {
				return nil, err
			}
			for _, id := range followedIDs {
				followed[id] = true
			}
		}
	}

	out := make([]fiber.Map, len(videos))
	for i, v := range videos {
		in := videoResourceInput{
			video:      v,
			authUserID: authUserID,
			isLiked:    liked[v.ID],
			isSaved:    saved[v.ID],
		}
		if opts.loadUser {
			in.user = creators[v.UserID]
			in.isFollowing = followed[v.UserID]
		}
		if opts.loadHashtags {
			in.hashtags = hashtagsByVideo[v.ID]
			in.hashtagsLoaded = true
		}
		if opts.loadVisibleCounts {
			vc := visibleByVideo[v.ID]
			in.visibleCommentsCount = &vc
		}
		if opts.loadAudio && v.AudioTrackID.Valid {
			in.audioTrack = audioByID[v.AudioTrackID.Int64]
		}
		if opts.loadMusic && v.MusicTrackID.Valid {
			in.musicTrack = musicByID[v.MusicTrackID.Int64]
		}
		if opts.loadTagged {
			in.taggedUsers = taggedByVideo[v.ID]
			in.taggedUsersLoaded = true
		}
		out[i] = renderVideoResource(in, mediaBase, secret)
	}
	return out, nil
}

func keys(set map[int64]struct{}) []int64 {
	out := make([]int64, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return out
}
