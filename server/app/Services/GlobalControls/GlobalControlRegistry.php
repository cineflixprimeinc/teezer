<?php

namespace App\Services\GlobalControls;

/**
 * Declared schema for Global Teezer Control - the platform-wide capability
 * kill switches surfaced at Admin > Settings > Global Teezer Control.
 *
 * Same rule as PlatformSettings (see its docblock): a key that isn't listed
 * here cannot be set, read as enabled, or rendered in the admin UI. This is
 * what stops the feature from becoming a second copy of the seventeen dead
 * `feature_*` flags in app_settings - every key below is wired to a real
 * enforcement point, named in its `enforcement` string, and nothing is added
 * here without one.
 *
 * A handful of toggles requested in the original spec are still NOT listed,
 * because building a real enforcement point for them would mean building an
 * entire new subsystem, not wiring a switch onto an existing action:
 * phone/OTP registration (no SMS provider integrated), group conversations
 * (messaging is 1:1 only - no group schema exists), friend requests (this
 * product's social graph is follow-based, not mutual-friend-based), PK
 * battles / live guest co-hosting (no such feature exists in the live
 * pipeline), and peer-to-peer wallet transfers (`WalletController` is a
 * literal read-only stub with no ledger/transfer logic - inventing money
 * movement here would be a real financial-risk feature, not a toggle).
 * Blocking is also deliberately excluded, per the original spec's own
 * instruction never to let this be disabled. The build report accompanying
 * this feature lists each omission and why.
 *
 * `critical` controls whether the admin UI's confirmation modal is shown.
 * `requiresReason` controls whether that modal requires a typed reason
 * before the change is accepted (both server- and client-enforced).
 * `default` is what the platform does TODAY with no restriction configured -
 * true for every ordinary capability, per PlatformSettings' "never default an
 * open feature to closed" rule. The emergency-category switches are the only
 * `false` defaults, because they are additive restrictions that do not exist
 * today.
 */
class GlobalControlRegistry
{
    public const CATEGORY_AUTHENTICATION = 'authentication';
    public const CATEGORY_USER_ACTIVITY  = 'user_activity';
    public const CATEGORY_CONTENT        = 'content';
    public const CATEGORY_LIVE_SPACES    = 'live_spaces';
    public const CATEGORY_MESSAGING      = 'messaging';
    public const CATEGORY_ACCOUNT        = 'account';
    public const CATEGORY_MONETIZATION   = 'monetization';
    public const CATEGORY_STUDIO         = 'studio';
    public const CATEGORY_DISCOVERY      = 'discovery';
    public const CATEGORY_SAFETY         = 'safety';
    public const CATEGORY_NOTIFICATIONS  = 'notifications';
    public const CATEGORY_EMERGENCY      = 'emergency';

