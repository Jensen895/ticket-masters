# ticket-masters

A low-latency ticket comparison skeleton: one searchable catalog, normalized listings from multiple marketplaces, and a fresh cross-source price snapshot.

## Repository map

```text
apps/web       Next.js storefront and event comparison UI
apps/api       Fastify read API, refresh endpoint, and SSE contract
apps/worker    Discovery/refresh orchestration and marketplace adapters
packages/contracts  Shared domain models, API schemas, and demo fixtures
infra          Local PostgreSQL/Redis bootstrap
docs           Architecture and delivery notes
```

## Local setup (no Docker required)

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The web app intentionally falls back to shared demo data until the API is connected to its repositories, so the complete UI is explorable from the first run.

API documentation is available at `http://localhost:4000/docs`. Local mode uses demo repositories and an in-memory refresh queue.

## Production-like local setup

When a container runtime is available, start PostgreSQL and Redis and include the worker:

```bash
cp .env.example .env
docker compose up -d
pnpm dev:full
```

PostgreSQL listens on port `5432` and Redis on port `6379`. Set `QUEUE_DRIVER=redis` whenever the API should enqueue work for the refresh worker.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm build
```

See [docs/architecture.md](docs/architecture.md) for the first-crawl and sub-10-second refresh design.
