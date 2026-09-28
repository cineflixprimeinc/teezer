# Reelsoo - Design Plan

> Covers two design contexts: (1) Flutter mobile app, (2) Web dashboard + website (Blade + Tailwind CSS).

---

## Brand Identity (Shared)

| Property | Value |
|---|---|
| Primary Color | `#fe2c55` - Reelsoo Red |
| Primary Dark | `#c4003d` - hover/pressed state |
| Background | `#FFFFFF` - white |
| Surface | `#F8F8F8` - light grey cards |
| Text Primary | `#0D0D0D` - near black |
| Text Secondary | `#6B6B6B` - grey |
| Text Hint / Placeholder | `#ABABAB` |
| Success | `#22C55E` - green |
| Warning | `#F59E0B` - amber |
| Error | `#EF4444` - red |
| Info | `#3B82F6` - blue |
| Divider | `#E5E5E5` |
| Verified Badge | `#3B82F6` - blue tick |
| Border Radius (cards) | 12px – 16px |
| Border Radius (buttons) | 50px (pill) |
| Border Radius (avatars) | 9999px (full circle) |
| Primary Font | Inter (web) / System default (Flutter) |
| Shadow | `rgba(0,0,0,0.06)` subtle |

---

## Typography Scale (Shared)

| Name | Size | Weight | Usage |
|---|---|---|---|
| Display | 28sp / 28px | Bold 700 | Hero headings |
| Heading Large | 24sp / 24px | Bold 700 | Screen / page titles |
| Heading Medium | 20sp / 20px | SemiBold 600 | Section titles |
| Heading Small | 16sp / 16px | SemiBold 600 | Card titles |
| Body Large | 14sp / 14px | Regular 400 | Body copy |
| Body Small | 12sp / 12px | Regular 400 | Timestamps, subtitles |
| Label | 11sp / 11px | Medium 500 | Tab labels, chips, badges |
| Counter | 13sp / 13px | Medium 500 | Like / comment counts |
| Monospace | 13px | Regular 400 | Code, tokens (web only) |

---

# PART 1 - Flutter Mobile App Design

## Flutter Color Usage

- `#fe2c55` → CTA buttons, active tab, liked heart, follow button, brand logo, upload "+" button, XP bar
- `#FFFFFF` → backgrounds, cards, video overlay gradient source
- `#0D0D0D` → headings, usernames
- `#6B6B6B` → stat labels, timestamps, tab inactive labels
- `#22C55E` → "Published", "Completed", "On Track" status pills
- `#F59E0B` → "Scheduled", "In Progress" status pills
- `#3B82F6` → verified tick badge

---

## Flutter Screen Designs

### 1. Splash Screen
- Full white background with soft pink blob gradients (top-left + bottom-right corners)
- Centered: Reelsoo stylized "R" logo in `#fe2c55` + wordmark "Reelsoo" in `#0D0D0D`
- Below logo: 3 dot indicators (middle dot active in `#fe2c55`, others in `#E5E5E5`)
- Animated: logo fades in + scales up; active dot cycles left-to-right
- Full immersive (hides status bar)

### 2. Login Screen
- Same gradient blob background
- Top: Reelsoo "R" icon + "reelsoo" wordmark (lowercase, bold)
- "Welcome Back" - Heading Large, bold, dark
- Subtitle - Body Large, grey
- Input fields (rounded 12px, white card, subtle border, left icon):
  - Envelope icon + "Email or Username" placeholder
  - Lock icon + "Password" placeholder + eye toggle right
- "Forgot Password?" - right-aligned, `#fe2c55`, Body Small
- Login button - full width, pill shape, `#fe2c55` fill, white text, Bold
- Divider - "or continue with" (grey lines either side)
- Social row - 3 white rounded cards: Google logo | Apple logo | TikTok logo
- Footer - "Don't have an account? **Sign up**" (`#fe2c55` link)

