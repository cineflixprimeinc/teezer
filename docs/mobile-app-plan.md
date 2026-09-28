# Reelsoo Mobile App - Build Plan (Living Document)

> **Status:** Phase 1 (project setup) complete - scaffold in `mobile/`. Next: Phase 2 (auth).
> **Last updated:** 2026-06-25
> Keep this file updated as phases complete. Tick the checkboxes and add notes per phase.

Reelsoo brand: name **Reelsoo**, slogan **"Create your trend"**, primary **#fe2c55**, **light theme first**, consistent icon set, custom bottom nav with a highlighted center **Create +** button.

---

## 1. Current tech stack (existing, do NOT rebuild)

| Layer | Tech |
|---|---|
| Backend | **Laravel 12**, PHP 8.2, served by **nginx + php-fpm** on two VPS behind a Cloudflare load balancer |
| Auth | **Laravel Sanctum** personal access tokens (Bearer), 30-day expiry, no refresh token |
| API base | `https://api.reelsoo.com/api/v1` (all endpoints under `/api/v1`) |
| Media | **Cloudflare R2** (`media.reelsoo.com`), direct **presigned PUT** uploads from client; signed CDN read URLs (24h public / 2h private) |
| Search | Meilisearch (proxied via `/search`) |
| Web frontend | Next.js 16 (React 19) - **reference for UX parity, not reused in mobile** |
| Realtime | **None** (DM is polling; no WebSocket/Pusher) |
| Push | Device-token storage exists; **delivery job is a stub** (no FCM/APNs yet) |

**Auth specifics that shape the app:**
- Token returned as `data.token` (+ `token_type`, `expires_at`, `user`) on login/register.
- **Turnstile CAPTCHA** is checked on **login only**, and **fails open** if the secret is unset or Cloudflare is unreachable. It is currently enabled in prod → see decision **D3**.
- Signup is an **email-OTP flow** (not a single call): `send-otp` → `verify-otp` → `register` with `draft_token`.
- Optional `X-Device-Fingerprint` header improves rate-limiting accuracy (recommended for mobile to avoid carrier-NAT false positives).
- `is_banned` / restrictions are surfaced via `/account/status` + `/account/restrictions`.

---

## 2. Recommended framework: **Expo (React Native) with Dev Client + EAS**

**Decision: Expo, managed workflow with a custom Dev Client, built via EAS.** Rationale:

- Everything the app needs is first-class in Expo today: `expo-video` (feed player), `expo-camera` + `expo-image-picker` (upload), `expo-secure-store` (token), `expo-notifications` (push), `expo-apple-authentication` + Google sign-in, `expo-av`/audio, deep linking, and **EAS Build** for APK/AAB/IPA + TestFlight. No native module here lacks Expo support.
- One codebase, OTA updates (EAS Update) for JS-only fixes, and the fastest path to a **dev build on Android first, then iOS** (matches your deployment order).
- RN CLI would only be justified if a required native lib had no Expo plugin - not the case.

**Monorepo placement:** new top-level **`mobile/`** directory (alongside `server/`, `frontend/`, `admin/`, `music/`). Shares the repo + deploy discipline; independent build pipeline (EAS).

**Navigation lib:** `@react-navigation/native` + native-stack + bottom-tabs with a **custom tab bar** (7 tabs, center Create as a raised pink FAB). (`expo-router` is an option but React Navigation gives more control over the custom center button - chosen for the approved design.)

**State/data:** `@tanstack/react-query` (server cache, pagination, retries) + `zustand` (auth/session/UI) - mirrors the web app so mental model carries over.

---

## 3. API readiness report

Legend: ✅ ready (reuse) · ⚠️ partial · ❌ missing (build)

