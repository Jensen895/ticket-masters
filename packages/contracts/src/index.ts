export type Marketplace =
  | "ticketmaster"
  | "stubhub"
  | "seatgeek"
  | "vivid-seats";

export type EventCategory = "Music" | "Sports" | "Arts" | "Comedy";

export interface Venue {
  name: string;
  city: string;
  region: string;
  timezone: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  category: EventCategory;
  dateLabel: string;
  timeLabel: string;
  startsAt: string;
  venue: Venue;
  imageUrl: string;
  accent: string;
  minPriceCents: number;
  currency: "USD";
}

export interface TicketOffer {
  id: string;
  marketplace: Marketplace;
  marketplaceLabel: string;
  section: string;
  row: string;
  quantity: number;
  priceCents: number;
  feesIncluded: boolean;
  deepLink: string;
  capturedAt: string;
}

export interface MarketplaceQuote {
  marketplace: Marketplace;
  label: string;
  color: string;
  minimumPriceCents: number;
  listingCount: number;
  status: "fresh" | "stale" | "unavailable";
  capturedAt: string;
}

export interface PriceSnapshot {
  eventId: string;
  version: string;
  status: "fresh" | "refreshing" | "partial";
  capturedAt: string;
  nextRefreshEligibleAt: string;
  quotes: MarketplaceQuote[];
  offers: TicketOffer[];
}

export interface EventDetail extends EventSummary {
  description: string;
  venueAddress: string;
  importantInfo: string[];
  snapshot: PriceSnapshot;
}

export interface EventSearchResponse {
  items: EventSummary[];
  total: number;
  cursor?: string;
}

export interface RefreshAcceptedResponse {
  eventId: string;
  refreshId: string;
  state: "queued" | "already-running";
  streamUrl: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
}

export const REFRESH_QUEUE_NAME = "event-price-refresh";

export interface RefreshEventJob {
  eventId: string;
  requestedAt: string;
  reason: "user" | "stale-cache" | "scheduled";
}

export const marketplaceLabels: Record<Marketplace, string> = {
  ticketmaster: "Ticketmaster",
  stubhub: "StubHub",
  seatgeek: "SeatGeek",
  "vivid-seats": "Vivid Seats",
};