    /**
     * @return array<string, array{
     *   category: string, label: string, description: string,
     *   default: bool, critical: bool, requiresReason: bool,
     *   platforms: list<string>, enforcement: string,
     * }>
     */
    public static function schema(): array
    {
        return [

            // ── Authentication ──────────────────────────────────────────
            'login_enabled' => [
                'category' => self::CATEGORY_AUTHENTICATION,
                'label' => 'Allow existing users to login',
                'description' => 'Existing users can sign in to their accounts.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /auth/login, POST /login (website), social login existing-user branch',
            ],
            'signup_enabled' => [
                'category' => self::CATEGORY_AUTHENTICATION,
                'label' => 'Allow new user registration',
                'description' => 'Let new users create a Teezer account.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /auth/register, POST /register (website), social login new-account branch, signup OTP',
            ],
            'block_new_accounts' => [
                'category' => self::CATEGORY_AUTHENTICATION,
                'label' => 'Block all new account creation',
                'description' => 'Prevent account creation via every method: email, social, and the website.',
                'default' => false, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'Same choke points as signup_enabled; also usable as the Emergency Registration Block',
            ],
            'social_signup_enabled' => [
                'category' => self::CATEGORY_AUTHENTICATION,
                'label' => 'Allow social accounts to create new users',
                'description' => 'Google, Apple, Facebook and TikTok sign-in may create a new account. Existing linked accounts can still log in.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'ApiAuthController::completeSocial() new-account branch only',
            ],

            // ── User Activity ───────────────────────────────────────────
            'likes_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to like content',
                'description' => 'Users can like videos and comments.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST/DELETE /videos/{id}/like, /toggle-like, comment like/unlike',
            ],
            'following_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to follow users',
                'description' => 'Users can follow creators and other users. Unfollowing always stays available.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /users/{username}/follow',
            ],
            'comments_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to comment',
                'description' => 'Users can post comments and replies on eligible content. Existing comments remain visible.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /videos/{id}/comments (also serves replies via parent_id)',
            ],
            'mentions_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to mention users',
                'description' => '@mentions inside comments notify the mentioned user. Turning this off stops mention notifications; the comment itself still posts.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'CommentController::store() mention-processing step',
            ],
            'share_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to share content',
                'description' => 'Users (and guests) can share videos.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /videos/{id}/share',
            ],
            'save_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to save content',
                'description' => 'Users can save videos to their collection.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST/DELETE /videos/{id}/save, /toggle-save',
            ],
            'search_enabled' => [
                'category' => self::CATEGORY_USER_ACTIVITY,
                'label' => 'Allow users to search',
                'description' => 'Users can search for content, hashtags, sounds and people.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'GET /search, /explore/search, /users/search, /audio/search',
            ],

            // ── Content ──────────────────────────────────────────────────
            'uploads_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow users to upload content',
                'description' => 'Global upload switch. Existing content stays up; only new uploads are blocked.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /videos/upload-url, /complete-upload, /videos (legacy), /upload/multipart/*, /stories',
            ],
            'photo_uploads_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow photo uploads',
                'description' => 'Photo/image posts specifically, independent of video uploads.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'VideoController::uploadUrl()/completeUpload() image-mimetype branch',
            ],
            'video_uploads_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow video uploads',
                'description' => 'Video posts specifically, independent of photo uploads.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'VideoController::uploadUrl()/completeUpload() video-mimetype branch',
            ],
            'gif_uploads_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow GIF uploads',
                'description' => 'Animated GIF stories specifically. GIFs are not a distinct type at the main video/photo post endpoint - only Stories accept the .gif extension.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'StoryController::store() image/gif mimetype branch',
            ],
            'content_viewing_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow users to view public content',
                'description' => 'Major platform restriction. Gates view-tracking on content; browsing/feeds are unaffected by this pass.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /videos/{id}/view (partial coverage - see build report)',
            ],
            'content_editing_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow content editing',
                'description' => 'Creators can edit their own published video (caption, status, hashtags, comment/duet/stitch settings).',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'PUT /videos/{id} (owner-only)',
            ],
            'content_deletion_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow content deletion',
                'description' => 'Creators can delete their own video (soft-delete; the underlying file is kept).',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'DELETE /videos/{id} (owner-only)',
            ],
            'draft_creation_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow draft creation',
                'description' => 'Publishing with status=draft. There is no separate "save as draft" endpoint - draft is one value of the normal publish endpoint\'s status field.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /videos/complete-upload, status=draft branch',
            ],
            'hashtag_creation_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow hashtag creation',
                'description' => 'Posting with a hashtag that does not exist yet creates it. When off, a new hashtag is simply not attached; already-existing hashtags keep working normally and the post still succeeds.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'VideoService::syncHashtags() - Hashtag::firstOrCreate() call',
            ],
            'external_links_enabled' => [
                'category' => self::CATEGORY_CONTENT,
                'label' => 'Allow external links on posts',
                'description' => 'The optional link_url a creator can attach to a video at publish time.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /videos/complete-upload, link_url field',
            ],

            // ── Live & Spaces ────────────────────────────────────────────
            'live_create_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow users to create Live Streams',
                'description' => 'Creators can start new live streams. Streams already live are unaffected.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /studio/live, POST /studio/live/{id}/start',
            ],
            'live_watch_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow users to watch/join Live Streams',
                'description' => 'Viewers can join a live stream as an audience member.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /live-streams/{id}/join',
            ],
            'live_comments_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow Live Comments',
                'description' => 'Viewers can post chat messages in a live stream, separate from ordinary video comments.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /live-streams/{id}/messages',
            ],
            'live_gifts_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow Live Gifts',
                'description' => 'Sending a gift while a live_stream_id is attached to the request, in addition to the general Gifts switch.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /gifts/send, only when live_stream_id is present',
            ],
            'spaces_create_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow users to create Spaces',
                'description' => 'Users can start a new audio Space.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /spaces',
            ],
            'spaces_join_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow users to join/listen to Spaces',
                'description' => 'Users can join an existing Space. Listening is the same action as joining - there is no separate listen-only endpoint.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /spaces/{space}/join',
            ],
            'spaces_speak_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow users to speak in Spaces',
                'description' => 'Listeners can raise their hand to request the speaker role.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /spaces/{space}/request-speak, /cancel-request',
            ],
            'spaces_moderation_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow Space moderation',
                'description' => 'Hosts/moderators can promote, demote, mute, remove or block a participant, manage co-moderators, and approve or decline speak requests.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /spaces/{space}/moderation/{user}/*, /requests/{user}/approve|decline',
            ],
            'spaces_invitations_enabled' => [
                'category' => self::CATEGORY_LIVE_SPACES,
                'label' => 'Allow Space invitations',
                'description' => 'A host or speaker can invite a specific user to join their Space (sends an in-app notification with a join link). Built for this feature - no invite endpoint existed before.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /spaces/{space}/invite',
            ],

            // ── Messaging ────────────────────────────────────────────────
            'direct_messages_enabled' => [
                'category' => self::CATEGORY_MESSAGING,
                'label' => 'Allow Direct Messages',
                'description' => 'Users can send direct messages and start new conversations (the same endpoint serves both). Existing messages stay accessible.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /messages/conversations/{userId}',
            ],
            'message_attachments_enabled' => [
                'category' => self::CATEGORY_MESSAGING,
                'label' => 'Allow Message Attachments',
                'description' => 'Users can attach media to direct messages.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /messages/upload-url',
            ],
            'voice_messages_enabled' => [
                'category' => self::CATEGORY_MESSAGING,
                'label' => 'Allow Voice Messages',
                'description' => 'Voice notes specifically, a distinct message/attachment type from other messages.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /messages/upload-url and /messages/conversations/{userId}, media_type=voice',
            ],

            // ── Account ──────────────────────────────────────────────────
            'profile_editing_enabled' => [
                'category' => self::CATEGORY_ACCOUNT,
                'label' => 'Allow users to edit profiles',
                'description' => 'Covers username, display name, bio, website and privacy - one shared endpoint updates all of these together today.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'PUT /profile',
            ],
            'profile_image_changes_enabled' => [
                'category' => self::CATEGORY_ACCOUNT,
                'label' => 'Allow profile image changes',
                'description' => 'Users can change or remove their avatar.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST/DELETE /profile/avatar',
            ],
            'social_links_enabled' => [
                'category' => self::CATEGORY_ACCOUNT,
                'label' => 'Allow social links changes',
                'description' => 'The multi-link social/website list on a profile, separate from the single profile-edit endpoint.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'PUT /profile/social-links',
            ],

            // ── Monetization ─────────────────────────────────────────────
            'gifts_enabled' => [
                'category' => self::CATEGORY_MONETIZATION,
                'label' => 'Allow Gifts',
                'description' => 'Users can send gifts. Existing balances are never touched by this switch.',
                'default' => true, 'critical' => true, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /gifts/send',
            ],
            'coin_purchases_enabled' => [
                'category' => self::CATEGORY_MONETIZATION,
                'label' => 'Allow Coin Purchases',
                'description' => 'Users can buy coins via card, PayPal, Razorpay, Stripe or in-app purchase.',
                'default' => true, 'critical' => true, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /studio/wallets-coins/orders* and /iap/verify',
            ],
            'withdrawals_enabled' => [
                'category' => self::CATEGORY_MONETIZATION,
                'label' => 'Allow Withdrawals',
                'description' => 'Creators can request a payout of their balance. Existing balances are never touched by this switch.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /studio/monetization/withdraw',
            ],
            'creator_subscriptions_enabled' => [
                'category' => self::CATEGORY_MONETIZATION,
                'label' => 'Allow Creator Subscriptions',
                'description' => 'New creator/paid subscriptions can be started. Cancelling an existing subscription always stays available.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /studio/subscriptions/intent, /capture/*  (cancel is never gated)',
            ],
            'creator_rewards_enabled' => [
                'category' => self::CATEGORY_MONETIZATION,
                'label' => 'Allow Creator Rewards',
                'description' => 'Joining the waitlist for the Creator Rewards programme (currently coming-soon).',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /studio/monetization/programs/rewards/waitlist',
            ],
            'gift_animations_enabled' => [
                'category' => self::CATEGORY_MONETIZATION,
                'label' => 'Allow Gift Animations',
                'description' => 'Pure client-rendering preference - whether the app plays a gift\'s animation. There is no server action to reject here, so this is exposed via the public config for clients to read and honour voluntarily, not enforced by rejecting a request.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios'],
                'enforcement' => 'Public config only - client-side rendering choice, no server-side action exists to gate',
            ],

            // ── Studio ───────────────────────────────────────────────────
            'studio_enabled' => [
                'category' => self::CATEGORY_STUDIO,
                'label' => 'Allow users to access Teezer Studio',
                'description' => 'Master switch for the entire Studio API - dashboard, live, monetization, wallets/coins, subscriptions and Studio settings.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'Every /studio/* route (new middleware group gate - none existed before this feature)',
            ],

            // ── Discovery ────────────────────────────────────────────────
            // search_enabled (above, User Activity) already covers Explore
            // search, hashtag search, music search and user search - listed
            // once rather than duplicated as four near-identical keys.
            'explore_enabled' => [
                'category' => self::CATEGORY_DISCOVERY,
                'label' => 'Allow Explore',
                'description' => 'Browsing the Explore tab: featured, categories, sounds, tags, hashtag pages and top creators.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'GET /explore/featured, /categories, /sounds, /tags, /hashtags, /hashtags/{name}, /top-creators',
            ],
            'trending_enabled' => [
                'category' => self::CATEGORY_DISCOVERY,
                'label' => 'Allow Trending',
                'description' => 'The Trending surface specifically, backed by a distinct scorer from the recommendation feed.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'GET /videos/trending, /explore/trending',
            ],
            'recommendation_feed_enabled' => [
                'category' => self::CATEGORY_DISCOVERY,
                'label' => 'Allow Recommendation Feed',
                'description' => 'The "For You" recommended feed specifically.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'GET /feed/for-you, /videos/feed',
            ],

            // ── Safety & Reporting ───────────────────────────────────────
            // Blocking is intentionally not listed - the original spec's own
            // instruction is to never let this be disabled.
            'report_content_enabled' => [
                'category' => self::CATEGORY_SAFETY,
                'label' => 'Allow users to report content',
                'description' => 'Reporting a video, comment, live stream or Space. Safety controls default ON.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /videos/{id}/report, /comments/{id}/report, /live-streams/{id}/report, /spaces/{space}/report',
            ],
            'report_users_enabled' => [
                'category' => self::CATEGORY_SAFETY,
                'label' => 'Allow users to report users',
                'description' => 'Reporting a user account. Safety controls default ON.',
                'default' => true, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'POST /users/{username}/report',
            ],
            'mute_users_enabled' => [
                'category' => self::CATEGORY_SAFETY,
                'label' => 'Allow users to mute users',
                'description' => 'Muting suppresses a user\'s content from your own recommendation feed without unfollowing or blocking them. Built for this feature - no account-wide mute existed before (only per-conversation and Space mic mute). Turning this off only stops NEW mutes; existing mutes keep working.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /users/{username}/mute',
            ],
            'appeal_submission_enabled' => [
                'category' => self::CATEGORY_SAFETY,
                'label' => 'Allow appeal submission',
                'description' => 'Submitting an appeal against a moderation strike. Built for this feature - the appeal_status/appeal_note fields already existed on CreatorStrike, but no user-facing submit endpoint did.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'POST /moderation/appeal',
            ],

            // ── Notifications ────────────────────────────────────────────
            'push_notifications_enabled' => [
                'category' => self::CATEGORY_NOTIFICATIONS,
                'label' => 'Allow Push Notifications',
                'description' => 'The platform will not send push notifications while this is off. Pending notifications are never deleted.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['android', 'ios'],
                'enforcement' => 'PushService::fanOut() (the single FCM/APNs dispatch point)',
            ],
            'in_app_notifications_enabled' => [
                'category' => self::CATEGORY_NOTIFICATIONS,
                'label' => 'Allow In-App Notifications',
                'description' => 'The bell/notifications feed itself. Existing notifications already delivered are never deleted.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'NotificationService::notify() - the AppNotification write path',
            ],
            'email_notifications_enabled' => [
                'category' => self::CATEGORY_NOTIFICATIONS,
                'label' => 'Allow Email Notifications',
                'description' => 'System/admin-action emails and monetization-availability emails - the only two places this codebase actually sends a notification email today. Most interaction types (likes, comments, follows) never email at all, with or without this switch.',
                'default' => true, 'critical' => false, 'requiresReason' => false,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'AdminMessagesController::notifyUser(), AdminUser360Controller admin-action emails, ProgramWaitlistNotifier::announce()',
            ],

            // ── Platform Emergency Controls ─────────────────────────────
            'maintenance_mode' => [
                'category' => self::CATEGORY_EMERGENCY,
                'label' => 'Maintenance Mode',
                'description' => 'Every non-exempt API request receives 503 Service Unavailable. Admin routes stay reachable so this can be turned back off.',
                'default' => false, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'EnsureGlobalControlEnabled middleware, platform-wide',
            ],
            'read_only_mode' => [
                'category' => self::CATEGORY_EMERGENCY,
                'label' => 'Read-Only Platform',
                'description' => 'Every non-GET API request is rejected. Admin routes and login stay writable.',
                'default' => false, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'EnsureGlobalControlEnabled middleware, platform-wide',
            ],
            'emergency_upload_block' => [
                'category' => self::CATEGORY_EMERGENCY,
                'label' => 'Emergency Upload Block',
                'description' => 'Immediately blocks all uploads, in addition to the Content > Allow uploads switch.',
                'default' => false, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['website', 'android', 'ios', 'api'],
                'enforcement' => 'Same choke points as uploads_enabled',
            ],
            'emergency_live_block' => [
                'category' => self::CATEGORY_EMERGENCY,
                'label' => 'Emergency Live Block',
                'description' => 'Immediately blocks new live streams, in addition to the Live > Allow Live Streams switch.',
                'default' => false, 'critical' => true, 'requiresReason' => true,
                'platforms' => ['android', 'ios', 'api'],
                'enforcement' => 'Same choke points as live_create_enabled',
            ],
        ];
    }

    public static function categories(): array
    {
        return [
            self::CATEGORY_AUTHENTICATION => 'Authentication',
            self::CATEGORY_USER_ACTIVITY  => 'User Activity',
            self::CATEGORY_CONTENT        => 'Content',
            self::CATEGORY_LIVE_SPACES    => 'Live & Spaces',
            self::CATEGORY_MESSAGING      => 'Messaging',
            self::CATEGORY_ACCOUNT        => 'Account',
            self::CATEGORY_MONETIZATION   => 'Monetization',
            self::CATEGORY_STUDIO         => 'Studio',
            self::CATEGORY_DISCOVERY      => 'Discovery',
            self::CATEGORY_SAFETY         => 'Safety & Reporting',
            self::CATEGORY_NOTIFICATIONS  => 'Notifications',
            self::CATEGORY_EMERGENCY      => 'Platform Emergency Controls',
        ];
    }

    public static function isValidKey(string $key): bool
    {
        return array_key_exists($key, static::schema());
    }

    /**
     * True for the keys where `enabled=true` IS the restrictive state - the
     * emergency-category switches plus block_new_accounts (an
     * emergencyPairs() key, but not itself category=emergency). Everywhere
     * else in the registry, `enabled=true` means the capability is allowed,
     * so "restrictive" and "disabled" are the same direction. For these
     * they are opposite, which is exactly the distinction
     * GlobalControlService::set()'s reason-requirement guard and the admin
     * UI's confirm-modal polarity both need to get right.
     */
    public static function isInverted(string $key): bool
    {
        $meta = static::schema()[$key] ?? null;

        return ($meta !== null && $meta['category'] === self::CATEGORY_EMERGENCY)
            || array_key_exists($key, static::emergencyPairs());
    }

    /**
     * emergencyKey => pairedKey. Each emergencyKey is an INVERTED toggle -
     * enabled=true means the restriction is active - checked in addition to
     * pairedKey by GlobalControlService::isEnabledWithEmergencyPair(), so
     * turning the emergency switch on genuinely blocks the paired capability
     * even while the ordinary toggle for it stays on.
     */
    public static function emergencyPairs(): array
    {
        return [
            'emergency_upload_block' => 'uploads_enabled',
            'emergency_live_block'   => 'live_create_enabled',
            'block_new_accounts'     => 'signup_enabled',
        ];
    }
}
