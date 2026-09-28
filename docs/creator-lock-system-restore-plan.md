# Creator System: Menu Lock Rules & Restore Plan

> **Status: TEMPORARILY DISABLED for UI redesign.**
> Re-enable by following the checklist at the bottom of this document.

---

## Kill Switch

**File:** `frontend/src/lib/studio-permissions.ts`

```ts
// Line near top of file - change to true to restore ALL locks
export const LOCKS_ENABLED = false;   // ← SET TO TRUE
```

Also in `canAccess()` in the same file, remove this line:
```ts
if (!LOCKS_ENABLED) return true;   // ← DELETE THIS LINE
```

---

## Account Types

| Type | `role` value | Who |
|------|-------------|-----|
| Normal User | `user` | Default for all new signups |
| Creator | `creator` | After creator application approved |
| Admin | `admin` | Staff only - bypasses all locks |

---

## Full `STUDIO_RULES` Permission Map

```ts
// Always accessible - minRole: "any"
dashboard, content, analytics, premium, music,
creator_tools, become_creator, ads_manager

// Creator-gated - minRole: "creator"
comments:            { minLevel: 0  }
creator_levels:      { minLevel: 0  }
best_time:           { minLevel: 1  }
advanced_comments:   { minLevel: 3  }
advanced_best_time:  { minLevel: 4  }
monetization:        { minLevel: 5  }
wallet:              { minLevel: 6,  requiresMonetization: true }
payouts:             { minLevel: 6,  requiresMonetization: true }
marketplace:         { minLevel: 7  }
subscriptions:       { minLevel: 8  }
verification:        { minLevel: 9  }
partner_tools:       { minLevel: 10 }
```

---

## Redirect Rules

| User state | Redirect destination |
|-----------|---------------------|
| Normal user clicks locked feature | `/studio/become-creator` |
| Creator - level too low | `/studio/creator-level` |
| Creator - needs monetization approval | `/studio/monetization` |
| Creator - violation active | show warning, lock monetization/payouts |

---

## Sidebar Lock UI  (`studio-page.tsx`)

- **Locked items** render as `<button>` (NOT `<Link>`) with:
  - Muted text colour `#c0c4cc`
  - `<Lock className="h-3.5 w-3.5" />` icon on the right
  - `title={tooltip}` on hover
- **Immediate check** via `useAuthStore().isCreator()` - no API wait, locks show on first render
- **Level/monetization check** via `ctx` from `GET /studio/permissions` (5-min React Query cache)
- **On click:** `router.push(getLockRedirect(ctx, feature))`

---

## Page-Level Guards

To add a guard back to any studio page, insert at the top of the component function:

```ts
import { useStudioPageGuard } from "@/hooks/useStudioPermissions";

// Inside the component:
const { isLoading: permsLoading, isBlocked } = useStudioPageGuard("FEATURE_KEY");

// After other guards:
if (!authReady || !isAuthenticated || permsLoading) return null;
if (isBlocked) return null;   // hook auto-redirects to unlock page
```

### Pages that had guards before unlock

| Page component | Feature key |
|---------------|-------------|
| `studio-analytics-page.tsx` | `"analytics"` |
| `studio-monetization-page.tsx` | `"monetization"` |

---

## Backend Permissions Endpoint

`GET /studio/permissions` → `StudioDashboardController::permissions()`

```json
{
  "is_creator":            false,
  "creator_level":         -1,
  "monetization_approved": false,
  "has_active_violation":  false,
  "payout_info_completed": false,
  "application_status":    "none"
}
```

- `creator_level = current_level_id - 1` (0-indexed; `-1` = normal user)
- Monetization queried via `DB::table('creator_monetization_statuses')` (safe - no relationship needed)

---

## Level Definitions  (`StudioDashboardController::levelDefinitions()`)

