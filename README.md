# ticket-masters

A personal event board backed by Ticketmaster. Search the Ticketmaster catalog, explicitly add the events you care about, and revisit their dates, venues, event information, and interactive seat maps.

## Repository map

```text
apps/web       Next.js storefront and event comparison UI
apps/api       Fastify read API, refresh endpoint, and SSE contract
apps/worker    Discovery/refresh orchestration and marketplace adapters
packages/contracts  Shared domain models, API schemas, and demo fixtures
infra          Local PostgreSQL/Redis bootstrap
docs           Architecture and delivery notes
```

## Local setup

Requires Node 20+ and pnpm 10+.

1. Create a Ticketmaster Discovery API key at [developer.ticketmaster.com](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/).
2. Copy `.env.example` to `.env.local` and set `TICKETMASTER_API_KEY`.
3. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

Open `http://localhost:3000`. The dashboard intentionally starts empty. Added events are stored in the browser's local storage and are not shared between browsers or users.

The Next.js server proxies Ticketmaster requests so the API key is never sent to the browser. Ticketmaster's public Discovery API supplies event metadata and a static venue seat-map image. It does not expose live per-seat inventory; the app links to Ticketmaster for current seat availability.

## Production-like local setup

When a container runtime is available, start PostgreSQL and Redis and include the worker:

```bash
cp .env.example .env
docker compose up -d
pnpm dev:full
```

PostgreSQL listens on port `5432` and Redis on port `6379`. The API and worker remain available as scaffolding for a future authenticated, server-persisted event collection.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

See [docs/architecture.md](docs/architecture.md) for the first-crawl and sub-10-second refresh design.
