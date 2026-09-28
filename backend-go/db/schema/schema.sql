-- Read-only mirror of the relevant subset of the Laravel/Postgres schema.
-- This file is NOT executed against the database - it exists only so sqlc
-- can generate accurate Go types. The real schema lives in
-- server/database/migrations (Laravel is still the source of truth during
-- the migration). Keep this in sync with those migrations for every table
-- a Go query touches.

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(191) NOT NULL UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    date_of_birth DATE,
    country VARCHAR(100),
    location VARCHAR(255),
    bio TEXT,
    website VARCHAR(500),
    categories JSON,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason VARCHAR(255),
    saved_privacy VARCHAR(20) NOT NULL DEFAULT 'private',
    save_watch_history BOOLEAN NOT NULL DEFAULT TRUE,
    login_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    password_changed_at TIMESTAMP,
    who_can_see_liked VARCHAR(20) NOT NULL DEFAULT 'only_me',
    -- Account/profile settings (ProfileController). Nullability + defaults match
    -- the live users table, not just the migrations.
    gender VARCHAR(32),
    language VARCHAR(8) NOT NULL DEFAULT 'en',
    interests JSONB,
    email_verified_at TIMESTAMP,
    selected_country_code CHAR(2),
    detected_country_code CHAR(2),
    message_privacy VARCHAR(20) NOT NULL DEFAULT 'everyone',
    active_status BOOLEAN NOT NULL DEFAULT TRUE,
    activity_status VARCHAR(10) NOT NULL DEFAULT 'public',
    profile_discovery BOOLEAN NOT NULL DEFAULT TRUE,
    show_to_search_engines BOOLEAN NOT NULL DEFAULT FALSE,
    comment_filter BOOLEAN NOT NULL DEFAULT TRUE,
    who_can_comment VARCHAR(20) NOT NULL DEFAULT 'everyone',
    who_can_tag VARCHAR(20) NOT NULL DEFAULT 'friends',
    who_can_duet VARCHAR(20) NOT NULL DEFAULT 'friends',
    who_can_download VARCHAR(20) NOT NULL DEFAULT 'everyone',
    profile_view_history BOOLEAN NOT NULL DEFAULT TRUE,
    profile_view_privacy VARCHAR(20) NOT NULL DEFAULT 'everyone',
    notification_preferences JSON,
    content_preferences JSON,
    accessibility_preferences JSON,
    appearance_preferences JSON,
    messages_preferences JSON,
    wellbeing_preferences JSON,
    ai_preferences JSON,
    family_preferences JSON,
    family_pin VARCHAR(255),
    remember_token VARCHAR(100),
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT,
    two_factor_confirmed_at TIMESTAMP,
    last_login_at TIMESTAMP,
    last_active_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE personal_access_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tokenable_type VARCHAR(255) NOT NULL,
    tokenable_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    abilities TEXT,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE videos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    title VARCHAR(255),
    caption TEXT,
    category VARCHAR(100),
    location VARCHAR(255),
    language VARCHAR(10) DEFAULT 'en',
    video_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    duration SMALLINT,
    file_size BIGINT,
    width SMALLINT,
    height SMALLINT,
    audio_track_id BIGINT,
    custom_audio_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    moderation_status VARCHAR(20),
    scheduled_at TIMESTAMP,
    allow_comments BOOLEAN NOT NULL DEFAULT TRUE,
    allow_duet BOOLEAN NOT NULL DEFAULT TRUE,
    allow_stitch BOOLEAN NOT NULL DEFAULT TRUE,
    allow_download BOOLEAN NOT NULL DEFAULT FALSE,
    views_count BIGINT NOT NULL DEFAULT 0,
    likes_count BIGINT NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    saves_count INTEGER NOT NULL DEFAULT 0,
    allow_sharing BOOLEAN NOT NULL DEFAULT TRUE,
    shares_count INTEGER NOT NULL DEFAULT 0,
    is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    mime_type VARCHAR(100),
    media_items JSON,
    quality_urls JSON,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    pinned_at TIMESTAMP,
    is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
    music_track_id BIGINT,
    audio_type VARCHAR(20),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE hashtags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    videos_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE video_hashtags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    hashtag_id BIGINT NOT NULL REFERENCES hashtags(id)
);

CREATE TABLE video_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    user_id BIGINT REFERENCES users(id),
    session_id VARCHAR(64),
    event_type VARCHAR(30) NOT NULL,
    payload JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE user_video_preferences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    pref_type VARCHAR(20) NOT NULL,
    pref_value VARCHAR(100) NOT NULL,
    weight NUMERIC(6, 3) NOT NULL DEFAULT 1.000,
    interaction_count INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (user_id, pref_type, pref_value)
);

