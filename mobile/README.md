# Teezer Mobile (Expo / React Native)

One codebase for **Android + iOS**. Talks to the existing Teezer Laravel API
(`api.teezer.live/api/v1`, Sanctum Bearer tokens). Full plan & API readiness:
[`../docs/mobile-app-plan.md`](../docs/mobile-app-plan.md).

## Stack
Expo SDK 52 · React Navigation (custom tab bar) · React Query · Zustand · axios ·
expo-secure-store (token) · expo-video · expo-image-picker/camera · expo-notifications.

## Prerequisites
- Node 18+ and the Expo tooling (`npm i -g eas-cli` for builds; `npx expo` needs no global install).
- Android Studio (emulator) or the **Expo Go** / a **dev build** on a real device.

## Setup
```bash
cd mobile
npm install
npx expo install --fix     # aligns native dep versions to the installed Expo SDK
```

## Run (development)
```bash
npm run start              # Metro bundler; press "a" for Android, "i" for iOS (macOS)
# real device on the same Wi-Fi: set your LAN API URL first, e.g.
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8000/api/v1 npm run start
```
On the login/onboarding screen, **"Preview app (dev)"** signs you into the tab
shell without a backend call - used to validate navigation in Phase 1.

## Environments
Selected by `APP_ENV` (see `app.config.ts`): `npm run start` (dev),
`npm run start:staging`, `npm run start:prod`. Values are exposed via
`expo-constants` → `src/constants/config.ts`.

## Builds (EAS)
```bash
eas login
eas build:configure
eas build --profile development --platform android   # dev client APK
eas build --profile preview     --platform android   # internal test APK
eas build --profile production  --platform android   # Play Store AAB
# iOS later: --platform ios (needs an Apple Developer account)
```

## Folder structure
```
src/
  api/         axios client + per-domain endpoints
  assets/      logo, icons, splash (see assets/README.md)
  components/  reusable UI (Screen, Button, Logo, Placeholder, ...)
  constants/   colors (#fe2c55), theme, env config
  hooks/       useAuth, ...
  navigation/  Root / Auth / MainTabs + CustomTabBar
  screens/     one folder per feature area
  store/       zustand (auth) + react-query client
  types/       shared API types
  utils/       secure-store, fingerprint, format
```

## Status
**Phase 1 (project setup) - done.** Auth gating, the 7-tab custom bar (pink
center Create FAB), env config, secure-token axios client, and placeholder
screens are in place. Next: **Phase 2 - Authentication** (needs the backend
`X-Client: teezer-mobile` Turnstile bypass + `/auth/social/*` endpoints).