### 3. Signup Screen
- Same background
- Logo at top
- "Create Account" - Heading Large
- "Join Reelsoo and start connecting." - Body Large, grey
- Input fields: Full Name | Email | Username | Password (eye toggle) | Date of Birth | Country (dropdown)
- Checkbox - "I agree to the **Terms of Service** and **Privacy Policy**"
- "Sign up" button - full width, `#fe2c55` gradient, pill
- Social login row (same as login)
- Footer - "Already have an account? **Login**"

### 4. Home Feed Screen
- Full-screen black background (video fills entire screen)
- Status bar: white text (time left, signal/wifi/battery right)
- Top overlay bar (transparent gradient):
  - Left: Live broadcast icon (rounded border, white)
  - Center: tab switcher "For You" | "Following" | "Nearby" - white text, active underlined white
  - Right: Search icon (white)
- Right side action column (right edge, bottom half):
  - Avatar (circle, white ring, 48px) + red "+" follow button below (24px circle)
  - Heart icon (white) + count below (white, 128.7K)
  - Chat bubble (white) + count (2.3K)
  - Bookmark (white) + count (18.6K)
  - Share arrow (white) + count (12.1K)
  - Music disc (rotating circle avatar + music note badge)
- Bottom-left overlay (above nav bar):
  - `@username` bold white + blue verified tick
  - Caption - Body Large, white, 2 lines max with "more" expand
  - Hashtags - white, smaller
  - Music note icon + "AudioName - Artist" - white, scrolling marquee
- Bottom nav bar - black background, white icons, `#fe2c55` active icon + label

### 5. User Profile Screen
- White background
- Top bar: back ← | bell | share | crown | gear | ⋯
- Profile section:
  - Avatar (large, ~80px, circular, `#fe2c55` ring border, music note badge bottom-right)
  - Name bold + blue tick
  - @handle grey
  - Bio text (Body Large)
  - Tags: "Dance • Lifestyle • Travel • Good Vibes" (grey dots)
  - Location pin + join date calendar
  - Social icons row (Instagram, YouTube, TikTok, Telegram, WhatsApp, X) - 32px rounded icons
- Stats row - 4 columns: Following | Followers | Likes | Videos (bold number, grey label)
- Action buttons:
  - Follow - full width red pill
  - Message - outlined pill
  - Share - icon button
  - Chevron down - icon button
- Creator Level card - shield badge icon + level name + XP progress bar (red)
- Highlights row - circular avatars (56px, red ring) with labels below
- Content tabs - Reels (active red underline) | Liked | Playlists | Tagged
- Video grid - 3 columns, thumbnail with duration (top-right) + views/likes (bottom overlay)

### 6. Profile Actions Screen
- White background
- "Profile actions" title centered + "Shortcuts and quick tools" subtitle
- Back arrow top-left
- Profile card - avatar + name + @handle
- Section groups with `SECTION_HEADER` labels (all-caps, grey, 11px):
  - **SHARE & IDENTITY:** View as Public / Share Profile / Copy Profile Link / My QR Code / Add to Favourite / About This Account
  - **LIBRARY & ACTIVITY:** Saved Videos / Watch History / Drafts / Archive
  - **SAFETY & CONTROLS:** Block User List / Report Profile
  - **ACCOUNT SHORTCUTS:** Switch Account / Log Out (red text, red icon)
- Each row: left icon | label | right chevron

### 7. Settings Screen
- White background
- "Settings" centered title + back arrow
- Section groups:
  - **ACCOUNT:** Edit Profile / Login & Security / Privacy & Safety / Notifications / Language & Translation / Content Preferences / Social Links
  - **MANAGE:** Wallet & Balance / Premium / Subscription
  - **TOOLS:** Reelsoo Studio / Ads Manager
  - **SUPPORT:** Help & Support / About & Legal
- Each row: left icon | title (Body Large dark) | subtitle (Body Small grey) | right chevron

### 8. Reelsoo Studio Dashboard
- White background
- "Reelsoo Studio" title + back arrow top-left + avatar top-right
- Top profile card (rounded, light surface):
  - Avatar (red ring) + name + tick + @handle
  - "Rising Star • Level 6" + gear icon
  - XP bar (red fill on grey track): "7,260 / 10,000 XP"
  - 2×2 mini stats: Views | Watch Time | New Followers | Engagement Rate (with red arrow % change)