CREATE TABLE rate_limits (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    identifier VARCHAR(191) NOT NULL,
    identifier_type VARCHAR(20) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMP,
    blocked_until TIMESTAMP,
    block_level SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (identifier, identifier_type, action_type)
);

CREATE TABLE followers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    follower_id BIGINT NOT NULL REFERENCES users(id),
    following_id BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'accepted',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (follower_id, following_id)
);

CREATE TABLE blocked_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    blocker_id BIGINT NOT NULL REFERENCES users(id),
    blocked_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE profiles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
    location VARCHAR(255),
    website VARCHAR(500),
    joined_label VARCHAR(50),
    category VARCHAR(100),
    creator_badge VARCHAR(50),
    total_followers INTEGER NOT NULL DEFAULT 0,
    total_following INTEGER NOT NULL DEFAULT 0,
    total_likes BIGINT NOT NULL DEFAULT 0,
    total_videos INTEGER NOT NULL DEFAULT 0,
    profile_views BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Partial mirror: only the column this domain's queries touch. Extend with
-- the rest of user_moderation_settings' real columns when a future domain
-- needs them (see server/database/migrations/2026_05_30_300001_create_user_360_tables.php).
CREATE TABLE user_moderation_settings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
    disable_following_others BOOLEAN NOT NULL DEFAULT FALSE,
    disable_commenting_on_others BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE comment_restricted_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creator_id BIGINT NOT NULL REFERENCES users(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE user_hidden_words (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    word VARCHAR(255) NOT NULL,
    type VARCHAR(30),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE video_likes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (video_id, user_id)
);

CREATE TABLE video_saves (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (video_id, user_id)
);

CREATE TABLE video_shares (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    user_id BIGINT REFERENCES users(id),
    platform VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Laravel models `reason`/`status` as varchar+CHECK enums (Postgres has no
-- native ENUM here). Note the table has NO updated_at - created_at only.
CREATE TABLE video_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    reporter_id BIGINT NOT NULL REFERENCES users(id),
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by BIGINT REFERENCES users(id),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE video_comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    parent_id BIGINT REFERENCES video_comments(id),
    root_id BIGINT,
    body TEXT NOT NULL,
    gif_url VARCHAR(500),
    gif_preview_url VARCHAR(500),
    gif_provider VARCHAR(50),
    gif_provider_id VARCHAR(100),
    image_path VARCHAR(500),
    comment_rank SMALLINT,
    likes_count INTEGER NOT NULL DEFAULT 0,
    dislike_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    reaction_score INTEGER NOT NULL DEFAULT 0,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    pin_order INTEGER,
    pinned_at TIMESTAMP,
    pinned_by BIGINT REFERENCES users(id),
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMP,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    is_spam BOOLEAN NOT NULL DEFAULT FALSE,
    held_for_review BOOLEAN NOT NULL DEFAULT FALSE,
    creator_seen_at TIMESTAMP,
    creator_note TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE comment_reactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comment_id BIGINT NOT NULL REFERENCES video_comments(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    reaction_type VARCHAR(10) NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (comment_id, user_id)
);

CREATE TABLE video_scores (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL UNIQUE REFERENCES videos(id),
    score NUMERIC(10, 4) NOT NULL DEFAULT 0,
    completion_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    rewatch_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    like_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    comment_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    share_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    save_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    follow_score NUMERIC(8, 4) NOT NULL DEFAULT 0,
    skip_penalty NUMERIC(8, 4) NOT NULL DEFAULT 0,
    report_penalty NUMERIC(8, 4) NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    computed_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- IG/TikTok-style aggregated notifications. `type` started as an enum but was
-- widened to varchar(100) (migration 2026_06_10_200001). Timestamps are managed
-- explicitly by NotificationService, not Eloquent: created_at is DB-defaulted,
-- latest_activity_at/updated_at are bumped on every aggregation. No updated_at
-- default - a fresh row without an explicit value keeps it NULL.
CREATE TABLE notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    actor_id BIGINT REFERENCES users(id),
    actor_count INTEGER NOT NULL DEFAULT 1,
    type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id BIGINT,
    comment_id BIGINT,
    message VARCHAR(500),
    is_read BOOLEAN NOT NULL DEFAULT false,
    action_status VARCHAR(20),
    latest_activity_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP
);

CREATE TABLE notification_actors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notification_id BIGINT NOT NULL REFERENCES notifications(id),
    actor_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (notification_id, actor_id)
);

-- Partial mirrors: only the columns VideoResource reads. Extend as future
-- domains need more (see the user_moderation_settings note above).

CREATE TABLE audio_tracks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255)
);

