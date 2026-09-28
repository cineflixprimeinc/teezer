// VPS-2 - the WORKER box (Teezer, 77.237.243.122). Does the heavy lifting so VPS-1 stays fast for users.
// Reaches VPS-1's PostgreSQL (PgBouncer :6432) and Redis over an SSH tunnel / private link - see DEPLOYMENT.md.
// Each queue type gets its own worker so a long video transcode never blocks a
// quick moderation scan, public-media mirror copy, or notification.
//
//   transcoding  → ffmpeg video qualities, thumbnails, audio mix, remux (heaviest)
//   media-mirror → B2 public mirror copies/verifications for cacheable playback
//   transcoding-backfill → old-library HLS catch-up, isolated from fresh uploads
//   video-transfer → api.video output -> B2 (TransferEncodedOutputToB2), isolated
//                    so a slow multi-segment pull never blocks a fresh
//                    local-ffmpeg transcode on the `transcoding` queue, and
//                    vice versa - the two pipelines never compete for workers
//   moderation   → AI image/video content scans
//   default/notifications/post-notifications → light jobs (score updates,
//                        push, and the new-post fan-out to followers)
//
// Start on VPS-2 with:  pm2 start deploy/pm2/ecosystem.worker.config.js && pm2 save
// (filename MUST end in .config.js so pm2 expands `apps` instead of running the file as a script)
module.exports = {
  apps: [
    {
      name: "teezer-transcoding",
      cwd: "/var/www/teezer/server",
      script: "artisan",
      interpreter: "php",
      // Must stay ABOVE TranscodeVideoToHls's own $timeout (3500s) - the job
      // sets its own alarm and fails itself cleanly (hls_status='failed',
      // temp dir removed) at that mark. If this CLI flag is lower, as it was
      // before (900s, sized for the older/shorter ProcessVideoQualities job),
      // the worker process gets SIGKILLed by artisan BEFORE the job's own
      // graceful timeout ever fires - no hls_status update, no temp dir
      // cleanup, and the video is left stuck mid-transcode indefinitely.
      args: "queue:work --queue=transcoding --tries=2 --timeout=3600 --sleep=2",
      exec_mode: "fork",
      instances: 3, // pm2 creates teezer-transcoding-0/1/2; match to CPU cores
      env: { APP_ENV: "production" },
    },
    {
      name: "teezer-media-mirror",
      cwd: "/var/www/teezer/server",
      script: "artisan",
      interpreter: "php",
      args: "queue:work --queue=media-mirror --tries=6 --timeout=3600 --sleep=2",
      exec_mode: "fork",
      instances: 1,
      env: { APP_ENV: "production" },
    },
    {
      name: "teezer-transcoding-backfill",
      cwd: "/var/www/teezer/server",
      script: "artisan",
      interpreter: "php",
      args: "queue:work --queue=transcoding-backfill --tries=2 --timeout=3600 --sleep=2",
      exec_mode: "fork",
      instances: 1,
      env: { APP_ENV: "production" },
    },
    {
      name: "teezer-video-transfer",
      cwd: "/var/www/teezer/server",
      script: "artisan",
      interpreter: "php",
      // Same reasoning as teezer-transcoding's own comment above: must stay
      // ABOVE TransferEncodedOutputToB2's own $timeout (1800s), or artisan
      // SIGKILLs the worker before the job's own graceful failure path
      // (markFailed + temp dir cleanup) ever runs.
      args: "queue:work --queue=video-transfer --tries=3 --timeout=1900 --sleep=2",
      exec_mode: "fork",
      instances: 1,
      env: { APP_ENV: "production" },
    },
    {
      name: "teezer-moderation",
      cwd: "/var/www/teezer/server",
      script: "artisan",
      interpreter: "php",
      args: "queue:work --queue=moderation --tries=2 --timeout=300 --sleep=3",
      exec_mode: "fork",
      instances: 1,
      env: { APP_ENV: "production" },
    },
    {
      // `post-notifications` (NotifyFollowersOfNewPost, dispatched by
      // VideoObserver on publish) is in this list because the live worker on
      // VPS2 already drains it - it was added to the running process by hand
      // and never written back here, so this file claimed a queue had no
      // consumer when it did. Written down now so a pm2 restart from this
      // file cannot silently drop it.
      name: "teezer-queue",
      cwd: "/var/www/teezer/server",
      script: "artisan",
      interpreter: "php",
      args: "queue:work --queue=default,notifications,post-notifications --tries=3 --timeout=120 --sleep=3",
      exec_mode: "fork",
      instances: 1,
      env: { APP_ENV: "production" },
    },
  ],
};
