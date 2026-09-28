<?php

namespace App\Support;

use App\Models\User;
use App\Services\StorageService;
use Illuminate\Support\Facades\Storage;

/**
 * The canonical authenticated-user payload returned by login / register / SSO.
 * Single source of truth so every token-issuing path returns the identical shape
 * the frontend `ReelsooUser` type expects.
 */
class AuthUserResource
{
    public static function make(User $user): array
    {
        return [
            'id'                   => $user->id,
            'name'                 => $user->name,
            'username'             => $user->username,
            'email'                => $user->email,
            'role'                 => $user->role,
            // Read-only demo admin. This is the resource /auth/login and
            // /auth/me actually return, so it is the one the panel reads to
            // decide whether to show its read-only banner. Presentation only -
            // BlockDemoWrites refuses the write server-side regardless.
            'is_demo'              => (bool) $user->is_demo,
            'permissions'          => $user->getPermissions(),
            'avatar'               => $user->avatar ? Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
            // Whether this is a real uploaded photo vs. the shared default -
            // callers that need to know "did they actually set one" (remove-photo
            // buttons, the verification eligibility checklist) must check this,
            // not `avatar` truthiness, now that `avatar` is never null.
            'has_avatar'           => (bool) $user->avatar,
            'phone'                => $user->phone,
            'bio'                  => $user->bio,
            'website'              => $user->website,
            'location'             => $user->location,
            'gender'               => $user->gender,
            'language'             => $user->language ?? 'en',
            'interests'            => $user->interests ?? [],
            'categories'           => $user->categories ?? [],
            'date_of_birth'        => $user->date_of_birth?->toDateString(),
            'country'              => $user->country,
            'selected_country_code'=> $user->selected_country_code,
            'selected_country_name'=> $user->selected_country_name,
            'detected_country_code'=> $user->detected_country_code,
            'detected_country_name'=> $user->detected_country_name,
            'country_locked_until' => $user->country_locked_until?->toIso8601String(),
            'is_verified'          => (bool) $user->is_verified,
            'is_private'           => (bool) $user->is_private,
            'is_active'            => (bool) $user->is_active,
            'is_banned'            => (bool) $user->is_banned,
            'two_factor_enabled'   => $user->hasTwoFactorEnabled(),
            // True only for an account social sign-in just created, until it
            // finishes the app's profile-completion flow. Carried on the auth
            // payload so the app knows at sign-in - and again on every cold
            // start via /auth/me - without a separate round trip, which is what
            // lets an interrupted onboarding resume instead of stranding a real
            // account with an invented username.
            'needs_social_onboarding' => $user->needsSocialOnboarding(),
            'ban_reason'           => $user->ban_reason,
            'message_privacy'      => $user->message_privacy ?? 'friends',
            'email_verified_at'    => $user->email_verified_at?->toIso8601String(),
            'profile'              => $user->profile ? [
                'total_followers' => $user->profile->total_followers,
                'total_following' => $user->profile->total_following,
                'total_likes'     => $user->profile->total_likes,
                'total_videos'    => $user->profile->total_videos,
            ] : null,
            'created_at'           => $user->created_at->toIso8601String(),
        ];
    }
}