-- Partial mirror. The real table has ~48 columns (rights, ISRC, waveform,
-- bitrate...); these are the ones the ported music endpoints actually read.
CREATE TABLE music_tracks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist_name VARCHAR(255),
    album VARCHAR(255),
    cover_url VARCHAR(255),
    audio_url VARCHAR(255),
    duration INTEGER,
    plays_count BIGINT NOT NULL DEFAULT 0,
    uses_count BIGINT NOT NULL DEFAULT 0,
    source_type VARCHAR(20) NOT NULL DEFAULT 'library',
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    genre VARCHAR(255),
    mood VARCHAR(255),
    language VARCHAR(255),
    license_type VARCHAR(255),
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    recommended BOOLEAN NOT NULL DEFAULT FALSE,
    allow_reels BOOLEAN NOT NULL DEFAULT TRUE,
    allow_stories BOOLEAN NOT NULL DEFAULT TRUE,
    show_in_studio BOOLEAN NOT NULL DEFAULT TRUE,
    show_in_upload_picker BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_admin_id BIGINT,
    source_video_id BIGINT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE music_play_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    track_id BIGINT NOT NULL REFERENCES music_tracks(id),
    user_id BIGINT REFERENCES users(id),
    source VARCHAR(255),
    played_at TIMESTAMP
);

CREATE TABLE music_usages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    track_id BIGINT NOT NULL REFERENCES music_tracks(id),
    user_id BIGINT REFERENCES users(id),
    content_id BIGINT,
    content_type VARCHAR(255),
    used_at TIMESTAMP
);

CREATE TABLE video_views (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_id BIGINT NOT NULL REFERENCES videos(id),
    user_id BIGINT REFERENCES users(id),
    watch_duration SMALLINT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE social_links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    platform VARCHAR(20) NOT NULL,
    url VARCHAR(500) NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (user_id, platform)
);

-- Partial mirror: only the columns the has_story check reads.
CREATE TABLE stories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    caption TEXT,
    visibility VARCHAR(20) NOT NULL DEFAULT 'everyone',
    allow_replies BOOLEAN NOT NULL DEFAULT TRUE,
    allow_resharing BOOLEAN NOT NULL DEFAULT TRUE,
    save_to_archive BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    location VARCHAR(255),
    link VARCHAR(500),
    expires_at TIMESTAMP,
    created_at TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Also backs "Tag people": rows with source_type='tag', source_id=video.id.
