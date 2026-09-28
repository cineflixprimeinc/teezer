# Admin Panel Design Reference Catalog

This folder holds all UI design reference screenshots and mockups for the Reelsoo admin panel.
Place your design files here and update the catalog below.

## Folder Structure

```
assets/design-reference/admin-panel/
├── CATALOG.md                  ← This file (index of all references)
├── dashboard/                  ← Admin overview / dashboard page designs
├── users/                      ← User management page designs
├── videos/                     ← Video moderation page designs
├── reports/                    ← Content report review designs
├── verification/               ← Verification request review designs
├── analytics/                  ← Platform analytics page designs
├── settings/                   ← Admin settings page designs
├── components/                 ← Individual UI component references
│   ├── sidebar/                ← Sidebar navigation states (collapsed/expanded)
│   ├── tables/                 ← Data table styles
│   ├── cards/                  ← Stat card and content card styles
│   ├── modals/                 ← Confirmation and form modal designs
│   ├── badges/                 ← Status badges (Active, Banned, Pending, etc.)
│   ├── forms/                  ← Input, select, toggle, button styles
│   └── topbar/                 ← Top navigation bar design
└── color-palette/              ← Brand colors and theme swatches
```

## Design References Catalog

| # | File | Page/Component | Notes |
|---|------|----------------|-------|
| - | *Place your reference images here and fill this table* | - | - |

## Design System (from planning docs)

| Token            | Value      |
|------------------|------------|
| Brand primary    | `#fe2c55`  |
| Brand dark       | `#e0243d`  |
| Background       | `#0a0a0a`  |
| Surface          | `#111111`  |
| Border           | `rgba(255,255,255,0.10)` |
| Text primary     | `#ffffff`  |
| Text muted       | `rgba(255,255,255,0.40)` |
| Success          | `#22c55e`  |
| Warning          | `#f59e0b`  |
| Danger           | `#ef4444`  |
| Font family      | Inter, system-ui, sans-serif |

## How to Add References

1. Copy your screenshot or design image into the matching subfolder
2. Use descriptive filenames: `dashboard-overview.png`, `users-table-dark.png`
3. Add a row to the catalog table above with: file path, which page it covers, any notes

## Pages to Have References For

- [ ] Admin Dashboard overview (stat cards, quick stats, recent activity)
- [ ] Users list table (with status badges, search, filters)
- [ ] User detail / profile view (with action buttons: ban, promote)
- [ ] Videos list table (with thumbnail preview, status filter)
- [ ] Video detail (with embed preview, report list)
- [ ] Reports queue (pending/reviewed tabs)
- [ ] Verification requests queue
- [ ] Platform analytics page (charts, metrics)
- [ ] Admin settings page
- [ ] Sidebar navigation (expanded and collapsed states)
- [ ] Login page
