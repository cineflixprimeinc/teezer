<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Fields that decide who you ARE and what you can DO.
     *
     * Deliberately NOT in $fillable. Every one of these is a privilege-escalation primitive:
     * `role` makes an admin, `is_verified` mints a badge, `is_banned` un-bans an abuser.
     * They were mass-assignable, which meant a single future `$user->update($request->all())`
     * - the most natural thing in the world to write - was instant account takeover.
     *
     * There is no such sink today. This closes the door before someone opens it.
     *
     * Legitimate writers use forceFill()->save(), which states the intent out loud:
     * "yes, I mean to change this privileged field." See fill() below - a mass-assignment
     * attempt THROWS rather than being silently dropped, because a ban that quietly does
     * nothing is far more dangerous than one that errors.
     */
    public const PRIVILEGED = [
        'role', 'is_verified', 'is_banned', 'is_active', 'is_demo',
        'ban_reason', 'suspended_until',
        // Administrative access. Never settable from request input - a payload
        // carrying admin_role_id would otherwise be a one-request path to
        // granting yourself any role in the system.
        'admin_role_id', 'admin_status', 'admin_since', 'admin_granted_by',
    ];

    protected $fillable = [
        'name', 'username', 'email', 'phone', 'password',
        'avatar', 'date_of_birth', 'country', 'bio', 'website', 'location',
        'gender', 'language', 'interests', 'categories',
        'is_private', 'message_privacy', 'email_verified_at',
        // Country module (see services/CountryService.php)
        'selected_country_code', 'selected_country_name',
        'detected_country_code', 'detected_country_name',
        'detected_asn_number', 'detected_isp_organization',
        'country_locked_until', 'country_last_changed_at',
        'country_change_eligible_at', 'country_change_status',
        'admin_country_override', 'admin_country_override_by',
        'admin_country_override_at', 'admin_country_override_reason',
        'save_watch_history',
        'saved_privacy',
        'active_status',
        'profile_discovery',
        'show_to_search_engines',
        'who_can_comment',
        'who_can_tag',
        'who_can_duet',
        'who_can_download',
        'who_can_see_liked',
        'comment_filter',
        'profile_view_history',
        'profile_view_privacy',
        'activity_status',
        'login_alerts',
        'notification_preferences',
        'content_preferences',
        'accessibility_preferences',
        'appearance_preferences',
        'messages_preferences',
        'wellbeing_preferences',
        'ai_preferences',
        'spaces_preferences',
        'family_preferences',
        'upload_preferences',
        'password_changed_at',
        'creator_terms_accepted_at',
        'last_active_at',
        'last_login_at',
    ];

    protected $hidden = [
        'password', 'remember_token',
        'two_factor_secret', 'two_factor_recovery_codes',
        'family_pin',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at'           => 'datetime',
            'date_of_birth'               => 'date',
            'password'                    => 'hashed',
            'is_verified'                 => 'boolean',
            'is_private'                  => 'boolean',
            'is_active'                   => 'boolean',
            'is_banned'                   => 'boolean',
            'is_demo'                     => 'boolean',
            'country_locked_until'        => 'datetime',
            'country_last_changed_at'     => 'datetime',
            'country_change_eligible_at'  => 'datetime',
            'admin_country_override'      => 'boolean',
            'admin_country_override_at'   => 'datetime',
            'detected_asn_number'         => 'integer',
            'interests'                   => 'array',
            'categories'                  => 'array',
            'save_watch_history'        => 'boolean',
            'active_status'             => 'boolean',
            'profile_discovery'         => 'boolean',
            'show_to_search_engines'    => 'boolean',
            'comment_filter'            => 'boolean',
            'profile_view_history'      => 'boolean',
            'login_alerts'                => 'boolean',
            'notification_preferences'    => 'array',
            'content_preferences'          => 'array',
            'accessibility_preferences'    => 'array',
            'appearance_preferences'       => 'array',
            'messages_preferences'         => 'array',
            'wellbeing_preferences'        => 'array',
            'ai_preferences'               => 'array',
            'spaces_preferences'           => 'array',
            'family_preferences'           => 'array',
            'upload_preferences'           => 'array',
            'password_changed_at'         => 'datetime',
            'creator_terms_accepted_at'   => 'datetime',
            'last_active_at'              => 'datetime',
            'last_login_at'               => 'datetime',
            'admin_since'                 => 'datetime',
            'two_factor_confirmed_at'     => 'datetime',
        ];
    }

    // ── Relations ────────────────────────────────────────────────────

    /** Linked third-party sign-ins (Google, Apple, …). */
    public function socialAccounts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SocialAccount::class);
    }

    // ── Role helpers ─────────────────────────────────────────────────

    /**
     * Refuse to mass-assign a privileged field - loudly.
     *
     * Laravel's default is to SILENTLY DROP an attribute that isn't fillable. For these
     * fields that default is the worst of both worlds: an admin clicks Ban, the request
     * succeeds, and the user is not banned. Nobody finds out.
     *
     * So a mass-assignment attempt on role / is_verified / is_banned / … throws. Anything
     * that legitimately needs to change one uses forceFill(), which runs unguarded and is
     * explicitly allowed through below.
     *
     * This also means that if I missed a call site while converting them, it fails with a
     * clear exception on the first click rather than quietly not working for months.
     */
    public function fill(array $attributes)
    {
        if (! static::isUnguarded()) {
            $blocked = array_intersect(array_keys($attributes), self::PRIVILEGED);

            if ($blocked !== []) {
                throw new \Illuminate\Database\Eloquent\MassAssignmentException(sprintf(
                    'Refusing to mass-assign privileged User field(s): %s. Use forceFill()->save() '
                    . 'to change these deliberately.',
                    implode(', ', $blocked),
                ));
            }
        }

        return parent::fill($attributes);
    }

    /**
     * 'super_admin' counts as admin too (a strict superset - see
     * hasAdminGrant() below) - this used to check role === 'admin' only,
     * which meant NO account could ever actually reach an
     * ApiAdminMiddleware-gated route while holding the 'super_admin' role:
     * discovered live while promoting the one real admin account to
     * super_admin, which then immediately locked itself out. Fixed here,
     * at the source, rather than in each of ApiAdminMiddleware's 18-odd
     * callers.
     */
    public function isAdmin(): bool    { return in_array($this->role, ['admin', 'super_admin'], true); }
    public function isCreator(): bool  { return $this->role === 'creator'; }
    public function isUser(): bool     { return $this->role === 'user'; }

    /**
     * Per-admin, individually-grantable permission check - DELIBERATELY a
     * different method from hasPermission()/getPermissions() below, which is
     * a STATIC function of role (every 'admin' gets the exact same list) and
     * is read-only/display-oriented (only ever read by ProfileController and
     * AuthUserResource to hand the frontend a permissions array - never used
     * to gate a backend route; confirmed via a repo-wide check before adding
     * this). This method is for the opposite case: a capability that two
     * admins with the same role can differ on, backed by
     * App\Models\AdminPermission (the grant) and App\Support\
     * AdminPermissions (the code-defined catalog). Always layered on TOP of
     * the existing isAdmin() gate every /admin route already requires, never
     * a replacement for it. 'super_admin' bypasses this entirely, matching
     * the admin frontend's own "super_admin: [*]" convention
     * (admin/src/app/roles/page.tsx) - and now that isAdmin() above also
     * recognizes 'super_admin', that bypass is actually reachable.
     */
    /** The RBAC role this administrator holds, if any. */
    public function adminRole()
    {
        return $this->belongsTo(\App\Models\AdminRole::class, 'admin_role_id');
    }

    public function hasAdminGrant(string $permission): bool
    {
        return in_array($permission, $this->effectiveAdminPermissions(), true)
            || $this->role === 'super_admin';
    }

    /**
     * Everything this administrator can actually do, after role and overrides.
     *
     * Resolution order, and why:
     *   1. Not an admin at all            -> nothing. The coarse users.role gate
     *                                       still decides who is staff.
     *   2. admin_status not 'active'      -> nothing. Disabling someone's
     *                                       administrative access must take
     *                                       effect immediately, while leaving
     *                                       their ordinary account untouched.
     *   3. super_admin                    -> everything, without reading a
     *                                       stored list that would drift out of
     *                                       date as permissions are added.
     *   4. role permissions, then per-user overrides. A `deny` override wins
     *      over the role, which is the only way to take one capability off an
     *      otherwise-correct role without inventing a near-duplicate role.
     *
     * Cached per user because a permission check runs on nearly every admin
     * request. AdminRbacService::forget() clears it, and every write that can
     * change the answer calls that - a stale cache here means someone keeps
     * access they were just stripped of.
     */
    public function effectiveAdminPermissions(): array
    {
        if (! $this->isAdmin()) {
            return [];
        }

        // Legacy admins predate admin_status; a null value means "not yet
        // migrated", which the RBAC migration backfills to 'active'. Only an
        // explicit non-active value locks someone out.
        if ($this->admin_status !== null && $this->admin_status !== 'active') {
            return [];
        }

        if ($this->role === 'super_admin') {
            return \App\Support\AdminPermissions::all();
        }

        return \Illuminate\Support\Facades\Cache::remember(
            'admin:perms:' . $this->id,
            now()->addMinutes(10),
            function () {
                $fromRole = $this->admin_role_id
                    ? \App\Models\AdminRole::find($this->admin_role_id)?->permissionKeys() ?? []
                    : [];

                // A disabled role confers nothing, without having to unassign
                // every administrator who holds it.
                if ($this->admin_role_id && ! (\App\Models\AdminRole::find($this->admin_role_id)?->is_active ?? false)) {
                    $fromRole = [];
                }

                $overrides = \App\Models\AdminPermission::where('user_id', $this->id)
                    ->get(['permission', 'effect']);

                $granted = collect($fromRole);
                foreach ($overrides as $o) {
                    if (($o->effect ?? 'grant') === 'deny') {
                        $granted = $granted->reject(fn ($p) => $p === $o->permission);
                    } else {
                        $granted->push($o->permission);
                    }
                }

                return $granted->unique()->values()->all();
            }
        );
    }

    // ── Two-factor helpers ───────────────────────────────────────────

    /** True once the user has confirmed a TOTP secret (2FA is live). */
    public function hasTwoFactorEnabled(): bool
    {
        return ! is_null($this->two_factor_confirmed_at) && ! empty($this->two_factor_secret);
    }

    /* ── Social-signup profile completion ──────────────────────────────────
     *
     * An account created through Google / Facebook / Apple / TikTok arrives
     * without a date of birth and with a username this server invented from the
     * provider's email (ApiAuthController::generateUniqueUsername). Those three
     * things - birthday, real name, chosen username - are collected by the
     * onboarding flow in the app before the account is usable.
     *
     * Marked explicitly at creation rather than inferred. The tempting shortcut
     * is "has a social account and no date_of_birth", but that also matches
     * somebody who signed up by email (where date_of_birth is nullable) and
     * linked Google afterwards - they would be dragged through a signup flow
     * for an account they finished long ago. A flag written at the moment of
     * creation cannot make that mistake.
     *
     * Lives in content_preferences, the JSON column this codebase already uses
     * for per-account flags, so it needs no migration and follows the account
     * across devices - unlike a local flag, which would re-ask on a new phone.
     */

    private const ONBOARDING_PENDING   = 'social_onboarding_pending';
    private const ONBOARDING_COMPLETED = 'social_onboarding_completed_at';

    /** Called once, when social sign-in CREATES the account. */
    public function markSocialOnboardingPending(): void
    {
        $prefs = (array) ($this->content_preferences ?? []);
        $prefs[self::ONBOARDING_PENDING] = true;
        $this->content_preferences = $prefs;
    }

    /** True while the app should be showing the profile-completion flow. */
    public function needsSocialOnboarding(): bool
    {
        $prefs = (array) ($this->content_preferences ?? []);

        // Completed wins outright, so finishing is permanent even if something
        // later re-sets the pending flag.
        if (! empty($prefs[self::ONBOARDING_COMPLETED])) {
            return false;
        }

        return ! empty($prefs[self::ONBOARDING_PENDING]);
    }

    /** Finished: clears pending and records when, so it never runs again. */
    public function markSocialOnboardingComplete(): void
    {
        $prefs = (array) ($this->content_preferences ?? []);
        unset($prefs[self::ONBOARDING_PENDING]);
        $prefs[self::ONBOARDING_COMPLETED] = now()->toIso8601String();
        $this->content_preferences = $prefs;
    }

    /**
     * Tier-based daily upload limit:
     *   Normal User          = 5
     *   Creator Level 1      = 10
     *   Creator Level 2–4    = 15
     *   Creator Level 5–6    = 25
     *   Creator Level 7–10   = 50
     */
    public function defaultUploadLimit(): int
    {
        if ($this->role !== 'creator') return 5;
        $level = $this->creatorProgress?->level?->id ?? 1;
        return match (true) {
            $level <= 1 => 10,
            $level <= 4 => 15,
            $level <= 6 => 25,
            default     => 50,
        };
    }

    public function getDashboardUrl(): string
    {
        return match($this->role) {
            'admin'   => '/dashboard/admin',
            'creator' => '/dashboard/creator',
            default   => '/dashboard/user',
        };
    }

    // ── Permission system ─────────────────────────────────────────────

    public function getPermissions(): array
    {
        return match($this->role) {
            'admin' => [
                'manage_users', 'manage_creators', 'manage_videos',
                'manage_reports', 'manage_verification', 'manage_monetization',
                'manage_settings', 'manage_roles', 'manage_notifications',
                'manage_moderation', 'manage_feed', 'manage_playlists',
                'access_admin_panel', 'access_creator_studio', 'access_feed',
                'view_analytics', 'view_audit_log', 'access_api_developer',
            ],
            'creator' => [
                'access_creator_studio', 'access_feed',
                'manage_own_content', 'view_own_analytics',
                'request_verification', 'view_monetization',
            ],
            'user' => [
                'access_feed', 'manage_own_profile',
                'basic_uploads', 'manage_own_content',
            ],
            default => [],
        };
    }

    public function hasPermission(string $permission): bool
    {
        return in_array($permission, $this->getPermissions());
    }

    public function can($abilities, $arguments = []): bool
    {
        if (is_string($abilities)) {
            return $this->hasPermission($abilities) || parent::can($abilities, $arguments);
        }
        return parent::can($abilities, $arguments);
    }

    // ── Relationships ─────────────────────────────────────────────────

    public function profile()            { return $this->hasOne(Profile::class); }
    public function videos()             { return $this->hasMany(Video::class); }
    public function wallet()             { return $this->hasOne(Wallet::class); }
    public function creatorProgress()    { return $this->hasOne(CreatorProgress::class); }
    public function socialLinks()        { return $this->hasMany(SocialLink::class); }
    public function highlights()         { return $this->hasMany(Highlight::class); }
    public function devices()            { return $this->hasMany(UserDevice::class); }
    public function verificationRequests() { return $this->hasMany(VerificationRequest::class); }
    public function notifications()      { return $this->hasMany(AppNotification::class); }
    public function subscriptions()      { return $this->hasMany(Subscription::class); }

    public function followers()
    {
        return $this->belongsToMany(User::class, 'followers', 'following_id', 'follower_id');
    }

    public function following()
    {
        return $this->belongsToMany(User::class, 'followers', 'follower_id', 'following_id');
    }

    /** Only accepted followers (used for counts and privacy checks). */
    public function acceptedFollowers()
    {
        return $this->belongsToMany(User::class, 'followers', 'following_id', 'follower_id')
                    ->wherePivot('status', 'accepted');
    }

    /** Only accepted following (used for counts and privacy checks). */
    public function acceptedFollowing()
    {
        return $this->belongsToMany(User::class, 'followers', 'follower_id', 'following_id')
                    ->wherePivot('status', 'accepted');
    }

    public function blockedUsers()
    {
        return $this->belongsToMany(User::class, 'blocked_users', 'blocker_id', 'blocked_id');
    }

    public function isFollowing(User $user): bool
    {
        return $this->following()->where('following_id', $user->id)->exists();
    }

    public function hasBlocked(User $user): bool
    {
        return $this->blockedUsers()->where('blocked_id', $user->id)->exists();
    }

    public function mutedUsers()
    {
        return $this->belongsToMany(User::class, 'muted_users', 'muter_id', 'muted_id');
    }

    public function hasMuted(User $user): bool
    {
        return $this->mutedUsers()->where('muted_id', $user->id)->exists();
    }
}