| App area | Endpoint(s) | Status |
|---|---|---|
| **Login** | `POST /auth/login` (Bearer token, Turnstile-gated) | ✅ |
| **Signup (OTP)** | `POST /auth/send-otp` → `POST /auth/verify-otp` → `POST /auth/register` (`draft_token`) | ✅ |
| **Username check** | `GET /auth/check-username` | ✅ |
| **Me / auto-login** | `GET /auth/me` | ✅ |
| **Logout / all** | `POST /auth/logout`, `/auth/logout-all` | ✅ |
| **Password reset** | `POST /auth/forgot-password`, `/auth/reset-password` | ✅ |
| **2FA** | `/auth/two-factor/*`, `/auth/two-factor-challenge` | ✅ |
| **Google / Apple / TikTok login** | - | ❌ **build** |
| **For You feed** | `GET /feed/for-you` (page, `exclude_ids[]`) | ✅ |
| **Following feed** | `GET /videos/following` | ✅ |
| **Video detail** | `GET /videos/{id}` (full VideoResource) | ✅ |
| **Like / save / share / report / not-interested** | `POST /videos/{id}/toggle-like|toggle-save|share|report|not-interested` | ✅ |
| **Watch tracking** | `POST /watch/start|progress|end` | ✅ |
| **Upload (presigned)** | `POST /videos/upload-url` → PUT to R2 → `POST /videos/complete-upload`; `POST /videos/thumbnail-url` | ✅ |
| **Photo carousel** | `media_items[]` on complete-upload | ✅ |
| **Text posts** | - (**removed** from backend, migration `2026_06_22_000001`) | ❌ see **D2** |
| **Comments (list/add/reply/like/report/pin/delete)** | `GET /videos/{id}/comments`, `POST /videos/{id}/comments`, `/comments/{id}/react|pin|report`, etc. | ✅ |
| **Explore / search** | `GET /search`, `/explore/trending`, `/explore/hashtags`, `/explore/hashtags/{name}` | ✅ |
| **Music / audio** | `GET /music/library|picker|trending`, `/music/{id}`, `/music/{id}/videos`, `POST /music/{id}/use` | ✅ |
| **Stories** | `GET /stories/feed`, `POST /stories`, view/react/reply | ✅ |
| **Follows / requests / suggestions** | `/users/{username}/follow`, `/users/{username}/followers|following`, `/users/follow-requests/*`, `/suggestions/profiles` | ✅ |
| **Profile (own/public)** | `GET /profile`, `PUT /profile`, `POST /profile/avatar`, `GET /users/{username}` | ✅ |
| **Profile cover image** | - | ❌ small build |
| **Block / blocked list** | `/users/{username}/block`, `GET /users/blocked` | ✅ |
| **Report a USER** | - (only video/comment report exist) | ❌ small build |
| **Notifications (list/read/unread)** | `GET /notifications`, `/notifications/unread-count`, `/notifications/{id}/read`, `/read-all` | ✅ |
| **Messages (list/history/send/requests/actions)** | `/messages/conversations*`, `/messages/requests/*`, `/messages/{id}` | ✅ (polling) |
| **Settings (account/privacy/notif/content/accessibility/sessions)** | `/account/*`, `/profile/privacy|notifications|content-preferences|accessibility` | ✅ |
| **Device token registration** | `POST /devices`, `DELETE /devices/{id}` | ✅ (storage only) |
| **Push delivery (FCM/APNs)** | `SendPushNotification` job is a stub | ❌ **build** |

---

## 4. Missing backend APIs (prioritized)

**P0 - needed for a usable v1**
1. **Social login** (`POST /auth/social/google`, `POST /auth/social/apple`): verify the provider ID token server-side (Google: tokeninfo/JWKS; Apple: Apple JWKS), find-or-create the user, issue a Sanctum token (same shape as login). **Apple Sign-In is mandatory by App Store review if Google login is offered.** TikTok deferred.
2. **Turnstile mobile path** (decision **D3**): either gate Turnstile to web only, or accept the Cloudflare RN Turnstile token. Lowest-effort: skip Turnstile when the request comes from the app client (app sends `X-Client: reelsoo-mobile`) and rely on the existing rate-limiter + device fingerprint.

**P1 - needed before public launch**
3. **Push delivery**: implement `SendPushNotification` with **Expo Push API** (simplest for an Expo app - one HTTP call, handles both APNs+FCM) OR Firebase Admin. Device tokens already stored via `POST /devices`.

**P2 - polish / parity**
4. Profile **cover image** upload endpoint.
5. **Report a user** endpoint (`POST /users/{username}/report`).
6. "**About this account**" panel + "**add to favourite**" a creator (optional).
7. **Cursor pagination** for the feed (current is page-based; fine for v1, revisit at scale).

> Rule: before building any screen, confirm the endpoint above. Reuse first; only add an endpoint when truly missing, keep responses lightweight, paginate everything.

---

## 5. Mobile folder structure (`mobile/`)

