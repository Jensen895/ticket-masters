# ticket-masters

A private, read-only event price comparison board. It crawls public marketplace pages instead of requiring seller API keys.

## What it does

1. Searches Ticketmaster’s public web results for the event name, date, time, venue, image, and official static seat map.
2. Saves only events explicitly added by the user in browser local storage.
3. On the first event-page load, refreshes the base Ticketmaster record and then concurrently crawls Ticketmaster, SeatGeek, StubHub, TickPick, Gametime, and Vivid Seats.
4. Reads Ticketmaster’s public section outlines and exact seat coordinates, then aligns normalized marketplace listings to the same map.
5. Lets the user click a section to zoom into its rows and seats, or pan/zoom the full map.
6. Deduplicates the same section/row/seat across marketplaces, shows only its lowest public price, and links that seat to the winning marketplace. Prices are display-only.
7. Offers per-event price-drop alerts: watch the event's lowest price or any set of sections, and get notified in-app (optionally via browser notification) when prices fall.

The collector uses only publicly returned HTML, JSON-LD, embedded page state, and Ticketmaster’s published map geometry. It does not sign in, solve challenges, spoof sessions, or bypass access controls. A marketplace that blocks plain server requests or does not expose listing data is shown as unavailable (`—`). Site markup changes can require parser maintenance.

## Repository map

```text
apps/web       Next.js UI plus the active private-use crawling routes
apps/api       Fastify read/refresh service scaffold
apps/worker    Queue/connector scaffold for a persistent deployment
packages/contracts  Shared event, offer, crawl-status, and map models
infra          Local PostgreSQL/Redis bootstrap
docs           Architecture notes
```

## Local setup

Requires Node 20+ and pnpm 10+. No marketplace API keys are needed.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Search for an event, add it, and open its card. Crawler settings are optional and documented in `.env.example`.

## Operational notes

- Public pages are cached in-process for 60 seconds by default so one page load does not repeatedly hit sellers.
- Six marketplace crawls run concurrently with a 10-second per-request timeout and a 10 MB response cap.
- Event matching weighs normalized title, venue, and start time and rejects likely parking-event mismatches.
- Prices include fees only when the source page explicitly exposes an all-in total. TickPick public prices are treated as fee-inclusive.
- Some resale pages publish only a section or row. Those offers remain available at section level and are not attached to a fabricated exact seat.
- The current persistence model is browser-local. Restarting the Next.js process clears only the short-lived crawl cache, not saved events.

## Quality checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

See [docs/architecture.md](docs/architecture.md) for the crawl and normalization flow.
