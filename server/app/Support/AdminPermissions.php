<?php

namespace App\Support;

/**
 * Code-defined catalog of fine-grained admin permissions - see the
 * admin_permissions migration's docblock for why this isn't DB-driven.
 * Adding a new permission elsewhere in the app means adding one entry here
 * plus a `->middleware('permission:...')` on the routes it guards; nothing
 * else needs to change.
 *
 * The two original grants (manage_country_availability, manage_licenses) are
 * kept under their exact original keys because rows in admin_permissions and
 * `permission:` middleware on live routes already reference them. Renaming
 * them to fit the dotted convention below would silently revoke access from
 * whoever holds them.
 */
class AdminPermissions
{
    /* ── Pre-existing grants: keys must not change ───────────────────────── */
    public const MANAGE_COUNTRY_AVAILABILITY = 'manage_country_availability';
    public const MANAGE_LICENSES = 'manage_licenses';

    /**
     * Categories, in the order the UI shows them.
     *
     * Shape: category key => [label, permissions => [key => [label, sensitive?]]]
     * `sensitive` marks a permission that grants access to money, credentials,
     * account security or the permission system itself - the UI warns before
     * granting a whole category of them.
     */
    public static function categories(): array
    {
        return [
            'users' => ['label' => 'Users', 'permissions' => [
                'users.view'            => ['label' => 'View users'],
                'users.search'          => ['label' => 'Search users'],
                'users.view_360'        => ['label' => 'View User 360 profile'],
                'users.edit'            => ['label' => 'Edit user profile'],
                'users.verify'          => ['label' => 'Verify user'],
                'users.change_username' => ['label' => 'Change username'],
                'users.change_email'    => ['label' => 'Change email', 'sensitive' => true],
                'users.change_phone'    => ['label' => 'Change phone', 'sensitive' => true],
                'users.suspend'         => ['label' => 'Suspend user'],
                'users.unsuspend'       => ['label' => 'Unsuspend user'],
                'users.ban'             => ['label' => 'Ban user', 'sensitive' => true],
                'users.unban'           => ['label' => 'Unban user'],
                'users.restrict'        => ['label' => 'Restrict user'],
                'users.unrestrict'      => ['label' => 'Remove restrictions'],
                'users.delete'          => ['label' => 'Delete user', 'sensitive' => true],
                'users.export'          => ['label' => 'Export user data', 'sensitive' => true],
            ]],

            'content' => ['label' => 'Content', 'permissions' => [
                'content.view'          => ['label' => 'View content'],
                'content.search'        => ['label' => 'Search content'],
                'content.edit'          => ['label' => 'Edit content'],
                'content.hide'          => ['label' => 'Hide content'],
                'content.restore'       => ['label' => 'Restore content'],
                'content.remove'        => ['label' => 'Remove content'],
                'content.feature'       => ['label' => 'Feature content'],
                'content.categories'    => ['label' => 'Manage categories'],
                'content.hashtags'      => ['label' => 'Manage hashtags'],
                'content.reports'       => ['label' => 'Manage content reports'],
                'content.analytics'     => ['label' => 'View content analytics'],
            ]],

            'comments' => ['label' => 'Comments', 'permissions' => [
                'comments.view'          => ['label' => 'View comments'],
                'comments.view_made'     => ['label' => 'View comments made'],
                'comments.view_received' => ['label' => 'View comments received'],
                'comments.search'        => ['label' => 'Search comments'],
                'comments.hide'          => ['label' => 'Hide comments'],
                'comments.restore'       => ['label' => 'Restore comments'],
                'comments.remove'        => ['label' => 'Remove comments'],
                'comments.moderate'      => ['label' => 'Moderate comment threads'],
                'comments.reports'       => ['label' => 'Review reported comments'],
                'comments.restrict'      => ['label' => 'Restrict commenting'],
            ]],

            'moderation' => ['label' => 'Moderation', 'permissions' => [
                'moderation.queue'      => ['label' => 'View moderation queue'],
                'moderation.review'     => ['label' => 'Review content'],
                'moderation.approve'    => ['label' => 'Approve content'],
                'moderation.reject'     => ['label' => 'Reject content'],
                'moderation.ai'         => ['label' => 'Review AI moderation'],
                'moderation.reports'    => ['label' => 'Review user reports'],
                'moderation.rules'      => ['label' => 'Manage moderation rules', 'sensitive' => true],
                'moderation.providers'  => ['label' => 'Manage moderation providers', 'sensitive' => true],
                'moderation.logs'       => ['label' => 'View moderation logs'],
            ]],

            'live' => ['label' => 'Live & Spaces', 'permissions' => [
                'live.view'          => ['label' => 'View live streams'],
                'live.moderate'      => ['label' => 'Moderate live streams'],
                'live.end'           => ['label' => 'End live stream'],
                'live.manage_users'  => ['label' => 'Manage live users'],
                'live.comments'      => ['label' => 'Manage live comments'],
                'live.reports'       => ['label' => 'Manage live reports'],
                'spaces.view'        => ['label' => 'View spaces'],
                'spaces.moderate'    => ['label' => 'Moderate spaces'],
                'spaces.end'         => ['label' => 'End space'],
                'live.hosts'         => ['label' => 'Manage live hosts'],
            ]],

            'wallet' => ['label' => 'Gifts, Wallet & Coins', 'permissions' => [
                'wallet.view'         => ['label' => 'View wallets'],
                'coins.view'          => ['label' => 'View coins'],
                'gifts.view'          => ['label' => 'View gifts'],
                'gifts.manage'        => ['label' => 'Manage gifts'],
                'gifts.catalog'       => ['label' => 'Manage gift catalog'],
                'gifts.transactions'  => ['label' => 'View gift transactions'],
                'wallet.adjust'       => ['label' => 'Adjust wallet', 'sensitive' => true],
                'gifts.refund'        => ['label' => 'Refund gift transaction', 'sensitive' => true],
            ]],

            'payments' => ['label' => 'Payments & Subscriptions', 'permissions' => [
                'payments.view'         => ['label' => 'View payments'],
                'payments.transactions' => ['label' => 'View transactions'],
                'subscriptions.view'    => ['label' => 'View subscriptions'],
                'subscriptions.manage'  => ['label' => 'Manage subscriptions', 'sensitive' => true],
                'payments.refund'       => ['label' => 'Refund payment', 'sensitive' => true],
                'payments.coupons'      => ['label' => 'Manage coupons'],
                'payments.pricing'      => ['label' => 'Manage pricing', 'sensitive' => true],
                'payments.taxes'        => ['label' => 'Manage taxes', 'sensitive' => true],
                'payments.revenue'      => ['label' => 'View revenue'],
                'payouts.view'          => ['label' => 'View payout requests'],
                'payouts.manage'        => ['label' => 'Approve and reject payouts', 'sensitive' => true],
            ]],

            'analytics' => ['label' => 'Analytics', 'permissions' => [
                'analytics.platform' => ['label' => 'View platform analytics'],
                'analytics.users'    => ['label' => 'View user analytics'],
                'analytics.content'  => ['label' => 'View content analytics'],
                'analytics.revenue'  => ['label' => 'View revenue analytics'],
                'analytics.live'     => ['label' => 'View live analytics'],
                'analytics.export'   => ['label' => 'Export analytics'],
            ]],

            'notifications' => ['label' => 'Notifications', 'permissions' => [
                'notifications.view'      => ['label' => 'View notifications'],
                'notifications.send'      => ['label' => 'Send notifications'],
                'notifications.push'      => ['label' => 'Send push notifications'],
                'notifications.email'     => ['label' => 'Send email notifications'],
                'notifications.templates' => ['label' => 'Manage notification templates'],
                'notifications.settings'  => ['label' => 'Manage notification settings'],
            ]],

            'settings' => ['label' => 'Platform Settings', 'permissions' => [
                'settings.view'          => ['label' => 'View platform settings'],
                'settings.general'       => ['label' => 'Edit general settings'],
                'settings.seo'           => ['label' => 'Edit website & SEO'],
                'settings.branding'      => ['label' => 'Edit branding'],
                'settings.appearance'    => ['label' => 'Edit appearance'],
                'settings.localization'  => ['label' => 'Edit localization'],
                'settings.registration'  => ['label' => 'Edit registration settings'],
                'settings.content'       => ['label' => 'Edit content settings'],
                'settings.media'         => ['label' => 'Edit media settings'],
                'settings.notifications' => ['label' => 'Edit notification settings'],
                'settings.email'         => ['label' => 'Edit email settings', 'sensitive' => true],
                'settings.storage'       => ['label' => 'Edit storage settings', 'sensitive' => true],
                'settings.payments'      => ['label' => 'Edit payment settings', 'sensitive' => true],
                'settings.features'      => ['label' => 'Manage feature flags', 'sensitive' => true],
                self::MANAGE_COUNTRY_AVAILABILITY => ['label' => 'Manage country availability', 'sensitive' => true],
                self::MANAGE_LICENSES             => ['label' => 'Manage marketplace licences', 'sensitive' => true],
            ]],

            // Global Reelsoo Control: platform-wide capability kill switches.
            // '.edit' is the coarse gate every editor needs; the per-category
            // keys below it are checked additionally by
            // AdminGlobalControlsController for the matching control category,
            // so a grant can hold '.edit' + '.content' without also being able
            // to touch authentication or emergency controls.
            'global_controls' => ['label' => 'Global Teezer Control', 'permissions' => [
                'global_controls.view'           => ['label' => 'View Global Teezer Control'],
                'global_controls.edit'           => ['label' => 'Edit global controls', 'sensitive' => true],
                'global_controls.emergency'      => ['label' => 'Change emergency/maintenance controls', 'sensitive' => true],
                'global_controls.authentication' => ['label' => 'Change authentication controls', 'sensitive' => true],
                'global_controls.content'        => ['label' => 'Change content controls'],
                'global_controls.social'         => ['label' => 'Change social/user-activity controls'],
                'global_controls.live'           => ['label' => 'Change live & Spaces controls'],
                'global_controls.monetization'   => ['label' => 'Change monetization controls', 'sensitive' => true],
                'global_controls.security'       => ['label' => 'Change account/security controls', 'sensitive' => true],
            ]],

            'integrations' => ['label' => 'Integrations', 'permissions' => [
                'integrations.view'      => ['label' => 'View integrations'],
                'integrations.configure' => ['label' => 'Configure integrations', 'sensitive' => true],
                'integrations.test'      => ['label' => 'Test integrations'],
                'integrations.secrets'   => ['label' => 'Reveal integration credentials', 'sensitive' => true],
            ]],

            'security' => ['label' => 'Security', 'permissions' => [
                'security.view'            => ['label' => 'View security'],
                'security.login_activity'  => ['label' => 'View login activity'],
                'security.sessions'        => ['label' => 'View sessions'],
                'security.revoke_sessions' => ['label' => 'Revoke sessions', 'sensitive' => true],
                'security.restrictions'    => ['label' => 'Manage user restrictions'],
                'security.suspend'         => ['label' => 'Suspend accounts', 'sensitive' => true],
                'security.policies'        => ['label' => 'Manage security policies', 'sensitive' => true],
                'security.2fa'             => ['label' => 'Manage 2FA policies', 'sensitive' => true],
                'security.logs'            => ['label' => 'View security logs'],
                'security.admin'           => ['label' => 'Manage admin security', 'sensitive' => true],
            ]],

            'roles' => ['label' => 'Administrators & Roles', 'permissions' => [
                'admins.view'       => ['label' => 'View administrators'],
                'admins.create'     => ['label' => 'Add administrators', 'sensitive' => true],
                'admins.edit'       => ['label' => 'Edit administrators', 'sensitive' => true],
                'admins.remove'     => ['label' => 'Remove administrators', 'sensitive' => true],
                'roles.assign'      => ['label' => 'Assign roles', 'sensitive' => true],
                'roles.view'        => ['label' => 'View roles'],
                'roles.create'      => ['label' => 'Create roles', 'sensitive' => true],
                'roles.edit'        => ['label' => 'Edit roles', 'sensitive' => true],
                'roles.delete'      => ['label' => 'Delete roles', 'sensitive' => true],
                'roles.permissions' => ['label' => 'Manage permissions', 'sensitive' => true],
                'admins.activity'   => ['label' => 'View admin activity'],
            ]],
        ];
    }

