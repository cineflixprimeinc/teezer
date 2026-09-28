# Mobile assets

Drop the approved brand assets here, then wire them up:

| File | Size | Used by |
|---|---|---|
| `icon.png` | 1024×1024 | `app.config.ts` → `icon` (uncomment) |
| `adaptive-icon.png` | 1024×1024 (safe zone) | `app.config.ts` → `android.adaptiveIcon` (uncomment) |
| `splash.png` | ~1242×2436, centered small logo on white | `app.config.ts` → `splash.image` (uncomment) |
| `logo.png` | wordmark/mark | swap into `src/components/Logo.tsx` |

Until added, the app uses Expo's default icon and a white splash with the
text wordmark - safe for development builds.
