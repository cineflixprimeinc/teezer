<?php

use App\Jobs\AggregateCreatorAnalytics;
use App\Jobs\PurgeExpiredTokens;
use Illuminate\Support\Facades\Schedule;

// Purge Sanctum tokens that have passed their expiry date - runs daily at 3:00 AM
Schedule::job(new PurgeExpiredTokens())->dailyAt('03:00');

// Aggregate creator analytics for the previous day - runs daily at 2:00 AM
Schedule::job(new AggregateCreatorAnalytics())->dailyAt('02:00');

// Prune expired Sanctum tokens via built-in artisan command
Schedule::command('sanctum:prune-expired --hours=24')->weekly();

// Expire time-limited admin content restrictions every 5 minutes
Schedule::command('restrictions:expire')->everyFiveMinutes();

// Restore Global Reelsoo Control toggles whose temporary restriction (spec §28) has expired.
Schedule::command('global-controls:restore-expired')->everyFiveMinutes()->withoutOverlapping();

// Flush Redis-buffered engagement counters (views, …) into Postgres every
// minute - one batched UPDATE per table instead of an UPDATE per event.
Schedule::command('counters:flush')->everyMinute()->withoutOverlapping();

// Aggregate the Redis-buffered Screen Time (active in-app usage) into Postgres
// every 5 minutes - keeps per-user DB writes off the heartbeat hot path.
Schedule::command('screen-time:flush')->everyFiveMinutes()->withoutOverlapping();

// Rebuild the precomputed feed pools (trending/fresh Redis sorted sets) -
// all For-You scoring happens here, never at request time.
Schedule::command('feed:build-pools')->everyFifteenMinutes()->withoutOverlapping();

// Rebuild the eligible ad pools the ad server serves from (Redis). Cheap; off the feed path.
Schedule::command('ads:build-pools')->everyFiveMinutes()->withoutOverlapping();

// Reconcile buffered ad spend into the ledger + budgets (auto-pauses exhausted campaigns).
Schedule::command('ads:settle')->everyMinute()->withoutOverlapping();

// Retention: keep only the last 7 days of profile views - runs daily at 04:00.
Schedule::command('profile-views:prune')->dailyAt('04:00')->withoutOverlapping();

// Story analytics reconciliation. The rollup is maintained inline on every
// write, so this is the safety net rather than the mechanism: it backfills
// stories that predate the rollup and repairs any row where the process died
// between writing the source row and updating the rollup. Recomputing from
// source is idempotent, so a run that finds nothing wrong costs only time.
Schedule::command('stories:rebuild-analytics')->everyFifteenMinutes()->withoutOverlapping();

// The raw per-slide event log is append-only and grows without bound by design.
// Trimmed once a day, separately from the reconcile above so a long prune can
// never delay the thing that keeps counters correct.
Schedule::command('stories:rebuild-analytics --prune --limit=1')->dailyAt('04:30')->withoutOverlapping();

// Repair videos still stuck on their raw "videos/original/…" upload (moov atom
// usually at the end, forcing the player to fetch the file tail before it can
// start playback) - catches uploads whose ProcessAudioMix job crashed/timed
// out mid-run and never reached its own faststart-repair fallback.
Schedule::command('videos:faststart')->everyThirtyMinutes()->withoutOverlapping();

// QR-code login tickets (QrLoginController) are minutes-lived by design - a
// day's grace past expiry (not an immediate delete) keeps a just-expired row
// around long enough to be useful in support/abuse investigations, without
// letting the table grow unbounded.
Schedule::call(fn () => \App\Models\QrLoginTicket::where('expires_at', '<', now()->subDay())->delete())
    ->daily();

