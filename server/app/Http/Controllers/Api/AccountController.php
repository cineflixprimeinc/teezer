<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\User;
use App\Models\UserAdminRestriction;
use App\Models\UserModerationSetting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AccountController extends Controller
{
    /**
     * Change the authenticated user's email after verifying their password.
     * Requires: { new_email, current_password }
     */
    public function changeEmail(Request $request): JsonResponse
    {
        $request->validate([
            'new_email'        => ['required', 'email', 'max:191', 'unique:users,email,' . $request->user()->id],
            'current_password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Current password is incorrect.',
            ], 422);
        }

        $user->update([
            'email'             => $request->new_email,
            'email_verified_at' => null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Email updated. Please verify your new email address.',
            'data'    => ['email' => $user->email],
        ]);
    }

    /**
     * Change the authenticated user's phone after verifying their password.
     * Requires: { new_phone, current_password }
     */
    public function changePhone(Request $request): JsonResponse
    {
        $request->validate([
            'new_phone'        => ['required', 'string', 'min:6', 'max:30', 'unique:users,phone,' . $request->user()->id],
            'current_password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password, $user->password)) {
            return response()->json([
                'success' => false,
                'message' => 'Current password is incorrect.',
            ], 422);
        }

        $user->update(['phone' => $request->new_phone]);

        return response()->json([
            'success' => true,
            'message' => 'Phone number updated.',
            'data'    => ['phone' => $user->phone],
        ]);
    }

    /**
     * Stream the authenticated user's account data as a JSON download.
     * Bundles profile, social links, country info, basic counts.
     */
    public function export(Request $request): StreamedResponse
    {
        $user = $request->user()->load(['profile', 'socialLinks', 'highlights']);

        $payload = [
            'exported_at' => now()->toIso8601String(),
            'account' => [
                'id'            => $user->id,
                'name'          => $user->name,
                'username'      => $user->username,
                'email'         => $user->email,
                'phone'         => $user->phone,
                'bio'           => $user->bio,
                'website'       => $user->website,
                'location'      => $user->location,
                'gender'        => $user->gender,
                'language'      => $user->language,
                'interests'     => $user->interests,
                'date_of_birth' => $user->date_of_birth?->toDateString(),
                'country'       => $user->country,
                'is_verified'   => (bool) $user->is_verified,
                'is_private'    => (bool) $user->is_private,
                'role'          => $user->role,
                'created_at'    => $user->created_at?->toIso8601String(),
            ],
            'country' => [
                'selected_country_code'  => $user->selected_country_code,
                'selected_country_name'  => $user->selected_country_name,
                'detected_country_code'  => $user->detected_country_code,
                'detected_country_name'  => $user->detected_country_name,
                'detected_isp'           => $user->detected_isp_organization,
                'country_locked_until'   => $user->country_locked_until?->toIso8601String(),
                'country_change_status'  => $user->country_change_status,
            ],
            'profile' => $user->profile ? [
                'location'        => $user->profile->location,
                'website'         => $user->profile->website,
                'category'        => $user->profile->category,
                'total_followers' => $user->profile->total_followers,
                'total_following' => $user->profile->total_following,
                'total_likes'     => $user->profile->total_likes,
                'total_videos'    => $user->profile->total_videos,
                'profile_views'   => $user->profile->profile_views,
            ] : null,
            'social_links' => $user->socialLinks->map(fn($l) => [
                'platform' => $l->platform,
                'url'      => $l->url,
            ])->all(),
            'highlights' => $user->highlights->map(fn($h) => [
                'title'     => $h->title,
                'cover_url' => $h->cover_url,
            ])->all(),
        ];

        $json     = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $filename = 'teezer-account-' . $user->username . '-' . now()->format('Ymd') . '.json';

        return response()->streamDownload(function () use ($json) {
            echo $json;
        }, $filename, [
            'Content-Type'  => 'application/json',
            'Cache-Control' => 'no-store',
        ]);
    }

    /* ── GET /account/security ───────────────────────────────────────────── */
    public function security(Request $request): JsonResponse
    {
        $user    = $request->user();
        $current = $user->currentAccessToken();
        $tokens  = $user->tokens()->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => [
                'email'               => $user->email,
                'phone'               => $user->phone,
                'email_verified'      => (bool) $user->email_verified_at,
                'phone_verified'      => !empty($user->phone),
                'login_alerts'        => (bool) ($user->login_alerts ?? true),
                'password_changed_at' => $user->password_changed_at?->toIso8601String(),
                'session_count'       => $tokens->count(),
            ],
        ]);
    }

    /* ── GET /account/sessions ───────────────────────────────────────────── */
    public function sessions(Request $request): JsonResponse
    {
        $user    = $request->user();
        $current = $user->currentAccessToken();

        $sessions = $user->tokens()
            ->orderByDesc('created_at')
            ->take(20)
            ->get()
            ->map(function ($token) use ($current) {
                $meta  = json_decode($token->name, true);
                $label = is_array($meta) ? ($meta['label'] ?? $token->name) : $token->name;

                // Sanitise legacy / non-JSON names
                if (!is_array($meta)) {
                    $meta = ['label' => $label, 'browser' => null, 'platform' => null, 'type' => 'desktop', 'ip' => null];
                }

                return [
                    'id'         => $token->id,
                    'label'      => $meta['label'] ?? 'Unknown Device',
                    'browser'    => $meta['browser'] ?? null,
                    'platform'   => $meta['platform'] ?? null,
                    'type'       => $meta['type'] ?? 'desktop',
                    'ip'         => $meta['ip'] ?? null,
                    'is_current' => $current && $token->id === $current->id,
                    'last_used'  => $token->last_used_at?->toIso8601String(),
                    'created_at' => $token->created_at->toIso8601String(),
                ];
            });

        return response()->json(['success' => true, 'data' => $sessions]);
    }

    /* ── DELETE /account/sessions/{id} ──────────────────────────────────── */
    public function revokeSession(Request $request, int $id): JsonResponse
    {
        $user    = $request->user();
        $current = $user->currentAccessToken();

        if ($current && $current->id === $id) {
            return response()->json(['success' => false, 'message' => 'Cannot revoke current session.'], 422);
        }

        $deleted = $user->tokens()->where('id', $id)->delete();

        return response()->json([
            'success' => (bool) $deleted,
            'message' => $deleted ? 'Session revoked.' : 'Session not found.',
        ]);
    }

    /* ── DELETE /account/sessions ────────────────────────────────────────── */
    public function revokeAllSessions(Request $request): JsonResponse
    {
        $user    = $request->user();
        $current = $user->currentAccessToken();

        if ($current) {
            $user->tokens()->where('id', '!=', $current->id)->delete();
        } else {
            $user->tokens()->delete();
        }

        return response()->json(['success' => true, 'message' => 'All other sessions revoked.']);
    }

    /* ── PATCH /account/login-alerts ─────────────────────────────────────── */
    public function toggleLoginAlerts(Request $request): JsonResponse
    {
        $request->validate(['enabled' => ['required', 'boolean']]);
        $request->user()->update(['login_alerts' => $request->boolean('enabled')]);
        return response()->json(['success' => true, 'login_alerts' => $request->boolean('enabled')]);
    }

    /* ── POST /account/delete ────────────────────────────────────────────── */
    public function deleteAccount(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string']]);

        $user = $request->user();

        if (!Hash::check($request->password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'Password is incorrect.'], 422);
        }

        $user->tokens()->delete();

        // These tables declare user_id as nullOnDelete, so their rows OUTLIVE the
        // account - orphaned, but still carrying an identifier. An IP address and
        // a device id are personal data on their own, so "delete my account" has
        // to clear them too. Do it here, while the rows can still be located by
        // user_id: after delete() the id is NULL and they are unreachable.
        DB::table('video_events')->where('user_id', $user->id)->update(['ip_address' => null]);
        DB::table('video_views')->where('user_id', $user->id)->update(['ip_address' => null]);
        DB::table('video_watch_sessions')->where('user_id', $user->id)->update(['device_id' => null]);

        $user->delete();

        return response()->json(['success' => true, 'message' => 'Account deleted.']);
    }

    /**
     * POST /account/send-email-otp   { new_email? }
     * Emails a 6-digit OTP so the user can verify their current email, or - when a
     * `new_email` is supplied - verify and switch to a new (recovery) email. The
     * code is stored hashed in `signup_drafts` keyed by user id - DB-backed so it
     * works across the load-balanced app servers (file cache would not).
     */
    public function sendEmailOtp(Request $request): JsonResponse
    {
        $request->validate(['new_email' => ['nullable', 'email', 'max:191']]);
        $user = $request->user();

        $newEmail = $request->filled('new_email') ? strtolower(trim((string) $request->input('new_email'))) : null;
        $changing = $newEmail !== null && $newEmail !== strtolower((string) $user->email);
        $target   = $changing ? $newEmail : $user->email;

        if ($changing) {
            if (User::where('email', $newEmail)->where('id', '!=', $user->id)->exists()) {
                return response()->json(['success' => false, 'message' => 'This email is already in use.'], 422);
            }
        } elseif ($user->email_verified_at) {
            return response()->json(['success' => false, 'message' => 'Your email is already verified.'], 422);
        }

        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        // Replace any prior pending code for this user, then store the new one.
        DB::table('signup_drafts')->where('user_id', $user->id)->delete();
        DB::table('signup_drafts')->insert([
            'draft_token' => Str::random(64),
            'user_id'     => $user->id,
            'email'       => $target,
            'otp_hash'    => hash('sha256', $otp),
            'expires_at'  => now()->addMinutes(10),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        try {
            $firstName = explode(' ', trim((string) $user->name))[0] ?: 'there';
            Mail::to($target)->send(new \App\Mail\SignupOtpMail($otp, '', $firstName));
        } catch (\Throwable $e) {
            report($e);
            return response()->json(['success' => false, 'message' => 'Could not send the verification email. Please try again.'], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Verification code sent to ' . $target . '.',
        ]);
    }

    /**
     * POST /account/verify-email-otp  { otp }
     * Verifies the stored OTP and marks the user's email as verified - switching to
     * the new address first if the code was sent to one.
     */
    public function verifyEmailOtp(Request $request): JsonResponse
    {
        $request->validate(['otp' => ['required', 'string', 'size:6']]);
        $user = $request->user();

        $draft = DB::table('signup_drafts')
            ->where('user_id', $user->id)
            ->whereNotNull('otp_hash')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();

        if (!$draft) {
            return response()->json(['success' => false, 'message' => 'Your code has expired. Please request a new one.'], 422);
        }

        // SECURITY: cap wrong guesses so a 6-digit code (which here can change the
        // account's verified email) can't be brute-forced past the per-IP throttle.
        $attemptsKey = 'email:otp:attempts:' . $draft->id;
        if ((int) \Illuminate\Support\Facades\Cache::get($attemptsKey, 0) >= 5) {
            DB::table('signup_drafts')->where('id', $draft->id)->delete();
            \Illuminate\Support\Facades\Cache::forget($attemptsKey);
            return response()->json(['success' => false, 'message' => 'Too many incorrect attempts. Please request a new code.'], 429);
        }
        if (!hash_equals((string) $draft->otp_hash, hash('sha256', (string) $request->input('otp')))) {
            \Illuminate\Support\Facades\Cache::put($attemptsKey, (int) \Illuminate\Support\Facades\Cache::get($attemptsKey, 0) + 1, now()->addMinutes(30));
            return response()->json(['success' => false, 'message' => 'Invalid verification code.'], 422);
        }
        \Illuminate\Support\Facades\Cache::forget($attemptsKey);

        $newEmail = strtolower((string) $draft->email);
        $changing = $newEmail !== strtolower((string) $user->email);
        if ($changing && User::where('email', $newEmail)->where('id', '!=', $user->id)->exists()) {
            return response()->json(['success' => false, 'message' => 'This email is already in use.'], 422);
        }

        $user->forceFill(['email' => $newEmail, 'email_verified_at' => now()])->save();
        DB::table('signup_drafts')->where('user_id', $user->id)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Email verified successfully.',
            'data'    => ['email' => $user->email, 'email_verified' => true],
        ]);
    }

    /**
     * Account status snapshot used by the Account Settings "Account Data" card.
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();

        $accountStatus = 'active';
        if ($user->is_banned)         $accountStatus = 'suspended';
        elseif (!$user->is_active)    $accountStatus = 'restricted';
        elseif (!$user->email_verified_at) $accountStatus = 'pending_verification';

        $visibility = $user->is_private ? 'private' : 'public';

        return response()->json([
            'success' => true,
            'data'    => [
                'account_status'             => $accountStatus,
                'profile_visibility_status'  => $visibility,
                'email_verified'             => (bool) $user->email_verified_at,
                'phone_verified'             => !empty($user->phone),
            ],
        ]);
    }

    // ── User upload / content restrictions ───────────────────────────────────

    public function restrictions(Request $request): JsonResponse
    {
        $user = $request->user();
        $mod  = UserModerationSetting::forUser($user->id);

        // Load active admin restrictions with expiry info
        $rows = UserAdminRestriction::where('user_id', $user->id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->get()
            ->keyBy('restriction_type');

        $labels = [
            'restrict_uploads'              => 'Upload Restriction',
            'post_approval_required'        => 'Post Approval Required',
            'block_live_access'             => 'Live Access Blocked',
            'disable_draft_creation'        => 'Draft Creation Disabled',
            'disable_commenting_on_uploads' => 'Commenting on Uploads Disabled',
            'disable_commenting_on_others'  => 'Commenting on Others Disabled',
            'disable_following_others'      => 'Following Others Disabled',
        ];

        $active = [];
        foreach ($rows as $type => $row) {
            $expiresAt   = $row->expires_at;
            $isPermanent = is_null($expiresAt);
            $timeRemaining = null;
            $expiresFormatted = null;

            if (!$isPermanent) {
                $expiresFormatted = Carbon::parse($expiresAt)->format('M j, Y');
                $diff = now()->diff(Carbon::parse($expiresAt));
                if ($diff->days >= 1) {
                    $timeRemaining = $diff->days === 1 ? '1 day' : "{$diff->days} days";
                } elseif ($diff->h >= 1) {
                    $timeRemaining = $diff->h === 1 ? '1 hour' : "{$diff->h} hours";
                } else {
                    $mins = max(1, $diff->i);
                    $timeRemaining = $mins === 1 ? '1 minute' : "{$mins} minutes";
                }
            }

            $active[] = [
                'type'             => $type,
                'label'            => $labels[$type] ?? $type,
                'reason'           => $row->reason,
                'is_permanent'     => $isPermanent,
                'expires_at'       => $expiresAt?->toIso8601String(),
                'expires_at_label' => $expiresFormatted,
                'time_remaining'   => $timeRemaining,
                'applied_at'       => $row->created_at?->toIso8601String(),
                'applied_at_label' => $row->created_at?->format('M j, Y'),
                'category'         => 'account',
            ];
        }

        // ── Conversation-level restrictions ───────────────────────────────────
        $convRestrictionMap = [
            'dm_restricted'              => 'DM Messaging Restricted',
            'shadow_restricted'          => 'Shadow Restriction Active',
            'media_restricted'           => 'Media Sharing Restricted',
            'links_disabled'             => 'Link Sharing Disabled',
            'message_approval_required'  => 'Message Approval Required',
            'prevent_new_requests'       => 'New DM Requests Blocked',
            'auto_hide_reported'         => 'Reported Messages Auto-Hidden',
            'history_archived'           => 'Message History Archived',
        ];

        $convs = Conversation::where(function ($q) use ($user) {
                $q->where('user_a_id', $user->id)->orWhere('user_b_id', $user->id);
            })
            ->where(function ($q) {
                $q->where('dm_restricted', true)
                  ->orWhere('shadow_restricted', true)
                  ->orWhere('media_restricted', true)
                  ->orWhere('links_disabled', true)
                  ->orWhere('message_approval_required', true)
                  ->orWhere('prevent_new_requests', true)
                  ->orWhere('auto_hide_reported', true)
                  ->orWhere('history_archived', true);
            })
            ->get();

        $seenConvTypes = [];

        foreach ($convs as $conv) {
            $config = $conv->restrictions_config ?? [];

            foreach (array_keys($convRestrictionMap) as $field) {
                if (!(bool) ($conv->$field ?? false)) continue;
                if (isset($seenConvTypes[$field])) continue;

                $exp = $config[$field] ?? null;
                if ($exp && now()->greaterThanOrEqualTo(Carbon::parse($exp))) continue;

                $isPermanent      = is_null($exp);
                $expiresFormatted = null;
                $timeRemaining    = null;

                if (!$isPermanent) {
                    $expiresFormatted = Carbon::parse($exp)->format('M j, Y g:i A');
                    $diff = now()->diff(Carbon::parse($exp));
                    if ($diff->days >= 1) {
                        $timeRemaining = $diff->days === 1 ? '1 day' : "{$diff->days} days";
                    } elseif ($diff->h >= 1) {
                        $timeRemaining = $diff->h === 1 ? '1 hour' : "{$diff->h} hours";
                    } else {
                        $mins = max(1, $diff->i);
                        $timeRemaining = $mins === 1 ? '1 minute' : "{$mins} minutes";
                    }
                }

                $active[] = [
                    'type'             => $field,
                    'label'            => $convRestrictionMap[$field],
                    'reason'           => null,
                    'is_permanent'     => $isPermanent,
                    'expires_at'       => $exp ? Carbon::parse($exp)->toIso8601String() : null,
                    'expires_at_label' => $expiresFormatted,
                    'time_remaining'   => $timeRemaining,
                    'applied_at'       => $conv->updated_at?->toIso8601String(),
                    'applied_at_label' => $conv->updated_at?->format('M j, Y'),
                    'category'         => 'messaging',
                ];

                $seenConvTypes[$field] = true;
            }
        }

        $until = $mod->upload_suspension_until;
        $suspensionActive = $until && $until->isFuture();

        return response()->json([
            'success' => true,
            'data'    => [
                'restrict_uploads'             => (bool) $mod->restrict_uploads,
                'disable_drafts'               => (bool) $mod->disable_drafts,
                'upload_suspension_until'      => $suspensionActive ? $until->toIso8601String() : null,
                'block_live_access'            => (bool) $mod->block_live_access,
                'disable_commenting'           => (bool) $mod->disable_commenting,
                'disable_commenting_on_others' => (bool) $mod->disable_commenting_on_others,
                'disable_following_others'     => (bool) $mod->disable_following_others,
                'active_restrictions'          => $active,
            ],
        ]);
    }

    /* ── GET /account/social-accounts ─────────────────────────────────────── */
    /** Linked third-party sign-ins for Settings › Connected Accounts. Always
     *  returns every supported provider with a `linked` flag so the UI can show
     *  Connect / Disconnect for each. */
    public function socialAccounts(Request $request): JsonResponse
    {
        $providers = ['google' => 'Google', 'apple' => 'Apple', 'facebook' => 'Facebook', 'tiktok' => 'TikTok'];

        $linked = $request->user()->socialAccounts()->get()->keyBy('provider');

        $data = [];
        foreach ($providers as $key => $label) {
            $row = $linked->get($key);
            $data[] = [
                'provider'  => $key,
                'label'     => $label,
                'linked'    => (bool) $row,
                'email'     => $row->email ?? null,
                'name'      => $row->name ?? null,
                'linked_at' => $row?->linked_at?->toIso8601String(),
            ];
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    /* ── DELETE /account/social-accounts/{provider} ──────────────────────── */
    public function unlinkSocialAccount(Request $request, string $provider): JsonResponse
    {
        $user = $request->user();

        // Never let a user strand themselves: block unlinking the last sign-in
        // method when no usable password is set (social-only accounts).
        $hasUsablePassword = !empty($user->password_changed_at);
        $linkedCount       = $user->socialAccounts()->count();
        if (!$hasUsablePassword && $linkedCount <= 1) {
            return response()->json([
                'success' => false,
                'message' => 'Set a password before disconnecting your only sign-in method.',
            ], 422);
        }

        $deleted = $user->socialAccounts()->where('provider', $provider)->delete();

        return response()->json([
            'success' => (bool) $deleted,
            'message' => $deleted ? ucfirst($provider) . ' disconnected.' : 'No linked ' . $provider . ' account found.',
        ]);
    }

    /* ── GET /account/authorized-apps ─────────────────────────────────────── */
    /** Internal Teezer apps (e.g. Teezer Ads) the user has authorized via the
     *  SSO consent screen. Backed by the `oauth_grants` table. */
    public function authorizedApps(Request $request): JsonResponse
    {
        $grants = \App\Models\OauthGrant::where('user_id', $request->user()->id)
            ->whereNull('revoked_at')
            ->orderByDesc('granted_at')
            ->get()
            ->map(function ($g) {
                $config = config("sso.clients.$g->client");
                return [
                    'client'       => $g->client,
                    'display_name' => $config['display_name'] ?? ucfirst((string) $g->client),
                    'scopes'       => $g->scopes ?? [],
                    'granted_at'   => $g->granted_at?->toIso8601String(),
                ];
            });

        return response()->json(['success' => true, 'data' => $grants]);
    }
}