CREATE TABLE comment_mentions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mentioned_user_id BIGINT NOT NULL REFERENCES users(id),
    mentioned_by_user_id BIGINT NOT NULL REFERENCES users(id),
    source_type VARCHAR(20) NOT NULL,
    source_id BIGINT NOT NULL,
    video_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE highlights (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    title VARCHAR(100) NOT NULL,
    cover_url VARCHAR(500),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE creator_levels (
    id SMALLINT PRIMARY KEY,
    level_name VARCHAR(100) NOT NULL,
    min_xp INTEGER NOT NULL,
    max_xp INTEGER,
    badge_color VARCHAR(7),
    icon_url VARCHAR(500),
    perks JSON
);

CREATE TABLE creator_progress (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
    current_level_id SMALLINT NOT NULL DEFAULT 1 REFERENCES creator_levels(id),
    current_xp INTEGER NOT NULL DEFAULT 0,
    total_xp_earned INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Partial mirror: the DM read surface (conversations list, requests, unread
-- count). The write side (send/edit/pin/forward) and history stay in Laravel -
-- they fan out over Centrifugo via RealtimeBus, a deferred cross-service dep.
-- Only the columns those three reads touch are mirrored.
CREATE TABLE direct_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id BIGINT,
    sender_id BIGINT NOT NULL REFERENCES users(id),
    receiver_id BIGINT NOT NULL REFERENCES users(id),
    body TEXT,
    message_type VARCHAR(20),
    read_at TIMESTAMP,
    delivered_at TIMESTAMP,
    story_id BIGINT,
    story_thumbnail_url VARCHAR(1000),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE conversations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_a_id BIGINT NOT NULL REFERENCES users(id),
    user_b_id BIGINT NOT NULL REFERENCES users(id),
    initiated_by BIGINT NOT NULL REFERENCES users(id),
    received_by BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL,
    approved_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Partial mirror: the stories READ surface (feed, active-user-ids). The write
-- and action paths (store/view/react/reply/report) stay in Laravel - they write
-- media, notify via NotificationService and record views. The stories table
-- itself is expanded above (it already had a has_story stub); these are the
-- related tables the feed serializer joins.
CREATE TABLE story_media (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    media_type VARCHAR(20) NOT NULL,
    media_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    duration_seconds SMALLINT,
    order_index SMALLINT NOT NULL,
    source_type VARCHAR(20) NOT NULL,
    shared_video_id BIGINT
);

CREATE TABLE story_layers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    slide_index SMALLINT NOT NULL,
    type VARCHAR(20) NOT NULL,
    text TEXT,
    url VARCHAR(500),
    mentioned_user_id BIGINT,
    hashtag VARCHAR(255),
    location_name VARCHAR(255),
    x_percent NUMERIC NOT NULL,
    y_percent NUMERIC NOT NULL,
    scale_value NUMERIC NOT NULL,
    rotation NUMERIC NOT NULL,
    color VARCHAR(20) NOT NULL,
    font VARCHAR(50) NOT NULL,
    z_index SMALLINT NOT NULL
);

CREATE TABLE story_views (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    viewer_id BIGINT NOT NULL REFERENCES users(id),
    viewed_at TIMESTAMP NOT NULL,
    -- Story analytics (added by Laravel migrations 2026_08_08): the UNIQUE
    -- viewer row doubles as the per-viewer analytics accumulator. Re-watches
    -- increment view_events / watch_duration on this one row; per-watch slide
    -- detail lives in story_view_events.
    story_owner_id BIGINT REFERENCES users(id),
    platform VARCHAR(20),
    device VARCHAR(120),
    session_id VARCHAR(64),
    view_events BIGINT NOT NULL DEFAULT 1,
    watch_duration BIGINT NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    last_viewed_at TIMESTAMP,
    UNIQUE (story_id, viewer_id)
);
CREATE INDEX idx_story_views_story_owner_id ON story_views (story_owner_id);
CREATE INDEX idx_story_views_viewed_at ON story_views (viewed_at);

-- Append-only per-watch/per-slide detail (drop-off + completion live here).
CREATE TABLE story_view_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    viewer_id BIGINT NOT NULL REFERENCES users(id),
    story_owner_id BIGINT NOT NULL REFERENCES users(id),
    story_media_id BIGINT,
    slide_index SMALLINT NOT NULL DEFAULT 0,
    platform VARCHAR(20),
    device VARCHAR(120),
    session_id VARCHAR(64),
    watch_duration BIGINT NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_story_view_events_story_slide ON story_view_events (story_id, slide_index);
CREATE INDEX idx_story_view_events_viewer_id ON story_view_events (viewer_id);
CREATE INDEX idx_story_view_events_owner_id ON story_view_events (story_owner_id);
CREATE INDEX idx_story_view_events_created_at ON story_view_events (created_at);

-- A share is an EVENT, never deduplicated - unlike a view.
CREATE TABLE story_shares (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    sharer_id BIGINT NOT NULL REFERENCES users(id),
    story_owner_id BIGINT NOT NULL REFERENCES users(id),
    channel VARCHAR(20) NOT NULL DEFAULT 'copy_link',
    target_user_id BIGINT,
    platform VARCHAR(20),
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_story_shares_story_id ON story_shares (story_id);
CREATE INDEX idx_story_shares_sharer_id ON story_shares (sharer_id);
CREATE INDEX idx_story_shares_owner_id ON story_shares (story_owner_id);

-- DERIVED rollup - never a source of truth, recomputed by aggregate.
CREATE TABLE story_analytics (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL UNIQUE REFERENCES stories(id),
    story_owner_id BIGINT NOT NULL REFERENCES users(id),
    unique_viewers BIGINT NOT NULL DEFAULT 0,
    reaction_count BIGINT NOT NULL DEFAULT 0,
    reply_count BIGINT NOT NULL DEFAULT 0,
    share_count BIGINT NOT NULL DEFAULT 0,
    total_view_events BIGINT NOT NULL DEFAULT 0,
    completion_count BIGINT NOT NULL DEFAULT 0,
    total_watch_seconds BIGINT NOT NULL DEFAULT 0,
    reactions_breakdown JSONB,
    recomputed_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
CREATE INDEX idx_story_analytics_owner_id ON story_analytics (story_owner_id);

CREATE TABLE story_reactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    reaction_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP,
    UNIQUE (story_id, user_id)
);

CREATE TABLE story_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    sender_id BIGINT NOT NULL REFERENCES users(id),
    receiver_id BIGINT NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE story_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_id BIGINT NOT NULL REFERENCES stories(id),
    reporter_id BIGINT NOT NULL REFERENCES users(id),
    reason VARCHAR(100) NOT NULL DEFAULT 'inappropriate',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL,
    UNIQUE (story_id, reporter_id)
);

-- ── Wallet & coins (StudioWalletCoinsController read surface) ──────────────
CREATE TABLE wallets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    coins_balance BIGINT NOT NULL DEFAULT 0,
    gift_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
    subscription_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
    ad_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0,
    bonus_coin_balance BIGINT NOT NULL DEFAULT 0,
    earned_coin_balance BIGINT NOT NULL DEFAULT 0,
    wallet_balance_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    pending_balance_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_received_coins BIGINT NOT NULL DEFAULT 0,
    total_commission_coins BIGINT NOT NULL DEFAULT 0,
    total_net_earned_coins BIGINT NOT NULL DEFAULT 0,
    total_spent_coins BIGINT NOT NULL DEFAULT 0,
    total_purchased_coins BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE wallet_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wallet_id BIGINT NOT NULL REFERENCES wallets(id),
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description VARCHAR(255),
    reference_id VARCHAR(100),
    created_at TIMESTAMP NOT NULL,
    gross_coins BIGINT NOT NULL DEFAULT 0,
    commission_coins BIGINT NOT NULL DEFAULT 0,
    net_coins BIGINT NOT NULL DEFAULT 0,
    balance_after_coins BIGINT NOT NULL DEFAULT 0,
    wallet_balance_after_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    metadata JSON
);

