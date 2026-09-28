# Teezer

Short-video platform (teezer.live). The repository is a monorepo of independently deployed apps.

| Path | What it is |
| --- | --- |
| `server/` | Laravel API (primary backend) |
| `backend-go/` | Go rewrite of the API (Fiber + sqlc), migrated domain by domain |
| `frontend/` | Next.js public site |
| `admin/` | Next.js admin panel |
| `mobile/` | Expo / React Native app |
| `deploy/` | nginx, pm2, APISIX, Centrifugo, ClickHouse, LiveKit configs |
| `cloudflare-worker/` | Edge worker fronting B2 media |

Each app reads its configuration from a local `.env`, which is **not** committed.
Every app root ships a `.env.example` listing the variables it needs with blank
or placeholder values — copy it and fill it in:

```bash
cp server/.env.example    server/.env
cp frontend/.env.example  frontend/.env.local
cp admin/.env.example     admin/.env.local
cp mobile/.env.example    mobile/.env
cp backend-go/.env.example backend-go/.env
```

---

## Security

This repository started with fresh git history (no inherited commits).

Deployment: see [DEPLOYMENT.md](DEPLOYMENT.md).

### Rules going forward

- No secret as a string literal in source — config files, helpers, comments, or
  otherwise. Secrets come from the environment.
- `NEXT_PUBLIC_*` (Next.js) and `EXPO_PUBLIC_*` (Expo) values are **inlined into
  the client bundle** and are readable by anyone. Only genuinely public values
  may use those prefixes: site keys, OAuth *client IDs*, public CDN URLs. Never
  a secret key, service key, signing key, or database URL.
- Server-side-only secrets (`APP_KEY`, DB credentials, OAuth *client secrets*,
  JWT signing keys, Stripe/PayPal **secret** keys, R2/B2 credentials) belong in
  `server/.env` or the equivalent, and must never reach a client bundle.
- `.env` is gitignored repo-wide; only `.env.example` (plus the public-only
  `frontend/.env.production` and `admin/.env.production`) is committed. Keep the
  example files in sync when a new variable is introduced, with placeholders
  only — never a real value.