- Horizontal scrollable tab bar: Dashboard | Content | Analytics | Monetization | Verification | Settings
- 4 stat cards row (rounded cards, icon + value + label + % change arrow)
- Content Performance chart (line chart: red = views, grey = watch time, x-axis = dates)
- Quick Actions grid: Upload Video | Go Live | Drafts | Promote | Comments (with badge count)
- Recent Content - horizontal scroll of video thumbnails (duration badge, views + likes overlay)
- Monetization summary card - balance + breakdown + "View earnings" red button
- Verification Center - status icon + checklist items + "Apply for Verification" outlined button
- Creator Tools row - Creator Level | Audience | Live Tools | Music Library | Ideas Hub | Settings

### 9. Studio Content Screen
- Same header as Studio Dashboard
- Full horizontal tab bar: Overview | **Content** | Audio | Comments | Monetization | Verification | Analytics | Settings
- "Your Content" heading + Upload Video / Create Draft / Bulk Actions buttons
- 4 mini stats: Total Videos | Drafts | Scheduled | Published
- Search bar + "Sort by: Newest" dropdown + Filter button
- Filter chips: All | Published | Drafts | Scheduled | Private
- Video list items (cards):
  - Thumbnail (with duration chip) | Title + emoji | Status badge (colored) | ⋯ menu
  - Stat row: ▶ views | ♥ likes | 💬 comments, date + time
  - Action row: Edit | Insights | Promote | Delete / Archive

---

## Flutter Bottom Navigation Bar

7 items - center is the Upload button:

```
Home  Explore  Audio  [+]  Friends  Inbox  Profile
```

- `[+]` - white rounded-square card with `#fe2c55` border and icon, slightly taller than other items
- Active state: icon + label in `#fe2c55`
- Inactive: icon + label in `#6B6B6B`
- Bar background: white + top shadow (all non-feed screens); black (feed screen)
- Profile tab: red dot badge when unread notifications exist

---

## Flutter Component Library

| Component | Description |
|---|---|
| `ReelsooButton` | Primary red pill, outlined variant, disabled state |
| `ReelsooTextField` | Rounded input, prefix icon, suffix toggle |
| `ReelsooAvatar` | Circular, optional red ring, optional badge overlay |
| `VideoThumbnailCard` | Grid tile - thumbnail + duration chip + stats overlay |
| `FeedVideoCard` | Full-screen video item with right action column |
| `VideoActionColumn` | Right-side like/comment/save/share/music column |
| `StatusBadge` | Pill: Published (green) / Draft (grey) / Scheduled (amber) / Private (blue) |
| `StudioStatCard` | Icon + big number + label + % change with colored arrow |
| `CreatorLevelCard` | Shield badge + level name + XP progress bar |
| `SocialLinkRow` | Row of social icon buttons |
| `BottomNavBar` | Custom 7-item nav with center upload button |
| `SettingsListItem` | Icon + title + subtitle + chevron |
| `SectionHeader` | All-caps grey 11sp label for grouped sections |
| `ContentPerformanceChart` | Line chart for studio analytics |

---

## Flutter Icon Style

- Package: `lucide_icons` (consistent line icon set)
- Feed screen: white, slightly filled-look icons
- All other screens: outline icons, dark grey `#6B6B6B`
- Do not mix random icon packs

---

## Flutter Animation Guidelines

| Interaction | Animation |
|---|---|
| Splash logo | Fade in + scale from 0.8→1.0, 600ms |
| Feed vertical swipe | `PageView` with `ClampingScrollPhysics` |
| Like button tap | Quick scale bounce: 1.0→1.3→1.0, 200ms |
| Music disc | Continuous `RotationTransition`, 8s per revolution |
| Bottom nav switch | Slide-up + fade-in label, 150ms |
| Studio stats | Count-up from 0 on screen enter, 800ms |
| Status badge | No animation, just color state |