| # | Name | Requirements |
|---|------|-------------|
| 0 | New Creator | 1 public video, no violations |
| 1 | Starter Creator | 3 videos, 500 views |
| 2 | Rising Creator | 5 videos, 1,500 views, 300 followers |
| 3 | Active Creator | 15 videos, 15K views, 2K followers, 5K watch mins, retention ≥20%, engagement ≥2.5%, score ≥3.3 |
| 4 | Trusted Creator | 20 videos, 25K views, 5K followers, 10K watch mins, engagement ≥3% |
| 5 | Monetization Eligible | 30 videos, 50K views, 10K followers, engagement ≥3.5% |
| 6 | Monetized Creator | 40 videos, 100K views, 25K followers |
| 7 | Pro Creator | 50 videos, 250K views, 50K followers |
| 8 | Premium Creator | 500K views, 100K followers |
| 9 | Verified Candidate | 1M views, 250K followers |
| 10 | Partner Creator | Manual admin review required |

### Auto Level-Up
In `creatorLevelPage()`: if **all** next-level requirements pass → `current_level_id++` is auto-saved. Page then shows requirements for the following level.

---

## Creator Score Formula

```
score = (contentQuality × 0.40)
      + (engagement     × 0.25)
      + (consistency    × 0.15)
      + (growth         × 0.10)
      + (compliance     × 0.10)
```

Scale: **0.0 – 5.0**

| Component | How computed |
|-----------|-------------|
| contentQuality | `min(5, avgViewsPerVideo / 10000 × 5)` |
| engagement | `min(5, engagementRate / 5 × 5)` (5% = max) |
| consistency | `max(0, 5 − daysSinceLastVideo / 7)` (weekly upload = 5.0) |
| growth | `min(5, followers / 10000 × 5)` (10K = max) |
| compliance | 5.0 if not banned, 0.0 if banned |

---

## Complete File List

| File | Role |
|------|------|
| `frontend/src/lib/studio-permissions.ts` | **Kill switch** + STUDIO_RULES + canAccess / getLockTooltip / getLockRedirect |
| `frontend/src/hooks/useStudioPermissions.ts` | `useStudioPermissions` + `useStudioPageGuard` hooks |
| `frontend/src/features/studio/studio-page.tsx` | Sidebar lock UI - locked items as buttons |
| `frontend/src/features/studio/studio-analytics-page.tsx` | Page guard (restore: add useStudioPageGuard) |
| `frontend/src/features/studio/studio-monetization-page.tsx` | Page guard (restore: add useStudioPageGuard) |
| `server/app/Http/Controllers/Api/Studio/StudioDashboardController.php` | `permissions()` + `creatorLevelPage()` + `levelDefinitions()` |
| `server/routes/api.php` | `/studio/permissions` + `/studio/creator-level-page` routes |
| `server/app/Models/CreatorApplication.php` | Creator application model |
| `server/database/migrations/2026_06_04_400001_create_creator_applications_table.php` | Applications table |
| `server/database/migrations/2026_06_04_400002_add_creator_terms_to_users_table.php` | `creator_terms_accepted_at` column |

---

## ✅ Re-Enable Checklist

1. **`frontend/src/lib/studio-permissions.ts`**
   - Set `LOCKS_ENABLED = true`
   - Delete the line `if (!LOCKS_ENABLED) return true;` from `canAccess()`

2. **`frontend/src/features/studio/studio-analytics-page.tsx`**
   - Import: `import { useStudioPageGuard } from "@/hooks/useStudioPermissions";`
   - Add inside component: `const { isLoading: permsLoading, isBlocked } = useStudioPageGuard("analytics");`
   - Add guard: `if (!authReady || !isAuthenticated || permsLoading) return null;` and `if (isBlocked) return null;`

3. **`frontend/src/features/studio/studio-monetization-page.tsx`**
   - Same as above with feature key `"monetization"`

4. **Deploy:**
   ```
   cd /var/www/teezer && git pull origin main && cd server && php artisan config:cache && php artisan route:cache && cd ../frontend && npm run build && pm2 restart teezer-web
   ```