```
mobile/
  app.config.ts            # Expo config (name, icon, splash, plugins, env via extra)
  eas.json                 # dev / staging / production build profiles
  babel.config.js
  tsconfig.json
  .env.development / .env.staging / .env.production   # via expo-constants / dotenv
  src/
    api/                   # axios client + per-domain endpoints (auth, feed, upload, comments, ...)
      client.ts            # base axios: baseURL, Bearer interceptor, device-fingerprint, 401 handler
      auth.api.ts  feed.api.ts  video.api.ts  upload.api.ts  comments.api.ts
      profile.api.ts  social.api.ts  notifications.api.ts  messages.api.ts  music.api.ts  search.api.ts
    assets/                # logo, icons, splash, fonts, lottie (double-tap heart)
    components/            # reusable UI: Avatar, VerifiedBadge, Button, BottomSheet, VideoActions, ...
    constants/             # colors (#fe2c55), spacing, typography, config keys
    hooks/                 # useAuth, useFeed, useVideoPlayer, useInfiniteList, useUpload, ...
    navigation/            # RootNavigator, AuthStack, MainTabs(custom bar), per-tab stacks
    screens/               # one folder per screen group (auth/, feed/, explore/, upload/, profile/, ...)
    store/                 # zustand stores (auth, session, upload, ui) + react-query setup
    types/                 # shared TS types mirroring API resources (Video, User, Comment, ...)
    utils/                 # formatters, url helpers, secureStore, validators, fingerprint
```

---

## 6. Environment configuration

Via `app.config.ts` `extra` (read with `expo-constants`), one file per environment:

