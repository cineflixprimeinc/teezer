package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/redis/go-redis/v9"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/clickhouse"
	"reelsoo/backend-go/internal/config"
	"reelsoo/backend-go/internal/database"
	eventbus "reelsoo/backend-go/internal/events"
	"reelsoo/backend-go/internal/handlers"
	"reelsoo/backend-go/internal/httpsec"
	"reelsoo/backend-go/internal/knowledge"
	"reelsoo/backend-go/internal/laravelcrypt"
	"reelsoo/backend-go/internal/ratelimit"
	"reelsoo/backend-go/internal/scoring"
	"reelsoo/backend-go/internal/securitylimit"
	"reelsoo/backend-go/internal/sqlc"
	"reelsoo/backend-go/internal/storage"
	"reelsoo/backend-go/internal/textmod"
	"reelsoo/backend-go/internal/turnstile"
	"reelsoo/backend-go/internal/wikipedia"
)

func main() {
	cfg := config.Load()

	// Before anything connects: refuse to start on configuration that cannot
	// serve traffic. Failing here gives one clear message naming the variable,
	// instead of a SASL error at first query or - worse - a silent connection
	// with an empty password.
	if err := cfg.Validate(); err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	var rdb *redis.Client
	if cfg.RedisURL != "" {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			log.Fatalf("redis url: %v", err)
		}
		rdb = redis.NewClient(opts)
		if err := rdb.Ping(ctx).Err(); err != nil {
			log.Fatalf("redis: %v", err)
		}
	} else {
		log.Println("REDIS_URL not set - rate limiting, dedupe, and cache-busting run in single-instance in-memory mode")
	}

	// ClickHouse holds the analytics event stream. An empty CLICKHOUSE_DSN returns
	// a nil writer, which is a valid silent no-op - so a failure to configure it
	// degrades us to "no analytics", never to "no API". Same reasoning for the
	// non-fatal error: analytics is not worth refusing to boot over.
	events, err := clickhouse.NewWriter(ctx, cfg.ClickHouseDSN)
	if err != nil {
		log.Printf("clickhouse: disabled - could not connect: %v", err)
	}
	defer events.Close()

	// Drain the Redis stream Laravel writes analytics events to. Laravel owns the
	// view/like/comment write paths and cannot talk to ClickHouse itself (a PHP
	// request thread holding an INSERT open, one part per view, would destroy it),
	// so it appends to a stream and this feeds the same batching writer the Go
	// handlers use. Without this, ClickHouse only ever sees /video-events and the
	// dashboard's view counts silently stop growing.
	drainCtx, stopDrain := context.WithCancel(ctx)
	defer stopDrain()
	go clickhouse.NewDrainer(rdb, events).Run(drainCtx)

	// Same mechanism, a separate stream/table/writer: the api.video-primary/
	// ffmpeg-fallback video processing pipeline's own events
	// (ProcessingEventStream::push on the Laravel side). See
	// internal/clickhouse/processing_*.go for why this isn't just Event/
	// Writer/Drainer reused - a genuinely different schema, not a reason to
	// generalize the engagement-analytics ones.
	processingEvents, err := clickhouse.NewProcessingWriter(ctx, cfg.ClickHouseDSN)
	if err != nil {
		log.Printf("clickhouse: video-processing-events disabled - could not connect: %v", err)
	}
	defer processingEvents.Close()
	go clickhouse.NewProcessingDrainer(rdb, processingEvents).Run(drainCtx)

	crypt, err := laravelcrypt.New(cfg.AppKey)
	if err != nil {
		log.Fatalf("laravelcrypt: %v", err)
	}

	// NATS JetStream event bus (see internal/events): publishes video/comment/
	// follow interaction events, bridged to Centrifugo by a durable consumer
	// running in this same process. An empty NATS_URL degrades this to a
	// no-op - Postgres remains the sole source of truth either way; this only
	// adds live fan-out to OTHER connected clients on top of it.
	eventsPub, err := eventbus.NewPublisher(ctx, cfg.NatsURL)
	if err != nil {
		log.Printf("events: NATS unavailable, realtime publishing from Go disabled: %v", err)
		eventsPub = nil
	}
	centrifugoBridge := eventbus.NewCentrifugoBridge(cfg.CentrifugoAPIURL, cfg.CentrifugoAPIKey)
	eventsConsumer := eventbus.NewConsumer(eventsPub, centrifugoBridge, rdb)
	consumerCtx, stopConsumer := context.WithCancel(ctx)
	defer stopConsumer()
	go eventsConsumer.Run(consumerCtx)

	queries := sqlc.New(pool)
	authenticator := auth.NewAuthenticator(queries)
	limiter := ratelimit.New(rdb)
	recomputer := scoring.NewRecomputer(queries, rdb)
	securityLimiter := securitylimit.New(pool)
	turnstileSvc := turnstile.New(cfg.TurnstileSecretKey, cfg.TurnstileBreaker)
	textModeration := textmod.New(cfg.TextModerationEnabled, cfg.TextModerationReviewThreshold)
	videoEvents := handlers.NewVideoEventsHandler(queries, limiter, recomputer, events)
	authHandler := handlers.NewAuthHandler(queries, securityLimiter, turnstileSvc, limiter, crypt)
	followHandler := handlers.NewFollowHandler(queries, pool, eventsPub, limiter)
	likesHandler := handlers.NewLikesHandler(queries, pool, eventsPub, limiter)
	savesHandler := handlers.NewSavesHandler(queries, pool)
	shareHandler := handlers.NewShareHandler(queries, eventsPub)
	reportsHandler := handlers.NewReportsHandler(queries)
	notificationsHandler := handlers.NewNotificationsHandler(queries, cfg.MediaBaseURL)
	videosHandler := handlers.NewVideosHandler(queries, cfg.MediaBaseURL, cfg.MediaSigningSecret)
	usersHandler := handlers.NewUsersHandler(queries, cfg.MediaBaseURL, cfg.MediaSigningSecret)
	// Object storage, media write side - R2 or B2 depending on which keys are
	// set. Unconfigured => the avatar endpoints 503; nothing else in the API
	// depends on it.
	store := storage.New(storage.Config{
		AccessKeyID:     cfg.MediaStoreAccessKeyID,
		SecretAccessKey: cfg.MediaStoreSecretAccessKey,
		Bucket:          cfg.MediaStoreBucket,
		Endpoint:        cfg.MediaStoreEndpoint,
		Region:          cfg.MediaStoreRegion,
	})
	// Declared after `store` because comment creation can carry an attached photo.
	commentsHandler := handlers.NewCommentsHandler(queries, pool, eventsPub, textModeration, store, limiter)
	profileHandler := handlers.NewProfileHandler(queries, pool, cfg.MediaBaseURL, store)
	messagesHandler := handlers.NewMessagesHandler(queries, cfg.MediaBaseURL)
	storiesHandler := handlers.NewStoriesHandler(queries, cfg.MediaBaseURL, cfg.MediaSigningSecret, eventsPub, store)
	walletHandler := handlers.NewWalletHandler(queries, cfg.MediaBaseURL)
	giftsHandler := handlers.NewGiftsHandler(queries)
	subscriptionsHandler := handlers.NewSubscriptionsHandler(queries)
	premiumHandler := handlers.NewPremiumHandler(queries, pool, cfg.MediaBaseURL)
	musicHandler := handlers.NewMusicHandler(queries, cfg.MediaBaseURL)
	exploreHandler := handlers.NewExploreHandler(queries, cfg.MediaBaseURL, cfg.MediaSigningSecret, usersHandler)
	hashtagsHandler := handlers.NewHashtagsHandler(queries)
	historyHandler := handlers.NewHistoryHandler(queries, cfg.MediaBaseURL)
	accountHandler := handlers.NewAccountHandler(queries)
	// Wikipedia knowledge cards. Reuses `limiter` for the Redis cache layer -
	// it already wraps Redis-when-configured with an in-process fallback, so
	// the feature degrades to a single-instance cache in dev rather than
	// needing its own client. nil fetcher => the real Wikimedia client.
	wikiClient := wikipedia.New(cfg.WikipediaBreaker)
	knowledgeSvc := knowledge.NewService(queries, limiter, wikiClient)
	knowledgeHandler := handlers.NewKnowledgeHandler(knowledgeSvc, limiter)

	// ErrorHandler replaces Fiber's default, which writes err.Error() straight
	// into the response body - see internal/httpsec.
	app := fiber.New(fiber.Config{
		ErrorHandler: httpsec.ErrorHandler,
	})

	// Order matters. Headers() runs first so its stamping happens on the way
	// back out for every response, including those produced by Recover below
	// and by ErrorHandler above. Recover turns a panic into an error the
	// ErrorHandler can render, instead of a dropped connection.
	app.Use(httpsec.Headers())
	app.Use(recover.New())

	app.Get("/health", handlers.Health(pool, events, wikiClient.Breaker(), turnstileSvc.Breaker()))

	v1 := app.Group("/api/v1")

	// Wikipedia knowledge card. OptionalAuth: the card is public context and
	// shows on logged-out search too, but an authenticated caller is still
	// identified for rate-limiting purposes.
	v1.Get("/knowledge", authenticator.OptionalAuth, knowledgeHandler.Show)

	v1.Post("/video-events", authenticator.OptionalAuth, videoEvents.Store)
	v1.Post("/auth/login", authHandler.Login)
	v1.Post("/auth/two-factor-challenge", authHandler.TwoFactorChallenge)
	v1.Get("/me", authenticator.RequireAuth, authHandler.Me)
	v1.Post("/users/:username/follow", authenticator.RequireAuth, followHandler.Follow)
	v1.Delete("/users/:username/follow", authenticator.RequireAuth, followHandler.Unfollow)
	v1.Post("/videos/:id/like", authenticator.RequireAuth, likesHandler.Like)
	v1.Delete("/videos/:id/like", authenticator.RequireAuth, likesHandler.Unlike)
	v1.Post("/videos/:id/toggle-like", authenticator.RequireAuth, likesHandler.ToggleLike)
	v1.Post("/videos/:id/save", authenticator.RequireAuth, savesHandler.Save)
	v1.Delete("/videos/:id/save", authenticator.RequireAuth, savesHandler.Unsave)
	v1.Post("/videos/:id/toggle-save", authenticator.RequireAuth, savesHandler.ToggleSave)
	v1.Post("/videos/:id/share", authenticator.OptionalAuth, shareHandler.Share)
	v1.Post("/videos/:id/report", authenticator.RequireAuth, reportsHandler.Report)
	// Keyword video routes must be registered before the :id catch-all -
	// otherwise :id absorbs them ("trending" → ParseInt fail → 404).
	v1.Get("/videos/feed", authenticator.OptionalAuth, videosHandler.Feed)
	v1.Get("/videos/trending", authenticator.OptionalAuth, videosHandler.Trending)
	v1.Get("/videos/following", authenticator.RequireAuth, videosHandler.FollowingFeed)
	v1.Get("/videos/:id", authenticator.OptionalAuth, videosHandler.Show)
	v1.Get("/users/:username", authenticator.OptionalAuth, usersHandler.Show)
	v1.Get("/users/:username/videos", authenticator.OptionalAuth, usersHandler.Videos)
	v1.Get("/users/:username/liked", authenticator.RequireAuth, usersHandler.Liked)
	v1.Get("/users/:username/saved", authenticator.RequireAuth, usersHandler.Saved)
	v1.Get("/users/:username/followers", authenticator.RequireAuth, usersHandler.Followers)
	v1.Get("/users/:username/following", authenticator.RequireAuth, usersHandler.Following)
	v1.Post("/videos/:id/comments", authenticator.RequireAuth, commentsHandler.Store)
	v1.Get("/videos/:id/comments", authenticator.OptionalAuth, commentsHandler.Index)
	v1.Get("/comments/:id/replies", authenticator.OptionalAuth, commentsHandler.Replies)
	v1.Post("/videos/:id/comments/:cid/like", authenticator.RequireAuth, commentsHandler.Like)
	v1.Delete("/videos/:id/comments/:cid/like", authenticator.RequireAuth, commentsHandler.Unlike)
	v1.Delete("/videos/:id/comments/:cid", authenticator.RequireAuth, commentsHandler.Destroy)
	v1.Get("/profile", authenticator.RequireAuth, profileHandler.Show)
	v1.Put("/profile", authenticator.RequireAuth, profileHandler.Update)
	v1.Post("/profile/check-username", authenticator.RequireAuth, profileHandler.CheckUsername)
	v1.Get("/profile/privacy", authenticator.RequireAuth, profileHandler.GetPrivacy)
	v1.Patch("/profile/privacy", authenticator.RequireAuth, profileHandler.UpdatePrivacy)
	v1.Patch("/profile/saved-privacy", authenticator.RequireAuth, profileHandler.UpdateSavedPrivacy)
	v1.Post("/profile/avatar", authenticator.RequireAuth, profileHandler.UpdateAvatar)
	v1.Delete("/profile/avatar", authenticator.RequireAuth, profileHandler.RemoveAvatar)
	v1.Get("/profile/social-links", authenticator.RequireAuth, profileHandler.SocialLinks)
	v1.Put("/profile/social-links", authenticator.RequireAuth, profileHandler.UpdateSocialLinks)
	v1.Get("/profile/highlights", authenticator.RequireAuth, profileHandler.Highlights)
	v1.Post("/profile/highlights", authenticator.RequireAuth, profileHandler.StoreHighlight)
	v1.Put("/profile/highlights/:id", authenticator.RequireAuth, profileHandler.UpdateHighlight)
	v1.Delete("/profile/highlights/:id", authenticator.RequireAuth, profileHandler.DestroyHighlight)

	// The JSON preference groups. Each group exposes GET + PATCH on one path
	// (ProfileController's xxxDefaults/updateXxx pairs); family also carries the
	// parent PIN. Laravel throttles the two pin routes (throttle:10,1) - see the
	// scope note at the top of preferences.go.
	for _, g := range []struct {
		path     string
		handlers func() (fiber.Handler, fiber.Handler)
	}{
		{"/profile/notifications", profileHandler.NotificationPrefs},
		{"/profile/content-preferences", profileHandler.ContentPrefs},
		{"/profile/accessibility", profileHandler.AccessibilityPrefs},
		{"/profile/appearance", profileHandler.AppearancePrefs},
		{"/profile/messages-preferences", profileHandler.MessagesPrefs},
		{"/profile/wellbeing", profileHandler.WellbeingPrefs},
		{"/profile/ai-preferences", profileHandler.AiPrefs},
	} {
		get, patch := g.handlers()
		v1.Get(g.path, authenticator.RequireAuth, get)
		v1.Patch(g.path, authenticator.RequireAuth, patch)
	}
	v1.Get("/profile/family", authenticator.RequireAuth, profileHandler.GetFamily)
	v1.Patch("/profile/family", authenticator.RequireAuth, profileHandler.UpdateFamily)
	v1.Post("/profile/family/pin", authenticator.RequireAuth, profileHandler.SetFamilyPin)
	v1.Post("/profile/family/pin/verify", authenticator.RequireAuth, profileHandler.VerifyFamilyPin)

	// DM read surface (MessageController conversations/requests/unreadCount). The
	// write/history paths stay in Laravel - they fan out over Centrifugo.
	v1.Get("/messages/unread-count", authenticator.RequireAuth, messagesHandler.UnreadCount)
	v1.Get("/messages/conversations", authenticator.RequireAuth, messagesHandler.Conversations)
	v1.Get("/messages/requests", authenticator.RequireAuth, messagesHandler.Requests)

	// Stories read surface (StoryController feed/activeUserIds). Write/action
	// paths stay in Laravel (media write + NotificationService + view records).
	v1.Get("/stories/feed", authenticator.RequireAuth, storiesHandler.Feed)
	v1.Get("/stories/active-user-ids", authenticator.RequireAuth, storiesHandler.ActiveUserIDs)
	v1.Get("/stories/my", authenticator.RequireAuth, storiesHandler.MyStories)
	v1.Get("/stories/drafts", authenticator.RequireAuth, storiesHandler.Drafts)
	v1.Get("/stories/search-users", authenticator.RequireAuth, storiesHandler.SearchUsers)
	// :id/viewers before :id so "viewers" is not read as an id. Static /my,
	// /drafts, /feed, /active-user-ids are registered above /stories/:id too.
	v1.Get("/stories/:id/viewers", authenticator.RequireAuth, storiesHandler.Viewers)
	v1.Get("/stories/:id", authenticator.RequireAuth, storiesHandler.Show)

	// Story interaction writes. POST /stories (create) and /from-video stay in
	// Laravel - they need the media upload path; reply() is its own increment.
	v1.Post("/stories", authenticator.RequireAuth, storiesHandler.Store)
	v1.Post("/stories/from-video", authenticator.RequireAuth, storiesHandler.FromVideo)
	v1.Post("/stories/:id/report", authenticator.RequireAuth, storiesHandler.Report)
	v1.Post("/stories/:id/view", authenticator.RequireAuth, storiesHandler.View)
	v1.Post("/stories/:id/react", authenticator.RequireAuth, storiesHandler.React)
	v1.Delete("/stories/:id/reaction", authenticator.RequireAuth, storiesHandler.RemoveReaction)
	v1.Post("/stories/:id/share", authenticator.RequireAuth, storiesHandler.Share)
	v1.Get("/stories/:id/analytics", authenticator.RequireAuth, storiesHandler.Analytics)
	v1.Post("/stories/:id/reply", authenticator.RequireAuth, storiesHandler.Reply)
	v1.Delete("/stories/:id", authenticator.RequireAuth, storiesHandler.Destroy)
	v1.Get("/users/:username/stories", authenticator.OptionalAuth, storiesHandler.UserStories)

	// Wallet & coins read surface (StudioWalletCoinsController index/packages/
	// transactions/iapProducts + WalletController stubs). The order/capture/
	// iap-verify writes stay in Laravel (payment gateways + receipt verify).
	v1.Get("/wallet", authenticator.RequireAuth, walletHandler.LegacyShow)
	v1.Get("/wallet/transactions", authenticator.RequireAuth, walletHandler.LegacyTransactions)
	v1.Get("/studio/wallets-coins", authenticator.RequireAuth, walletHandler.Index)
	v1.Get("/studio/wallets-coins/packages", authenticator.RequireAuth, walletHandler.Packages)
	v1.Get("/studio/wallets-coins/transactions", authenticator.RequireAuth, walletHandler.Transactions)
	v1.Get("/studio/wallets-coins/iap/products", authenticator.RequireAuth, walletHandler.IapProducts)

	// Gifts catalog + premium subscription reads. gifts/send + all subscription
	// order/capture/verify paths stay in Laravel (payment gateways + coin bonus).
	v1.Get("/gifts", authenticator.RequireAuth, giftsHandler.Index)
	// Music library. Public, matching Laravel, except `use` which is sanctum.
	// Static paths are registered before the :id ones so "/music/library" can
	// never be swallowed by a parameter route.
	v1.Get("/music/library", musicHandler.Library)
	v1.Get("/music/picker", musicHandler.Picker)
	v1.Get("/music/trending", musicHandler.Trending)
	v1.Get("/music/weekly-popular", musicHandler.WeeklyPopular)
	// Public, but OptionalAuth so a signed-in listener is attributed in the
	// play log - Laravel logs Auth::id() here and nulls it for guests.
	v1.Post("/music/:id/play", authenticator.OptionalAuth, musicHandler.Play)
	v1.Post("/music/:id/use", authenticator.RequireAuth, musicHandler.Use)

	// The premium page catalogue. Public on purpose - it has to sell to
	// signed-out users - and deliberately separate from /studio/subscriptions
	// below, which is the one source of truth for whether YOU already pay.
	v1.Get("/premium", premiumHandler.Index)

	v1.Get("/studio/subscriptions", authenticator.RequireAuth, subscriptionsHandler.Current)
	v1.Get("/studio/subscriptions/iap/products", authenticator.RequireAuth, subscriptionsHandler.IapProducts)

	// Explore + hashtag discovery (ExploreController + HashtagController::trending).
	// All public/OptionalAuth reads. /explore/hashtags/{name} sits under the static
	// /explore/hashtags, so no keyword/param collision. NOT ported: the top-level
	// /search (Meilisearch proxy) - it stays in Laravel.
	v1.Get("/explore/trending", authenticator.OptionalAuth, exploreHandler.Trending)
	v1.Get("/explore/hashtags", authenticator.OptionalAuth, exploreHandler.Hashtags)
	v1.Get("/explore/hashtags/:name", authenticator.OptionalAuth, exploreHandler.HashtagVideos)
	v1.Get("/explore/search", authenticator.OptionalAuth, exploreHandler.Search)
	v1.Get("/hashtags/trending", authenticator.OptionalAuth, hashtagsHandler.Trending)

	// Watch history (WatchHistoryController reads). All auth-required, per-user.
	// Static sub-paths only, so no keyword/param collision. NOT ported: the write
	// side (settings PATCH, clear-all + remove-video DELETE) stays in Laravel.
	v1.Get("/history", authenticator.RequireAuth, historyHandler.List)
	v1.Get("/history/summary", authenticator.RequireAuth, historyHandler.Summary)
	v1.Get("/history/continue-watching", authenticator.RequireAuth, historyHandler.ContinueWatching)
	v1.Get("/history/creators", authenticator.RequireAuth, historyHandler.Creators)
	v1.Get("/history/settings", authenticator.RequireAuth, historyHandler.GetSettings)

	// Account status + security (AccountController reads). Auth-required. NOT
	// ported: restrictions, social-accounts, authorized-apps, and all writes.
	v1.Get("/account/status", authenticator.RequireAuth, accountHandler.Status)
	v1.Get("/account/security", authenticator.RequireAuth, accountHandler.Security)
	v1.Get("/account/sessions", authenticator.RequireAuth, accountHandler.Sessions)

	v1.Get("/notifications", authenticator.RequireAuth, notificationsHandler.Index)
	v1.Get("/notifications/unread-count", authenticator.RequireAuth, notificationsHandler.UnreadCount)
	v1.Get("/notifications/:id/actors", authenticator.RequireAuth, notificationsHandler.Actors)
	v1.Post("/notifications/:id/read", authenticator.RequireAuth, notificationsHandler.MarkRead)
	v1.Post("/notifications/read-many", authenticator.RequireAuth, notificationsHandler.MarkManyRead)
	v1.Post("/notifications/read-all", authenticator.RequireAuth, notificationsHandler.MarkAllRead)
	v1.Delete("/notifications/:id", authenticator.RequireAuth, notificationsHandler.Destroy)

	addr := cfg.Host + ":" + cfg.Port
	log.Printf("listening on %s", addr)
	go func() {
		if err := app.Listen(addr); err != nil {
			log.Fatalf("server: %v", err)
		}
	}()

	// Graceful shutdown: SIGTERM/SIGINT (systemd stop/restart, Ctrl+C) drains
	// in-flight HTTP requests, stops the events consumer, and flushes any
	// in-flight NATS publishes before the process exits - so a deploy never
	// silently drops a request or an event that was mid-flight.
	sigCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	<-sigCtx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Printf("server shutdown: %v", err)
	}
	stopConsumer()
	eventsPub.Close()
	log.Println("shutdown complete")
}
