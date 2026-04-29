# Tunisia Trust Engine — Strapi Server

Strapi 5 backend for TTE. Aligned with **`docs/PLUGINS_DB_AND_API_SPEC.md`** for plugin API, webhooks, and DB schema.

## Node version

**Strapi 5 supports Node.js 20, 22, and 24.**
The SQLite client (`better-sqlite3`) needs native bindings; **Node 25+ has no prebuild** and will show "Could not locate the bindings file". Use Node 22:

```bash
nvm use 22
cd server && pnpm rebuild better-sqlite3
pnpm develop
```

## Setup

1. **Install dependencies** (from repo root or from `server/`):

   ```bash
   cd server && pnpm install
   ```

2. **Copy env and set secrets**:

   ```bash
   cp .env.example .env
   # Edit .env: set APP_KEYS, ADMIN_JWT_SECRET, API_TOKEN_SALT, TRANSFER_TOKEN_SALT, ENCRYPTION_KEY
   # Generate keys: openssl rand -base64 32
   ```

3. **Database (SQLite)**
   The DB file is created at `<repo-root>/.tmp/data.db`. Run `mkdir -p .tmp` from the repo root if needed.
   If you see `Could not locate the bindings file` for `better-sqlite3`, use Node 22 and run `pnpm rebuild better-sqlite3`.

4. **Start Strapi**:

   ```bash
   pnpm develop
   ```

   - **Admin:** http://localhost:1337/admin (create first admin on first run)
   - **API:** http://localhost:1337/api

## Alignment with PLUGINS_DB_AND_API_SPEC

- **Content types**: Create `merchant`, `order`, `plugin`, `merchant-plugin`, `report`, `phone-verification` (and optionally credits-related) via Content-Type Builder or schema. See `docs/PLUGINS_DB_AND_API_SPEC.md`.
- **Plugin API (API-key auth)**: Implement `POST /api/plugin/orders`, `POST /api/plugin/reports` with API-key middleware and `getMerchantByApiKey(apiKey)`.
- **Webhooks**: `POST /api/webhooks/meta`, `GET /api/webhooks/meta` for Meta (Facebook/Instagram).
- **Credits**: See `docs/CREDITS_PAYMENT_MODEL.md`.

## Commands

| Command          | Description              |
|------------------|--------------------------|
| `pnpm develop`   | Dev server + admin       |
| `pnpm build`     | Build admin + backend    |
| `pnpm start`     | Production start         |
| `pnpm strapi`    | Strapi CLI               |

## References

- **Spec**: `docs/PLUGINS_DB_AND_API_SPEC.md`
- **Credits**: `docs/CREDITS_PAYMENT_MODEL.md`
- **Strapi 5**: https://docs.strapi.io/