---

# PART 2 - Web Dashboard & Website Design (Blade + Tailwind CSS)

The web dashboard is accessed by browser at `yourdomain.com`. It uses Laravel Blade templates with Tailwind CSS. Three separate dashboard layouts share one login page.

---

## Web Layout Structure

### Shared Login Page (`/login`)
- Centered card on white/light grey page background
- Reelsoo logo at top of card
- Email + password inputs (Tailwind `input` style with focus ring in `#fe2c55`)
- "Remember me" checkbox
- "Login" button - full width, `bg-[#fe2c55]` Tailwind bg
- "Forgot password?" link
- No role selector visible - role is detected server-side from `users.role`
- Error messages shown inline

### Admin Dashboard Layout
- Left sidebar (fixed, dark - `#111827` or similar)
  - Reelsoo logo at top
  - Navigation items: Dashboard / Users / Videos / Reports / Verification / Analytics / Settings
  - Active item: `#fe2c55` left border + light red background
  - Bottom: avatar + name + "Admin" badge + logout button
- Top bar: breadcrumb + search + notification bell
- Main content area: white, padded
- Responsive: sidebar collapses to icon rail on md, hamburger on mobile

### Creator Studio Layout
- Left sidebar (white, light border)
  - Reelsoo logo
  - Nav: Dashboard / Content / Analytics / Monetization / Verification / Settings
  - Creator profile card at top (avatar, name, level badge)
- Top bar: studio title + quick action buttons
- Main content: white cards with rounded corners and subtle shadows

### User Dashboard Layout
- Minimal - top navbar only (no sidebar)
  - Logo left + nav links center + avatar/logout right
- Clean white centered content
- Simple card-based layout for saved videos, history, settings

---

## Web Dashboard Color Usage (Tailwind Classes)

| Purpose | Tailwind Class |
|---|---|
| Primary button bg | `bg-[#fe2c55] hover:bg-[#c4003d]` |
| Primary text link | `text-[#fe2c55] hover:text-[#c4003d]` |
| Active sidebar item | `border-l-4 border-[#fe2c55] bg-red-50 text-[#fe2c55]` |
| Success badge | `bg-green-100 text-green-700` |
| Warning badge | `bg-amber-100 text-amber-700` |
| Error badge | `bg-red-100 text-red-700` |
| Neutral badge | `bg-gray-100 text-gray-600` |
| Card | `bg-white rounded-xl shadow-sm border border-gray-100` |
| Page background | `bg-gray-50` |
| Divider | `border-gray-200` |

---

## Web Dashboard Component List

| Component | Description |
|---|---|
| Sidebar | Role-specific nav links, logo, user card |
| TopBar | Breadcrumb, search, notifications |
| StatsCard | Icon + metric + % change (dashboard overview) |
| DataTable | Sortable, filterable table for users/videos/reports |
| StatusBadge | Inline colored pill |
| ActionMenu | Dropdown menu on table rows (edit, ban, delete, etc.) |
| ConfirmModal | Confirmation dialog for destructive actions |
| PaginationBar | Prev/next + page numbers |
| LineChart | Views + watch time over time (Chart.js or similar) |
| AvatarWithBadge | User avatar + role badge |

---

## Public Website Design

- Clean marketing site - white background, large hero, feature sections, app download CTA
- Typography: Inter (via Google Fonts or Bunny Fonts CDN)
- Hero: full-width section, Reelsoo logo large, tagline, app download buttons (Android / iOS)
- Feature cards: icon + heading + description, 3-column grid
- Download section: phone mockup image + store badges
- Footer: logo + links (Privacy, Terms, Contact, About) + copyright
- Responsive: mobile-first Tailwind layout

---

## Responsive Breakpoints (Web)

| Breakpoint | Width | Behavior |
|---|---|---|
| `sm` | 640px | Sidebar collapses |
| `md` | 768px | Icon-only sidebar |
| `lg` | 1024px | Full sidebar visible |
| `xl` | 1280px | Content max-width capped |
