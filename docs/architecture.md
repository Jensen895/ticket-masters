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

## Price alerts

Each tracked event has its own price-drop alert panel (`PriceAlertManager`) below the seat map. Two alert scopes are supported:

- `event-lowest`: watches the cheapest offer across all six marketplaces for the event.
- `sections`: watches a user-selected set of one or more venue sections; each section keeps an independent baseline.

Alerts and their notifications persist in browser local storage (`ticket-masters:price-alerts:v1` and `ticket-masters:price-alert-notifications:v1`), alongside tracked events. Every fresh price snapshot is evaluated exactly once per event (`evaluatePriceAlerts` in `apps/web/src/lib/price-alerts.ts`):

- An alert without a baseline adopts the current price and does not notify.
- A notification fires only when the current price drops below the baseline, satisfies the optional target-price ceiling and minimum-drop floor, and the alert is enabled.
- Baselines ratchet down only when a notification fires, so a reported drop is the total saving since the last notification (or alert creation).
- One `sections` alert produces at most one notification per check, listing every watched section that dropped.

Users are told about drops through an in-app banner, a persisted per-event drop history with unread counts, and an optional browser `Notification` (opt-in per browser). Checks run whenever prices load — via “Check prices now” or the optional 5/15/30-minute auto re-check while the event page stays open.

A hosted deployment should move evaluation into the worker (evaluate on each published snapshot, persist alerts/notifications in PostgreSQL, and deliver push/email), reusing the same `PriceAlert` contracts and trigger semantics.
