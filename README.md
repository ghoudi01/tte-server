# Tunisia Trust Engine — Backend Server

Express + tRPC backend aligned with the web client and IA system.

## Stack

- Express
- tRPC
- Zod
- TypeScript
- IA integration from `../ia-system/src/tte`

## Run

```bash
cd server
pnpm install
pnpm dev
```

Server endpoints:

- Health: `GET /health`
- API: `POST /api/trpc/*`

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run dev server with watch |
| `pnpm start` | Run production server |
| `pnpm build` | Type-check backend |
| `pnpm check` | Type-check backend |
