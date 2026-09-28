<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Push delivery
    |--------------------------------------------------------------------------
    | Both transports are optional and independently switchable. With neither
    | configured the queued job no-ops quietly, so a deployment without
    | credentials behaves exactly as it did before push existed.
    */

    'enabled' => env('PUSH_ENABLED', true),

    // How long one aggregated notification group stays quiet after its first
    // push, in seconds. Twenty people liking the same video is one buzz, not
    // twenty - see PushService::allowedByDebounce, which also lists the types
    // this never applies to. Set to 0 to disable the debounce entirely.
    'group_debounce_seconds' => env('PUSH_GROUP_DEBOUNCE_SECONDS', 60),

    // Firebase Cloud Messaging (Android). HTTP v1 API, authenticated with a
    // service-account JSON. Path to the file, NOT its contents.
    'fcm' => [
        'credentials' => env('FCM_CREDENTIALS'),          // /path/to/service-account.json
        'project_id'  => env('FCM_PROJECT_ID'),
    ],

    // Apple Push Notification service (iOS). Token-based auth with a .p8 key -
    // no certificate rotation, unlike the legacy .p12 flow.
    'apns' => [
        'key_path'  => env('APNS_KEY_PATH'),              // /path/to/AuthKey_XXXX.p8
        'key_id'    => env('APNS_KEY_ID'),
        'team_id'   => env('APNS_TEAM_ID'),
        'bundle_id' => env('APNS_BUNDLE_ID', 'com.teezer.app'),
        // Sandbox for development builds; production for TestFlight/App Store.
        'production' => env('APNS_PRODUCTION', true),
    ],
];
