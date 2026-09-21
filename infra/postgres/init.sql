CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  venue_name TEXT NOT NULL,
  venue_city TEXT NOT NULL,
  venue_region TEXT NOT NULL,
  venue_timezone TEXT NOT NULL,
  image_url TEXT,
  seat_map JSONB,
  metadata_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_events (
  event_id UUID NOT NULL REFERENCES events(id),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_url TEXT NOT NULL,
  last_discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, source)
);

CREATE TABLE IF NOT EXISTS listing_snapshots (
  event_id UUID NOT NULL REFERENCES events(id),
  source TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  min_price_cents INTEGER,
  listing_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL,
  PRIMARY KEY (event_id, source, captured_at)
) PARTITION BY RANGE (captured_at);

CREATE TABLE IF NOT EXISTS listing_snapshots_default
  PARTITION OF listing_snapshots DEFAULT;

CREATE INDEX IF NOT EXISTS events_name_search_idx ON events USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);
