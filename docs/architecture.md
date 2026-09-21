# Architecture

## Product boundary

ticket-masters keeps a canonical event catalog and compares normalized offers from authorized seller APIs or compliant collectors. The skeleton does not bypass access controls or ship marketplace-specific crawling logic. Each connector must be reviewed against the seller's API terms, robots policy, rate limits, and applicable law before it is enabled.

## Services

```text
Browser / CDN
      |
      v
Next.js web -----> Fastify read API -----> Redis hot snapshots
                         |                         ^
                         v                         |
                    PostgreSQL              atomic publish
                         ^                         |
                         |                         |
                 discovery worker       refresh coordinator
                         |                  /   |   \
                         +------------ seller connectors
```

- **Web:** server-rendered discovery pages, client-side filters, and an SSE-ready live-price panel.
- **API:** validates requests, reads hot snapshots, returns stale-but-valid data immediately, and enqueues refreshes.
- **Worker:** keeps network I/O outside request handlers. It performs one slow discovery pass, then cheap parallel refresh passes.
- **PostgreSQL:** durable canonical events, source mappings, venue/seat metadata, and partitioned price history.
- **Redis:** latest immutable event snapshot, distributed locks, refresh jobs, source health, and short-lived search caches.

## Two crawl paths

### Initial discovery (allowed to be slow)

1. Acquire an event-level discovery lock and fan out to enabled connectors.
2. Resolve seller-specific events into one canonical event using artist, venue, start time, and location.
3. Fetch stable metadata once: venue, timezone, sections/rows, seat-map references, policies, and source URLs.
4. Persist raw evidence separately, normalize the catalog in PostgreSQL, and create source mappings.
5. Run the regular refresh path and atomically publish the first complete snapshot.

### Repeat refresh (8-second internal deadline)

1. Return the current Redis snapshot to the client immediately; enqueue a refresh only if it is stale or explicitly requested.
2. A coordinator fans out all source calls concurrently, with per-source deadlines, circuit breakers, and rate limits.
3. Each adapter fetches only volatile inventory fields. Stable event/venue data is reused from discovery.
4. Normalize currency, fees, section/row labels, quantities, and deep links in memory.
5. Publish a new versioned Redis snapshot in one atomic operation. Slow sources retain their last known offers and are marked stale.
6. Notify connected clients over SSE; persist history asynchronously in batches.

This makes the visible latency the slowest healthy connector rather than the sum of connectors. A realistic target is p95 under 10 seconds for a completed refresh and under 200 ms for cached API reads. No system can promise a seller has published a price more recently than its upstream permits.

## Scale and reliability

- Partition refresh queues by source so one blocked seller cannot starve others.
- Deduplicate refreshes with a Redis lock keyed by canonical event ID.
- Autoscale connector workers on queue age, not CPU alone.
- Use stale-while-revalidate and show source timestamps instead of blanking results on partial failure.
- Store money as integer minor units and preserve fee-inclusion semantics.
- Version connector parsers and retain sampled raw responses for regression testing.
- Add OpenTelemetry spans across enqueue, fetch, normalize, publish, and stream stages.

## Next implementation slices

1. Add database migrations and repository implementations behind the current API interfaces.
2. Integrate one official marketplace API end-to-end and establish freshness/error SLOs.
3. Add identity, watchlists, alerts, and notification preferences.
4. Add section normalization and a licensed/venue-provided interactive seat map.
5. Add connector contract tests, recorded fixtures, and synthetic freshness monitoring.