CREATE TABLE coin_packages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_name VARCHAR(100) NOT NULL,
    coins BIGINT NOT NULL,
    price_usd NUMERIC(10,2) NOT NULL,
    badge VARCHAR(50),
    icon VARCHAR(100),
    is_front_visible BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    ios_product_id VARCHAR(191),
    android_product_id VARCHAR(191),
    icon_url VARCHAR(512),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE admin_coin_settings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- ── Gifts catalog + premium subscriptions (read surface) ──────────────────
CREATE TABLE gifts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon_url VARCHAR(500),
    coin_value INTEGER NOT NULL,
    cash_value NUMERIC(8,4) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    slug VARCHAR(64),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    plan VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL DEFAULT 'active',
    price NUMERIC(8,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    started_at TIMESTAMP,
    expires_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    iap_transaction_id VARCHAR(255),
    iap_platform VARCHAR(10),
    -- Which tier. Null on every pre-tier row, meaning the single old product.
    -- server/database/migrations/2026_08_07_000014_add_plan_key_to_subscriptions_table.php
    plan_key VARCHAR(255)
);

-- ── Premium page catalogue (read surface) ─────────────────────────────────
-- Real schema: server/database/migrations/2026_08_07_0000{10,11,12,13}_*.php
-- Written only by the admin panel; Go reads it for GET /premium.
CREATE TABLE subscription_plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    tagline VARCHAR(255),
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'NPR',
    period VARCHAR(16) NOT NULL DEFAULT 'month',
    features JSONB,
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    badge_label VARCHAR(255),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    theme VARCHAR(16) NOT NULL DEFAULT 'light',
    ios_product_id VARCHAR(255),
    android_product_id VARCHAR(255),
    sort INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE premium_features (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    icon VARCHAR(64) NOT NULL DEFAULT 'sparkles',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    badge VARCHAR(24),
    sort INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE premium_comparisons (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    -- Keyed by subscription_plans.key; an absent key means "not included".
    values JSONB,
    highlight_plan VARCHAR(255),
    sort INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE premium_faqs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question VARCHAR(255) NOT NULL,
    answer TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Cache of Wikimedia (Wikipedia) summaries. Real schema:
-- server/database/migrations/2026_08_06_000001_create_wikipedia_articles_table.php
-- Written by internal/knowledge; nothing in Laravel touches it.
CREATE TABLE wikipedia_articles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lookup_key VARCHAR(255) NOT NULL,
    lang VARCHAR(10) NOT NULL DEFAULT 'en',
    title VARCHAR(255),
    summary TEXT,
    thumbnail_url VARCHAR(1000),
    article_url VARCHAR(1000),
    not_found BOOLEAN NOT NULL DEFAULT FALSE,
    fetched_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE (lookup_key, lang)
);
