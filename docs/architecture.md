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
                              └─ Ticketmaster public section + seat geometry
                                         │
                                         v
                              normalized read-only snapshot
                                         │
                                         v
                              clickable sections and deduplicated seat prices
```

The browser stores the user’s selected events in local storage. The Next.js server owns all crawling, so remote sites are never called from the browser and no secret or seller API key is required.

## Collection boundary

Collectors request ordinary public pages with a descriptive user agent, a 10-second timeout, a 10 MB response cap, and a short in-process cache. They parse:

- Ticketmaster `__NEXT_DATA__` for catalog metadata and static map URLs.
- Marketplace JSON-LD for event discovery and event-level price ranges.
- Publicly embedded JSON page state for section, row, quantity, and price listings.
- Ticketmaster map geometry for section outlines, rows, seat numbers, and exact seat coordinates.

Collectors do not authenticate, execute anti-bot workarounds, or retry around access denials. HTTP 401, 403, and 429 responses become a visible `blocked` source status. Missing confident title/date/venue matches become `not-found`; absent public listings become `unavailable`.

## Normalization

Event matching combines title token overlap, venue overlap, and start-time proximity. Parking/add-on events are penalized unless the requested event is itself parking. Section labels are case-folded and stripped of common `section`, `sec`, `level`, and `zone` prefixes before matching.

Listing money is stored as integer cents. A nested public `total` is marked fee-inclusive; ambiguous prices are not labeled all-in. For each Ticketmaster section, the UI shows the lowest listing found across all marketplaces. When a source publishes section, row, and seat, listings with the same normalized seat identity are collapsed to the cheapest offer and retain that marketplace’s deep link. Section-only and row-only listings are never assigned to a fabricated exact seat.

## Persistence and scaling path

The current crawl cache is intentionally process-local for a single private instance. The existing Fastify, worker, Redis, and PostgreSQL projects remain a path to durable history and background refreshes. A hosted or multi-user deployment should move crawling to the worker, persist source-event mappings, add source-specific rate limits, and review each marketplace’s current terms and robots policy before enabling it.
