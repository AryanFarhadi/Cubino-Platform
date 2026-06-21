# Cubino

Discord-like community platform with a bear-cub brand. MVP includes auth, Dens, real-time chat, roles, DMs, and P2P voice.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Frontend:** Next.js 14 (`apps/web`)
- **Backend:** Fastify + Socket.IO + Drizzle (`apps/server`)
- **Data:** PostgreSQL, Redis, MinIO (Docker)

## Quick start

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Demo user (after seed): `cubby` / `cubino123`

## Demo flow

1. Register or log in as `cubby`
2. Create a Den or join via invite
3. Send messages in a Text Nest
4. Open a Voice Hollow in a second browser/incognito for P2P voice (works best on LAN)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run web + server via Turborepo |
| `pnpm build` | Build all packages |
| `pnpm db:migrate` | Run Drizzle migrations |
| `pnpm db:seed` | Seed demo data |

## Deployment (Raspberry Pi)

```bash
python deploy.py
```

This syncs the repo, runs `docker compose -f docker/docker-compose.prod.yml up -d --build`, applies migrations, and reloads nginx. See `nginx-cubino.conf` for proxy rules (`/` → web, `/api` + `/socket.io` → server).

**Note:** P2P voice through CGNAT may require a TURN server (Phase 2). LAN testing works for MVP validation.

## Project layout

```
apps/web/          Next.js frontend
apps/server/       Fastify API + WebSockets
packages/shared/   Types, permissions bitfield
docker/            Compose files + Dockerfiles
```

See [CUBINO_SPEC.md](./CUBINO_SPEC.md) for the full product spec.