    /** @return array<string, array{label:string, description:string}> */
    public static function catalog(): array
    {
        $out = [];
        foreach (self::categories() as $catKey => $cat) {
            foreach ($cat['permissions'] as $key => $meta) {
                $out[$key] = [
                    'label'       => $meta['label'],
                    'description' => $cat['label'] . ' · ' . $meta['label'],
                    'category'    => $catKey,
                    'sensitive'   => $meta['sensitive'] ?? false,
                ];
            }
        }

        return $out;
    }

    public static function isValid(string $permission): bool
    {
        return isset(self::catalog()[$permission]);
    }

    /** Every valid permission key. */
    public static function all(): array
    {
        return array_keys(self::catalog());
    }

    public static function isSensitive(string $permission): bool
    {
        return (bool) (self::catalog()[$permission]['sensitive'] ?? false);
    }

    /**
     * The permission set each seeded system role starts with.
     *
     * super_admin is absent on purpose: it bypasses permission checks in
     * User::hasAdminGrant() rather than carrying a list that could drift out of
     * date as new permissions are added.
     */
    public static function systemRoleDefaults(): array
    {
        $all = self::all();

        $byCategory = function (array $cats) {
            $out = [];
            foreach (self::categories() as $key => $cat) {
                if (in_array($key, $cats, true)) {
                    $out = array_merge($out, array_keys($cat['permissions']));
                }
            }

            return $out;
        };

        $readOnly = array_values(array_filter($all, fn ($p) => str_contains($p, '.view')
            || str_ends_with($p, '.search') || str_contains($p, 'analytics.')));

        return [
            // Broad, but explicitly not role/permission management or the
            // credential-revealing integration permission.
            'admin' => array_values(array_diff(
                $byCategory(['users', 'content', 'comments', 'moderation', 'live', 'analytics', 'notifications', 'settings', 'wallet', 'payments', 'global_controls']),
                // Same pattern as the other carve-outs here: broad access,
                // minus the handful of switches that can take the whole
                // platform down (maintenance mode, emergency blocks) -
                // those stay super_admin-only by default.
                ['users.delete', 'payments.taxes', 'settings.storage', 'global_controls.emergency']
            )),

            'moderator' => array_merge(
                $byCategory(['moderation', 'comments']),
                ['users.view', 'users.search', 'users.view_360', 'users.suspend', 'users.unsuspend', 'users.restrict', 'users.unrestrict',
                 'content.view', 'content.search', 'content.hide', 'content.restore', 'content.remove', 'content.reports',
                 'live.view', 'live.moderate', 'live.end', 'live.comments', 'live.reports']
            ),

            'support_agent' => [
                'users.view', 'users.search', 'users.view_360',
                'comments.view', 'comments.view_made', 'comments.view_received', 'comments.search',
                'content.view', 'content.search',
                'security.view', 'security.login_activity',
                'notifications.view',
            ],

            'content_manager' => array_merge(
                $byCategory(['content']),
                ['comments.view', 'comments.moderate', 'analytics.content']
            ),

            'finance_manager' => array_merge(
                $byCategory(['payments', 'wallet']),
                ['users.view', 'users.search', 'analytics.revenue']
            ),

            'analytics_manager' => $byCategory(['analytics']),

            'developer' => [
                'integrations.view', 'integrations.test', 'integrations.configure',
                'settings.view', 'security.view', 'security.logs',
                'analytics.platform',
            ],
        ];
    }
}
