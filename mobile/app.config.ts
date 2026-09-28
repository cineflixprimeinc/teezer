import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Environment is chosen by APP_ENV (development | staging | production).
 * Each block is exposed to the app via `extra` → read through src/constants/config.ts.
 * Individual values can be overridden at runtime with EXPO_PUBLIC_* env vars.
 */
type AppEnv = "development" | "staging" | "production";
const APP_ENV = (process.env.APP_ENV as AppEnv) || "development";

const ENVS: Record<AppEnv, {
  name: string;
  apiBaseUrl: string;
  mediaBaseUrl: string;
  chatServerUrl: string;
}> = {
  development: {
    name: "Teezer",
    // Use your machine's LAN IP when testing on a real device, e.g. http://192.168.1.20:8000/api/v1
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "https://api.teezer.live/api/v1",
    mediaBaseUrl: "https://cdn.teezer.live",
    chatServerUrl: process.env.EXPO_PUBLIC_CHAT_SERVER_URL || "https://api.teezer.live",
  },
  staging: {
    name: "Teezer (Staging)",
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || "https://api.teezer.live/api/v1",
    mediaBaseUrl: "https://cdn.teezer.live",
    chatServerUrl: process.env.EXPO_PUBLIC_CHAT_SERVER_URL || "https://api.teezer.live",
  },
  production: {
    name: "Teezer",
    apiBaseUrl: "https://api.teezer.live/api/v1",
    mediaBaseUrl: "https://cdn.teezer.live",
    chatServerUrl: "https://api.teezer.live",
  },
};