| Key | dev | staging | production |
|---|---|---|---|
| `API_BASE_URL` | `http://<LAN-IP>:8000/api/v1` or staging | `https://api-staging.reelsoo.com/api/v1` | `https://api.reelsoo.com/api/v1` |
| `MEDIA_BASE_URL` | `https://media.reelsoo.com` | same | `https://media.reelsoo.com` |
| `APP_NAME` | Reelsoo (Dev) | Reelsoo (Staging) | Reelsoo |
| `APP_ENV` | development | staging | production |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` | … | … | … |
| `SENTRY_DSN` (optional) | … | … | … |

EAS profiles in `eas.json`: `development` (dev client, internal), `preview` (APK for testers), `production` (AAB/IPA store).

---

## 7. Auth strategy for mobile

1. **Token storage:** `expo-secure-store` (Keychain/Keystore). Never AsyncStorage for tokens.
2. **axios client:** request interceptor adds `Authorization: Bearer <token>`, `X-Device-Fingerprint: <stable-uuid-hash>`, `X-Client: reelsoo-mobile`, and a descriptive `User-Agent`. Response interceptor: on 401 → clear token + route to Auth stack.
3. **Auto-login:** on boot, if a token exists call `GET /auth/me`; success → Main, failure/401 → Auth.
4. **Signup:** screen drives the OTP flow (`send-otp` → enter code → `verify-otp` → collect name/username/password/**DOB**/country → `register` with `draft_token`).
5. **Turnstile:** per **D3**.
6. **Social:** Google (`@react-native-google-signin`/`expo-auth-session`) + Apple (`expo-apple-authentication`) → send provider token to the new `/auth/social/*` endpoint → receive Sanctum token.
7. **Logout:** `POST /auth/logout`, clear secure store, reset query cache + zustand.

---

## 8. Phased build order (maps to your 16 phases)

- [x] **Phase 1 - Project setup:** Expo app in `mobile/`, folder structure, env config, theme/constants, axios client + secure-store, base navigation shell (auth gating + 7-tab custom bar with pink Create FAB + placeholder screens). *(done 2026-06-25)*
- [ ] **Phase 2 - Auth:** splash/onboarding (3 screens) → login, OTP signup (+DOB), auto-login, secure token, logout, auth store. *(Google/Apple after backend `/auth/social/*`)*
- [ ] **Phase 3 - Navigation:** Root → Auth stack / Main tabs (Home, Explore, Audio, **Create+**, Friends, Inbox, Profile) with custom center FAB; per-tab native stacks; deep-linking config.
- [ ] **Phase 4 - Home feed:** full-screen vertical `expo-video` feed, For You/Following tabs, one-video-plays + viewability, thumbnails/placeholders, action rail (like/comment/save/share/follow), caption/username/verified/sound, conditional tagged/location/AI labels, double-tap like, watch tracking.
- [ ] **Phase 5 - Upload/Create:** type switch (video/photo) with discard guard, presigned R2 upload, cover selection, carousel (≤10 photos, ≤20MB, jpg/jpeg/png/webp), caption/hashtags/tag-people/location/category/music/privacy/AI/permissions, processing status. *(Text post per **D2**.)*
- [ ] **Phase 6 - Comments:** bottom sheet, list (paginated), add/reply/like/mention/report/delete/pin, ranked-commenter labels.
- [ ] **Phase 7 - Profile:** header (avatar/cover/name/verified/creator level/bio/location/social), Reels grid first, edit profile, share, three-dot (about/favourite/block/report), settings entry.
- [ ] **Phase 8 - Explore:** search (users/videos/hashtags/sounds), trending grid, hashtag pages, categories, infinite scroll.
- [ ] **Phase 9 - Audio:** music library, sound detail, videos-using-sound, use/save sound; sound icon only when real audio/music present.
- [ ] **Phase 10 - Friends & Inbox:** suggestions, followers/following, follow/unfollow, requests; inbox = notifications + conversation list.
- [ ] **Phase 11 - Notifications:** typed list, correct deep-link targets, deleted-content fallback; push wiring once backend delivery exists.
- [ ] **Phase 12 - Settings & security:** account/privacy/notifications/security/blocked/language/help/logout, sessions/devices, change password, delete account.
- [ ] **Phase 13 - Backend gaps:** social-login endpoints, push delivery, cover upload, user-report (build as reached).
- [ ] **Phase 14 - Performance pass:** lazy screens, infinite scroll everywhere, single active video, thumbnail cache, skeletons, slow-network handling, background upload.
- [ ] **Phase 15 - Testing:** Android emulator + device, iOS simulator, the full flows; deep links; offline; crash handling (Sentry).
- [ ] **Phase 16 - Deployment:** EAS dev build (Android first) → internal APK → store AAB; then iOS bundle id, icon/splash, TestFlight.

---

## 9. First implementation step (Phase 1, concrete)

1. `cd mobile` → scaffold Expo (TypeScript) app, set `name=Reelsoo`, slug, scheme `reelsoo`.
2. Install: navigation (native, native-stack, bottom-tabs, screens, safe-area), `@tanstack/react-query`, `zustand`, `axios`, `expo-secure-store`, `expo-constants`, `expo-video`, `expo-image`, `expo-image-picker`, `expo-camera`, `expo-notifications`, `expo-apple-authentication`, `@react-native-google-signin/google-signin`, `expo-haptics`.
3. Create the `src/` folder tree (section 5) with `constants/colors.ts` (#fe2c55 + light theme), `api/client.ts` (axios + interceptors + secure-store token), `store/auth.store.ts`, and a minimal `navigation/RootNavigator` switching Auth/Main on auth state.
4. Add `app.config.ts` + `eas.json` + env files (section 6); wire `API_BASE_URL`.
5. Boot to a placeholder Login screen + empty Main tabs (custom bar with center Create FAB) to validate the shell on Android.

---

## 10. Decisions (LOCKED 2026-06-25)

- **D1 - Framework:** ✅ **Expo (RN) + Dev Client + EAS**.
- **D2 - Text posts:** ✅ **Skipped in v1.** Create = **video + photo only** (matches current backend). Revisit later.
- **D3 - Turnstile on mobile:** ✅ **Skip for the mobile client.** App sends `X-Client: reelsoo-mobile`; backend bypasses Turnstile for it (still fail-open + rate-limited + device fingerprint). → small backend change at Phase 2.
- **D4 - Push:** **Expo Push API** (handles APNs+FCM) via the existing stub job. *(Phase 11/13.)*
- **D5 - Social login (v1):** ✅ **Google + Apple now** (Apple required for iOS review), **TikTok later**. Build `/auth/social/google` + `/auth/social/apple`. *(Phase 2/13.)*
- **D6 - Monorepo:** ✅ new **`mobile/`** dir in this repo.

> **Phase 0 (planning) complete.** Next: Phase 1 project setup in `mobile/`.

---

*Reference docs in this repo: `docs/two-vps-setup-plan.md`, `docs/failover-runbook.md`. Backend routes: `server/routes/api.php`. Web app (UX parity reference): `frontend/`.*
