# Teezer Brand Assets

Master brand files. Drop the source PNG/SVG/AI files here.

## Expected files

| File | Purpose | Suggested specs |
|---|---|---|
| `teezer-icon.png` | App icon / favicon source - solid red square with chevron-style white R | 1024×1024 PNG, no padding |
| `teezer-logo.png` | Horizontal wordmark (R icon + "Teezer" text) | 2172×724 or similar, transparent bg |
| `teezer-icon.svg` | Vector version of icon (if available) | - |
| `teezer-logo.svg` | Vector version of wordmark (if available) | - |

## Colors

- Primary red: `#fe2c55` (Teezer brand red)
- Gradient (logo R): `#ff4d8d → #fe2c55 → #f00646`
- Wordmark text: `#0f172a` (slate-900)

## Usage

The web app currently uses inline SVG copies of these in [frontend/public/](../../frontend/public/):
- `teezer-icon.svg` - favicon / small icon
- `teezer-mark.svg` - header logo

When updating brand assets, replace files here first, then regenerate the public SVGs.
