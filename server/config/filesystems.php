<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    | Set FILESYSTEM_DISK=public for local development.
    | Set FILESYSTEM_DISK=b2 in production to route all uploads to Backblaze B2.
    */
    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    */
    'disks' => [

        'local' => [
            'driver' => 'local',
            'root'   => storage_path('app/private'),
            'serve'  => true,
            'throw'  => false,
        ],

        'public' => [
            'driver'     => 'local',
            'root'       => storage_path('app/public'),
            'url'        => env('APP_URL') . '/storage',
            'visibility' => 'public',
            'throw'      => false,
        ],

        /*
        |----------------------------------------------------------------------
        | Backblaze B2 - S3-compatible object storage
        |----------------------------------------------------------------------
        | All production uploads (videos, thumbnails, avatars, documents) go
        | here, and are read back through the media.reelsoo.com Cloudflare
        | Worker. Never expose these credentials to the mobile app or browser -
        | uploads go through a presigned URL minted by the API, never with the
        | bucket key in the client.
        |
        | Required .env keys:
        |   B2_APPLICATION_KEY_ID
        |   B2_APPLICATION_KEY
        |   B2_BUCKET                (e.g. reelsoo-media-prod)
        |   B2_ENDPOINT              (https://s3.<region>.backblazeb2.com)
        |   B2_REGION                (e.g. us-west-004 - must match the endpoint)
        |   MEDIA_URL                (https://media.reelsoo.com - public CDN host)
        |
        | visibility is 'private' and that is NOT a typo to be "fixed" later.
        | Laravel's 'public' visibility puts `x-amz-acl: public-read` on every
        | PutObject. Backblaze rejects that header on a private bucket, so every
        | single upload 400s the moment you flip it to 'public' - with an error
        | that reads like a credentials problem and sends you hunting in the
        | wrong place. The bucket is private at the B2 end by design: the Worker
        | holds the only credentials, which is exactly what stops anyone from
        | bypassing Cloudflare and pulling an unsigned passport scan straight
        | out of the bucket.
        |
        | Path-style addressing (bucket in the path, not the host) is the
        | default and should stay that way while the bucket name contains
        | uppercase letters. Virtual-hosted style would put that name in the
        | hostname; DNS lowercases it in transit while SigV4 signs the original,
        | and B2 answers every request with a 403 that gives no hint the cause
        | was capitalisation. Path-style is correct for any bucket name.
        */
        'b2' => [
            // s3-signed, not s3: the disk's url() must return a signed link
            // because the media origin rejects an unsigned path. See
            // SignedFilesystemAdapter - everything else is the stock S3 driver.
            'driver'                  => 's3-signed',
            'key'                     => env('B2_APPLICATION_KEY_ID'),
            'secret'                  => env('B2_APPLICATION_KEY'),
            'region'                  => env('B2_REGION', 'us-east-005'),
            'bucket'                  => env('B2_BUCKET'),

            /*
             * Public URL base.
             *
             * B2 serves its own objects under /file/{bucket}/{key}. When the CDN
             * hostname points straight at B2 - which is the case whenever there
             * is no signing proxy in front - that prefix has to be in every URL
             * or each one 404s while the object sits there perfectly fine. It is
             * derived here rather than baked into MEDIA_URL so the hostname stays
             * a hostname and nobody has to remember the rule.
             *
             * Set B2_SERVE_DIRECT=false once the nginx signing origin is running:
             * nginx adds /file/{bucket} itself when it proxies, so leaving this on
             * would double the prefix and 404 everything.
             */
            'url'                     => env('B2_SERVE_DIRECT', true)
                ? rtrim((string) env('MEDIA_URL'), '/') . '/file/' . env('B2_BUCKET')
                : env('MEDIA_URL'),
            'endpoint'                => env('B2_ENDPOINT'),
            'use_path_style_endpoint' => env('B2_USE_PATH_STYLE', true),

            /*
             * MUST match the bucket's own type. Laravel turns this into a
             * canned ACL header on every PutObject, and B2 rejects the one that
             * disagrees with the bucket - in BOTH directions:
             *
             *   public bucket  + 'private' -> InvalidArgument: Unsupported
             *                                 value for canned acl 'private'
             *   private bucket + 'public'  -> rejects x-amz-acl: public-read
             *
             * Neither failure mentions the bucket, so it reads as a credentials
             * problem. It surfaces on WRITE only, which is worse: reads keep
             * working and everything looks healthy until a transcode tries to
             * upload its first segment.
             *
             * Defaulted off B2_SERVE_DIRECT because the two always move
             * together - serving straight from B2 requires a public bucket,
             * putting nginx in front requires a private one - so one flag keeps
             * them from drifting apart. B2_VISIBILITY overrides if they ever
             * genuinely need to differ.
             */
            'visibility'              => env('B2_VISIBILITY', env('B2_SERVE_DIRECT', true) ? 'public' : 'private'),
            'throw'                   => true,
        ],

        /*
        |----------------------------------------------------------------------
        | b2_releases - marketplace release packages. SEPARATE BUCKET.
        |----------------------------------------------------------------------
        | Deliberately NOT the 'b2' disk above, and the separation is a security
        | boundary rather than tidiness.
        |
        | The media bucket is fronted by cdn.reelsoo.com / media.reelsoo.com, and
        | deploy/nginx/reelsoo-media.conf proxies requests straight through as
        |     proxy_pass https://b2_origin/file/$b2_bucket$uri;
        | Any object in that bucket is therefore reachable at a predictable URL
        | the moment that origin is enabled. A release package sitting there
        | would make the entire product source downloadable to anyone who guessed
        | the path, with the licence check bypassed completely - the exact
        | failure the marketplace design exists to prevent.
        |
        | So releases get their own private bucket with their own application
        | key, and that key should be scoped to this bucket alone: if it ever
        | leaks it must not also expose customer media.
        |
        | There is NO 'url' key. A release is only ever handed out as a
        | short-lived presigned URL minted by ReleaseAuthorizer; nothing should
        | be able to build a permanent public link to one by calling url().
        |
        | Falls back to the B2_* media credentials ONLY for the endpoint/region,
        | which are account-wide. Bucket and keys must be set explicitly - see
        | LicenseReleasePublish, which refuses to upload when they are not.
        */
        'b2_releases' => [
            'driver'                  => 's3',
            'key'                     => env('B2_RELEASES_APPLICATION_KEY_ID'),
            'secret'                  => env('B2_RELEASES_APPLICATION_KEY'),
            'region'                  => env('B2_RELEASES_REGION', env('B2_REGION', 'us-east-005')),
            'bucket'                  => env('B2_RELEASES_BUCKET'),
            'endpoint'                => env('B2_RELEASES_ENDPOINT', env('B2_ENDPOINT')),
            'use_path_style_endpoint' => env('B2_USE_PATH_STYLE', true),
            'visibility'              => 'private',
            'throw'                   => true,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    | Used only in local/public disk mode. Run `php artisan storage:link`.
    */
    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