const env = ENVS[APP_ENV];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env.name,
  slug: "teezer",
  // TODO(teezer): set `owner` to the Expo account/organization slug that owns
  // the Teezer EAS project (e.g. owner: "<TEEZER_EXPO_OWNER>"). Left unset so
  // no build can be attached to the previous project's Expo account.
  scheme: "teezer",
  version: "1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  // SDK 57 (RN 0.86) dropped the legacy architecture entirely - New
  // Architecture is the only one now, so this flag no longer exists in the
  // config schema (it's not a choice anymore, there's nothing to toggle).
  icon: "./src/assets/icon.png",
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.teezer.app",
    // Firebase config for iOS - copied into the native project at prebuild,
    // mirroring googleServicesFile in the android block below.
    //
    // Read from an EAS "file" secret rather than the repo. The file is
    // gitignored (it carries the project's API key) and EAS builds from a git
    // archive, so an untracked file never reaches the builder no matter what
    // .easignore says - EAS warns about exactly this by name. On the builder
    // the env var holds the path to the downloaded file; locally it is unset
    // and the ?? falls back to the copy sitting in this folder.
    //
    // Re-upload after changing either file:
    //   eas env:create --scope project --name GOOGLE_SERVICES_INFO_PLIST     //     --type file --value ./GoogleService-Info.plist --visibility secret     //     --environment production --force
    //
    // Nothing reads it yet. iOS push goes straight to APNs (PushService::
    // sendApns) and no Firebase SDK is installed; this is here so adding one
    // later is a dependency install and not a config hunt.
    googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST ?? "./GoogleService-Info.plist",
    usesAppleSignIn: true,
    // Universal Links. Pairs with /.well-known/apple-app-site-association on
    // teezer.live - iOS fetches that file at install time and will not honour
    // these links without it. `applinks:` covers both apex and www because the
    // AASA lists both. Takes effect in a real build only; Expo Go cannot claim
    // another app's domain.
    associatedDomains: ["applinks:teezer.live", "applinks:www.teezer.live"],
    // App Attest, opt-in via APP_ATTEST_ENTITLEMENT=1.
    //
    // OFF BY DEFAULT because the entitlement cannot stand alone: the App ID
    // com.teezer.app must ALSO have the App Attest capability enabled in the
    // Apple Developer portal, and the provisioning profile regenerated to carry
    // it. Without that, Xcode fails the build outright -
    //   "Provisioning profile ... doesn't include the App Attest capability"
    // - which is what happened to build 9. EAS normally syncs capabilities from
    // these entitlements during credential setup, but only with an
    // authenticated Apple session; a non-interactive build has none and
    // silently reuses the existing profile.
    //
    // To turn on: enable App Attest on the App ID in the Apple Developer
    // portal, let EAS regenerate the profile (`eas credentials`, interactively,
    // so it can authenticate), then set APP_ATTEST_ENTITLEMENT=1 in the build
    // profile's env in eas.json.
    //
    // The value follows APP_ENV rather than being pinned: Apple bakes the
    // environment into the attestation itself (in the aaguid) and the server
    // reads it from there, so pinning production would make every dev and
    // TestFlight build fail verification.
    ...(process.env.APP_ATTEST_ENTITLEMENT === "1"
      ? {
          entitlements: {
            "com.apple.developer.devicecheck.appattest-environment":
              APP_ENV === "production" ? "production" : "development",
          },
        }
      : {}),
    infoPlist: {
      NSCameraUsageDescription: "Teezer uses the camera to record videos and take photos for posts.",
      NSMicrophoneUsageDescription: "Teezer uses the microphone to record audio for your videos.",
      NSPhotoLibraryUsageDescription: "Teezer needs access to your photos to upload videos and images.",
      // Unlock the full ProMotion refresh rate (120Hz) so feed swipes and gesture
      // animations run at up to 120fps on supported iPhones (default caps at 60).
      // Takes effect in dev/prod builds (Expo Go uses its own Info.plist).
      CADisableMinimumFrameDurationOnPhone: true,
      // Export compliance. Teezer uses only standard HTTPS/TLS, which is
      // exempt, so declaring it here answers the question once at build time.
      // Without it every upload lands in App Store Connect as "Missing
      // Compliance" and sits there - the build never reaches TestFlight and
      // nothing explains why until you find the prompt by hand.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.teezer.app",
    adaptiveIcon: { foregroundImage: "./src/assets/adaptive-icon.png", backgroundColor: "#fe2c55" },
    // FCM / Firebase config for Android - copied into android/app/google-services.json
    // at prebuild. File itself is gitignored; not present until placed locally.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    // RECORD_AUDIO + networking perms for WebRTC audio calls (added by the
    // react-native-webrtc config plugin too; listed here for clarity). CAMERA
    // is also injected by expo-camera's own plugin below - this is just
    // explicit.
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.CAMERA"],
    // App Links. `autoVerify` makes Android check
    // https://teezer.live/.well-known/assetlinks.json against this package's
    // signing certificate at install time; when it matches, teezer.live URLs
    // open the app directly with no disambiguation dialog.
    //
    // Only the paths in the link grammar are claimed - claiming "/*" would
    // hijack every marketing and settings page on the website too.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "teezer.live", pathPrefix: "/video/" },
          { scheme: "https", host: "teezer.live", pathPrefix: "/profile/" },
          { scheme: "https", host: "teezer.live", pathPrefix: "/live/" },
          { scheme: "https", host: "teezer.live", pathPrefix: "/tag/" },
          { scheme: "https", host: "teezer.live", pathPrefix: "/comment/" },
          { scheme: "https", host: "teezer.live", pathPrefix: "/notification/" },
          { scheme: "https", host: "www.teezer.live", pathPrefix: "/video/" },
          { scheme: "https", host: "www.teezer.live", pathPrefix: "/profile/" },
          { scheme: "https", host: "www.teezer.live", pathPrefix: "/live/" },
          { scheme: "https", host: "www.teezer.live", pathPrefix: "/tag/" },
          { scheme: "https", host: "www.teezer.live", pathPrefix: "/comment/" },
          { scheme: "https", host: "www.teezer.live", pathPrefix: "/notification/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    /*
     * Sentry. Must stay in this list: the iOS project is generated at build
     * time (there is no ios/ directory in the repo), so the native SDK, the
     * symbol upload and the build-phase script only exist if this plugin runs
     * during prebuild. Editing native files by hand is not an option here -
     * they would be regenerated and lost on the next build.
     *
     * organization and project are not secret - they are half of a public
     * dashboard URL - so they carry literal fallbacks and only need env vars
     * if they ever change. The AUTH TOKEN is the secret, and the plugin reads
     * SENTRY_AUTH_TOKEN from the environment itself; it is never written here.
     *
     * Version 7.11.0 rather than the newer 8.x on purpose: Expo SDK 57 pins
     * ~7.11.0 in its own bundledNativeModules, which is the pairing Expo
     * tested, and 7.11.0 declares codegenConfig (RNSentrySpec) so it builds
     * under the New Architecture that SDK 57 requires.
     */
    [
      "@sentry/react-native/expo",
      {
        // TODO(teezer): set SENTRY_ORG (and SENTRY_PROJECT) to the Teezer Sentry
        // organization/project, or replace this empty fallback with its slug.
        organization: process.env.SENTRY_ORG || "",
        project: process.env.SENTRY_PROJECT || "react-native",
      },
    ],
    // Android 15 (API 35, this project's compileSdk) forces edge-to-edge for
    // every app regardless of opt-in - without this plugin,
    // react-native-safe-area-context's insets.bottom (and keyboard-height
    // reporting) silently resolve wrong under that forced mode, which is what
    // was leaving the bottom tab bar flush against the nav/gesture bar and
    // the comment composer covered by the keyboard on Android.
    "react-native-edge-to-edge",
    "expo-secure-store",
    // Push. The package was already a dependency but was never configured or
    // imported, so the app shipped a notification-preferences screen it could
    // not act on. Native module - Expo Go cannot receive real push, which is
    // why src/services/push.ts guards every call.
    "expo-notifications",
    // Every video surface - Stories, the story/post editor, and the feed -
    // plays through expo-video, which ships inside Expo Go, so there is no
    // "needs the development build" guard to carry for playback anymore.
    "expo-video",
    // Music-library previews. Unlike react-native-iap/webrtc below, expo-audio
    // ships inside Expo Go, so the library plays there as well as in a build.
    "expo-audio",
    // SDK 57 requires these six listed explicitly (previously implicit/
    // autolinked with no plugin entry needed) - `expo install --fix` couldn't
    // write them itself since this is a dynamic (.ts) config, not app.json.
    "expo-asset",
    "expo-font",
    "expo-image",
    "expo-mail-composer",
    // The native OS-level splash, up until the JS bundle has loaded far enough
    // to hand off to the branded <Splash> component (src/components/Splash.tsx,
    // rendered by src/navigation/RootNavigator.tsx).
    //
    // Deliberately just a colour, with NO image. It used to draw the wordmark
    // via resizeMode "contain", which scales the logo to fill the screen - so a
    // release build opened on a big centred logo, then replaced it with the
    // branded splash's much smaller logo. Two distinct splash screens in a row,
    // which is what it looked like. Static native splash config cannot
    // reproduce the component's gradient and dots, so trying to approximate it
    // here could only ever produce a second, mismatched screen.
    //
    // #ffffff is exactly the base <Splash> paints under its pink corner
    // gradients (SplashBackground's first <Rect>), so the handoff is a white
    // screen gaining a soft gradient rather than one screen replacing another.
    // Keep the two colours in step if that base ever changes.
    //
    // Moved here from the top-level `splash` key (SDK 57 removed it from the
    // config schema in favor of this plugin) - same field, same value.
    ["expo-splash-screen", { backgroundColor: "#ffffff" }],
    "expo-status-bar",
    "expo-apple-authentication",
    ["expo-image-picker", { photosPermission: "Teezer needs access to your photos to upload videos and images." }],
    ["expo-camera", { cameraPermission: "Teezer uses the camera to record videos and take photos." }],
    // Added for resumable multipart upload (mobile/src/api/video.api.ts) -
    // File.slice() reads a large video's byte ranges one part at a time
    // instead of loading the whole file into memory. The plugin's own
    // default (its only job) is Android storage/INTERNET permissions.
    "expo-file-system",
    // Optional, best-effort location for geo-targeted ads and to personalize the
    // feed's country tab (feed passes lat/lng when granted). iOS/Android only
    // allow one purpose string per permission, so this one covers both uses.
    // Ignored in Expo Go, which supplies its own location permission.
    ["expo-location", { locationWhenInUsePermission: "Teezer uses your location to show ads relevant to your area and to share your location when you choose to in a chat." }],
    // Apple IAP / Google Play Billing. Native module - applied at EAS prebuild only, and
    // absent in Expo Go, which is why src/api/iap.ts requires it lazily behind a guard.
    // No config plugin as of 16.x (had one at 12.x) - the amazon/horizon/play store
    // flavor selection moved into the library's own android/build.gradle and defaults
    // to Play Store with no app-level config needed. Do not re-add a plugin entry here;
    // "react-native-iap" alone breaks prebuild (Unable to resolve a valid config plugin).
    // WebRTC native module - powers both Spaces (StreamHub/LiveKit) and 1:1
    // calls (CallProvider). @livekit/react-native-webrtc replaces the plain
    // react-native-webrtc package; the two cannot coexist in one app (they
    // bundle conflicting native WebRTC frameworks - confirmed via LiveKit's
    // own issue tracker), so both features share this one native module now.
    // @livekit/react-native-expo-plugin wires the LiveKit RN SDK's own native
    // setup; @config-plugins/react-native-webrtc still supplies the
    // camera/mic permission strings (it's permission-string-only, doesn't
    // care which webrtc package is actually installed). Applied only at EAS
    // prebuild - Expo Go ignores config plugins, so the JS guards in
    // src/realtime/webrtc.ts and src/screens/spaces/useSpaceAudio.ts keep
    // Expo Go working (calls/Spaces show "needs the production build" there).
    "@livekit/react-native-expo-plugin",
    ["@config-plugins/react-native-webrtc", { cameraPermission: "Teezer uses the camera for video calls.", microphonePermission: "Teezer uses the microphone for audio and video calls." }],
    // Security hardening: switching between saved accounts had no second
    // factor beyond the phone being unlocked - anyone holding an already-
    // unlocked device could pivot into any of up to 5 saved accounts with one
    // tap. Confirms Face ID/Touch ID/device biometric (falls back to the
    // device passcode) before a switch actually happens - see
    // src/utils/biometric-gate.ts.
    ["expo-local-authentication", { faceIDPermission: "Teezer uses Face ID to confirm it's you before switching accounts." }],
    // Security hardening: release builds shipped fully unobfuscated - R8
    // minification and resource shrinking were both off (the stock template's
    // android.enableMinifyInReleaseBuilds/enableShrinkResourcesInReleaseBuilds
    // default to false with no override anywhere, including eas.json, so this
    // reproduced in EAS-built production .aabs too, not just local builds).
    // Declared here rather than hand-edited into the generated (git-ignored)
    // build.gradle so it survives every `expo prebuild`/EAS Build regeneration.
    [
      "expo-build-properties",
      {
        android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true },
      },
    ],
    // Google Sign-In. Native module - see src/hooks/useSocialAuth.ts's own
    // guard/lazy-require for why it's absent from Expo Go, same as the
    // camera/scanner/webrtc modules above. iosUrlScheme is Google's own
    // "reversed client ID" string (Google Cloud Console -> the iOS OAuth
    // client -> shown right there as the iOS URL scheme) - NOT the client ID
    // itself, only needed for the iOS redirect flow. CORRECTION: an empty
    // string here is NOT a harmless no-op as this comment used to claim -
    // the plugin's own validateOptions() throws on it, which crashed
    // `expo start`/prebuild outright with no .env present. So the whole
    // entry is omitted until the scheme is actually set, instead of being
    // passed through blank.
    ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME }] as [string, { iosUrlScheme: string }]]
      : []),
  ],
  extra: {
    // TODO(teezer): link this app to the Teezer EAS project. Run `eas init`
    // under the Teezer Expo account and paste the id it prints here, e.g.
    //   eas: { projectId: "<TEEZER_EAS_PROJECT_ID>" },
    // `eas init` cannot write it itself (this config is a dynamic .ts, not
    // app.json). Without it every build command stops and asks.
    appEnv: APP_ENV,
    apiBaseUrl: env.apiBaseUrl,
    mediaBaseUrl: env.mediaBaseUrl,
    chatServerUrl: env.chatServerUrl,
    appName: env.name,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
    // Klipy GIF-picker key. Declared here so an EAS build-time env var reaches
    // the bundle via `extra`; src/constants/config.ts reads it with no literal
    // fallback, so an unset key yields an empty picker rather than a leak.
    klipyKey: process.env.EXPO_PUBLIC_KLIPY_KEY || "",
    // Sentry's DSN is a write-only ingest key, not a credential: it can send
    // events and read nothing back, and it ships inside every published app on
    // every platform by design. It still comes from the environment rather than
    // a literal so a fork or a second project does not inherit this one's.
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
  },
});
