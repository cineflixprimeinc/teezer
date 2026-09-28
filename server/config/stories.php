<?php

/**
 * Story settings schema.
 *
 * This file IS the contract for `stories.settings`. Adding a story feature means
 * adding an entry here - no migration, no model change, no API change, and every
 * existing story immediately answers with the declared default.
 *
 * StoryController validates writes against this and rejects anything not
 * declared, so an unknown key cannot be smuggled into the document and a
 * mistyped one fails loudly instead of being silently stored and ignored.
 *
 * `enabled` is the admin kill switch. Off means the setting is not accepted on
 * write and reads fall back to `default` - so turning a feature off disables it
 * everywhere at once, including for stories that had already set it.
 *
 * When the admin panel lands it writes rows with exactly this shape and this
 * file becomes the seed. Nothing downstream changes: the resolver reads whatever
 * source is authoritative.
 */

return [

    /**
     * Which visibilities may be chosen. Removing one here stops it being
     * accepted on new stories; it does NOT retroactively change stories already
     * posted with it, because that would silently widen or narrow an audience
     * the author chose.
     */
    'visibilities' => ['everyone', 'followers', 'close_friends', 'only_me'],

    /**
     * Hard limits. Enforced server-side on write, and reported to clients so a
     * picker can stop at the limit rather than failing on save.
     */
    'limits' => [
        'close_friends' => 500,
        'hidden_users'  => 500,
        'per_day'       => 50,
    ],

    /**
     * The settings document. `type` drives validation; `default` is used
     * whenever a story has no explicit value, which is most of them.
     *
     * Order is the order an admin panel would render them.
     */
    'settings' => [

        'show_view_count' => [
            'type'    => 'boolean',
            'default' => true,
            'enabled' => true,
            'label'   => 'Show view count',
            'help'    => 'Only ever to the author. Viewers never see a count.',
        ],

        'allow_reactions' => [
            'type'    => 'boolean',
            'default' => true,
            'enabled' => true,
            'label'   => 'Allow reactions',
        ],

        'allow_save' => [
            'type'    => 'boolean',
            'default' => false,
            'enabled' => true,
            'label'   => 'Allow viewers to save',
        ],

        'share_to_feed' => [
            'type'    => 'boolean',
            'default' => false,
            'enabled' => false, // needs the cross-post job - see the roadmap
            'label'   => 'Also share to feed',
        ],

        'share_to_spaces' => [
            'type'    => 'boolean',
            'default' => false,
            'enabled' => false, // needs the Spaces profile card
            'label'   => 'Show on Spaces profile',
        ],

        /**
         * Declared and off. Notifying on a screenshot needs client detection that
         * does not exist, and iOS only reports it after the fact - so this is the
         * shape it will take when it is real, not a promise that it works.
         */
        'screenshot_notice' => [
            'type'    => 'boolean',
            'default' => false,
            'enabled' => false,
            'label'   => 'Notify me of screenshots',
        ],

        /**
         * Hours until expiry. A number rather than a boolean because the brief
         * asks for 24/48/custom, and a range is the honest way to say that.
         */
        'expires_hours' => [
            'type'    => 'integer',
            'default' => 24,
            'min'     => 1,
            'max'     => 168,
            'enabled' => true,
            'label'   => 'Expires after (hours)',
        ],
    ],
];
