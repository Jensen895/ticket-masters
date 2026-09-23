# Architecture

## Active private-use flow

```text
Browser
  │
  ├─ search ───────> Next.js /api/ticketmaster/events
  │                         │
  │                         └─ Ticketmaster public search HTML
  │
  └─ open event ───> refresh Ticketmaster base record
                     then POST /api/prices
                              │
                              ├─ six public marketplace pages (parallel)
                              └─ Ticketmaster public map geometry
                                         │
                                         v
                              normalized read-only snapshot
                                         │
                                         v
                              section price labels on one map
```

The browser stores the user’s selected events in local storage. The Next.js server owns all crawling, so remote sites are never called from the browser and no secret or seller API key is required.

## Collection boundary

Collectors request ordinary public pages with a descriptive user agent, a 10-second timeout, a 10 MB response cap, and a short in-process cache. They parse:

- Ticketmaster `__NEXT_DATA__` for catalog metadata and static map URLs.
- Marketplace JSON-LD for event discovery and event-level price ranges.
- Publicly embedded JSON page state for section, row, quantity, and price listings.
- Ticketmaster map geometry labels for section coordinates.

Collectors do not authenticate, execute anti-bot workarounds, or retry around access denials. HTTP 401, 403, and 429 responses become a visible `blocked` source status. Missing confident title/date/venue matches become `not-found`; absent public listings become `unavailable`.

## Normalization

Event matching combines title token overlap, venue overlap, and start-time proximity. Parking/add-on events are penalized unless the requested event is itself parking. Section labels are case-folded and stripped of common `section`, `sec`, `level`, and `zone` prefixes before matching.

Listing money is stored as integer cents. A nested public `total` is marked fee-inclusive; ambiguous prices are not labeled all-in. For each Ticketmaster section, the UI shows the lowest listing found per marketplace. Event-wide prices with no published section remain visible in the marketplace summary strip rather than being assigned to a made-up map location.

## Persistence and scaling path

The current crawl cache is intentionally process-local for a single private instance. The existing Fastify, worker, Redis, and PostgreSQL projects remain a path to durable history and background refreshes. A hosted or multi-user deployment should move crawling to the worker, persist source-event mappings, add source-specific rate limits, and review each marketplace’s current terms and robots policy before enabling it.
