# Teezer Ads System — Implementation Plan

> Production-grade advertising platform (TikTok/Reels/Shorts-class) layered onto the existing
> Teezer stack **without modifying the recommendation algorithm or any existing feature**.
> Status: **approved** (2026-07-15). Build in progress.

## Architectural decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Backend | **Laravel** (`server/`) | Go is not live; `api.teezer.live` → Laravel; production feed is `FeedService`. |
| Database | **PostgreSQL** | Live `.env` is `pgsql` (cutover 2026-06-28). Use `jsonb`, `NOW()`, `EXTRACT(EPOCH…)`. |
| Feed insertion | **`FeedService` post-hydration slot merge** | Recommender output is never modified; ads merge on top. |
| Tracking | **Existing `EventStream → Redis Stream → ClickHouse`** | Reuse verbatim with new `ad_*` event types. |

## Reused (not rebuilt)

- `promotions` table + `StudioPromotionController` + mobile `CreateCampaignWizard` + web `studio-promote-page` — **bridged** into the new engine (one-way `promotions → ad_*` adapter).
- Money: `wallets.ad_earnings`, `wallet_transactions.ad_income`, `admin_commissions` (30%), gateway services.
- `video_monetization` (rpm/cpm/`ad_revenue_sharing`, allowed/blocked regions).
- Eventing: `EventStream::push` → `analytics:events` → ClickHouse rollups; `CounterBuffer` + `counters:flush`.
- Media: `R2PresignService` (presigned PUT + signed CDN) + `ScanImage/ScanVideoJob`.
- Feed pools: `BuildFeedPools` + `feed:build-pools` cron + Redis sorted sets.
- Admin shell `NAV_GROUPS`, settings KV, `moderation` approval table, `StatusBadge`, `ConfirmModal`.
- Auth: Sanctum, `api.admin` (admin + mandatory 2FA), `optional.sanctum`, `not.banned`.

## New schema (all `ad_*`, additive)

Core hierarchy: `ad_accounts` → `ad_campaigns` → `ad_groups` → `ad_creatives`; plus `ad_placements`.
Delivery/money: `ad_stats_daily` (rollup), `ad_ledger` (double-entry), `ad_invoices`, `ad_fraud_events`, `ad_reviews`.
High-volume streams (`ad_impression`/`ad_click`/`ad_conversion`) → ClickHouse + Redis counters (not Postgres rows).
Settings → existing `/admin/settings` KV under an `ads` group. Frequency caps + live spend → Redis keys.

## Ad decisioning (Ad Server, Redis, <5ms)

1. **Candidate selection** — placement pool → targeting match (geo/age/gender/lang/interests) + active + budget-remaining + frequency-cap OK.
2. **Prediction** — `pCTR` + `qualityScore` via a pluggable `AdPredictor` interface (heuristic v1, ML v2).
3. **Auction** — rank by `eCPM = bid × pCTR × quality`; **second-price (GSP)**; respect placement floor.
4. **Serve & log** — inline sponsored item; decrement Redis freq/pacing; bill only on viewable impression (signed token).

Isolation: `FeedService` produces the organic list first; the Ad Server fills reserved slots independently. No-fill → organic video (graceful).

## Backward-compatibility contract

- Recommender ranking is **never edited**.
- All ad tables are new (`ad_*`); no existing table refactored (additive columns only, avoided where possible).
- Existing endpoints keep their exact contracts; wizard/promote page unchanged.
- Feed insertion gated by `config('ads.enabled')` / `ADS_ENABLED` — ships **off**.
- Ad-Server failure/no-fill degrades to a normal organic video.

## Development phases

| Phase | Scope | Flag |
|---|---|---|
| **P0** | Migrations + models + `promotions→ad_*` adapter + seed placements + `config/ads.php` | no behavior change |
| **P1** | Advertiser API (Campaign/AdGroup/Creative CRUD + R2 creative upload); bridge promotions | additive |
| **P2** | Admin "Ads Management" menu + sub-pages + `AdminAdController` + approval + settings | additive |
| **P3** | Ad Server (pool cron, targeting, auction, frequency cap) — off-path, unit-tested | off-path |
| **P4** | Feed insertion + inline sponsored shape + client `SponsoredFeedItem` + `/ad-events` + rollup | `ads.enabled=off` |
| **P5** | Budget/pacing (Redis) + prepaid wallet + reconciliation → `ad_ledger` + creator rev-share | additive |
| **P6** | Advertiser dashboard + admin Overview + per-campaign insights from `ad_stats_daily` | additive |
| **P7** | Fraud scoring + auto-refund + admin Fraud page + perf pass | additive |
| **P8** | Swap heuristic predictor for trained CTR/CVR model behind the same interface | optional |

## Confirmed decisions

1. Self-serve advertiser first (user = ad account); brand/agency accounts supported by schema, enabled later.
2. Full Campaign → Ad Group → Creative; `promotions` bridged in.
3. CPM + CPC + CPV; second-price auction on `eCPM`.
4. Prepaid ad wallet now; `ad_invoices` keeps postpaid/credit open.
5. First surfaces: in-feed + profile-top (render specs from screenshots); others disabled.
6. Build P0–P3 fully; enable feed ads (P4) only after staging validation.

_Full rendered plan: the published artifact (Teezer Ads System — Implementation Plan)._