// Give videos with no HLS ladder yet one (uploaded before HLS transcoding
// existed, or a transcode that never got queued). This command was written
// but never scheduled anywhere, so the entire pre-HLS library was silently
// stuck serving progressive mp4 forever - a small, capped slice every 30
// minutes on its own worker so it doesn't compete with new uploads on the
// fresh transcoding queue. --retry-failed deliberately omitted: a source FFmpeg
// genuinely can't read fails identically every run and shouldn't burn a slot on
// every pass.
Schedule::command('videos:backfill-hls --limit=60 --queue=transcoding-backfill')->hourly()->withoutOverlapping();

// Backstop for the api.video pipeline (see the command's own doc comment for
// the two real gaps this closes) - webhooks are still the fast path, this
// only catches what a webhook missed. No-op and cheap when nothing is stuck.
Schedule::command('videos:reconcile-processing')->everyFifteenMinutes()->withoutOverlapping();

// Multipart uploads nobody ever finished (crash, closed tab, or a deliberately
// abandoned upload used to run up storage costs) leave every part already
// sent sitting in the bucket, billed like any other stored bytes and invisible
// in a normal object listing. Daily is enough - the 48h default grace window
// means this only ever touches uploads long past the point a real client would
// still be resuming one.
Schedule::command('videos:abort-stale-multipart-uploads')->dailyAt('04:30')->withoutOverlapping();

// Premium's monthly coin bonus. Daily, not monthly: members are paid on their own
// subscription anniversary, so a different subset comes due each day. The grant is
// keyed on (subscription, month) so re-running it cannot pay anyone twice.
Schedule::command('premium:grant-coins')->dailyAt('05:00')->withoutOverlapping();

// ── Monetization ──────────────────────────────────────────────────────────
// Re-measure every creator's programme standing once a day. Eligibility is
// computed on every read, so this is not what keeps the app correct - it keeps
// the SNAPSHOT current for history and for "everyone active on X", and catches
// anything an event hook missed.
Schedule::command('monetization:daily-recheck')->dailyAt('04:00');

// The ongoing conditions need a memory of last month, which live metrics do not
// have. Runs on the 2nd so the month being judged is fully closed.
Schedule::command('monetization:monthly-review')->monthlyOn(2, '05:00');

// Exchange rates for the global pricing system. Twice a day is ample: quotes
// come from Redis and, on a miss, from the durable exchange_rates rows, so a
// skipped run degrades to a slightly older rate rather than to no price at all.
// withoutOverlapping because a slow provider must not stack runs on top of
// each other.
Schedule::command('pricing:refresh-rates')
    ->twiceDaily(4, 16)
    ->withoutOverlapping()
    ->runInBackground();

// Country metadata (flags/currencies/calling codes/etc.) from countries.dev.
// Weekly is ample - this data changes rarely. A no-op when
// COUNTRIES_DEV_ENABLED=false (the default); a failed/partial run leaves
// existing country_metadata rows exactly as they were - see CountriesSync's
// own docblock.
Schedule::command('countries:sync')
    ->weekly()
    ->withoutOverlapping()
    ->runInBackground();

/*
 * Fulfils "Notify when available" for people who became eligible on their own.
 *
 * The admin path announces the moment a programme is switched on, but a user
 * can also cross a follower count, a country rollout, or finish payout setup
 * long after that - and nobody toggles anything when they do. Hourly is enough
 * for a thing that has been waiting anyway, and the run costs nothing when
 * there is nothing to send: only un-notified rows are ever selected.
 */
Schedule::command('monetization:notify-waitlists')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

/*
| Licence heartbeat - CLIENT SIDE, and the ONLY scheduled call a customer
| installation makes to our infrastructure.
|
| Inert on reelsoo.com: LicenseHeartbeat returns immediately when
| licensing.client.enabled is false, so the licensor never phones itself.
|
| --quiet-fail so a revoked or unreachable licence does not fill the scheduler
| log with failures; the command records the status locally either way, and the
| local middleware is what acts on it. onOneServer() because a two-VPS install
| sharing one database must send ONE heartbeat, not one per box - two would look
| to the licence server like two installations on one licence.
*/
Schedule::command('license:heartbeat --quiet-fail')
    ->daily()
    ->at('03:17')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();
