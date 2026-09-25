export type Marketplace =
  | "ticketmaster"
  | "stubhub"
  | "seatgeek"
  | "tickpick"
  | "gametime"
  | "vivid-seats";

export type EventCategory = "Music" | "Sports" | "Arts" | "Comedy";

export type EventClassification =
  | "Music"
  | "Sports"
  | "Arts & Theater"
  | "Comedy"
  | "Family"
  | "Other";

/** A Ticketmaster event explicitly added to this app by the current user. */
export interface TrackedEvent {
  id: string;
  name: string;
  classification: EventClassification;
  genre?: string;
  startsAt?: string;
  dateLabel: string;
  timeLabel: string;
  venue: Venue;
  venueAddress?: string;
  imageUrl?: string;
  seatMapUrl?: string;
  ticketmasterUrl: string;
  status?: string;
  attractions?: string[];
}

export interface TrackedEventDetail extends TrackedEvent {
  description?: string;
  importantInfo: string[];
  attractions: string[];
  accessibilityInfo?: string;
}

export interface TicketmasterSearchResponse {
  items: TrackedEvent[];
  total: number;
  page: number;
  pageCount: number;
}

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
  /** Exact seat label when the marketplace publishes it. */
  seat?: string;
  quantity: number;
  priceCents: number;
  feesIncluded: boolean;
  deepLink: string;
  capturedAt: string;
}

export type MarketplaceCrawlStatus =
  | "fresh"
  | "unavailable"
  | "blocked"
  | "not-found"
  | "error";

export interface MarketplaceCrawlResult {
  marketplace: Marketplace;
  label: string;
  color: string;
  status: MarketplaceCrawlStatus;
  capturedAt: string;
  sourceUrl?: string;
  message?: string;
  offers: TicketOffer[];
}

/** Percentage coordinates taken from Ticketmaster's published map geometry. */
export interface SeatMapSectionPosition {
  section: string;
  xPercent: number;
  yPercent: number;
  /** Click target traced from Ticketmaster's published section geometry. */
  outline?: SeatMapPoint[];
  /** Exact curved section paths in Ticketmaster's native map coordinates. */
  paths?: string[];
  seatCount?: number;
}

export interface SeatMapPoint {
  xPercent: number;
  yPercent: number;
}

/** An exact seat location from Ticketmaster's public place geometry. */
export interface SeatMapSeatPosition {
  id: string;
  section: string;
  row: string;
  seat: string;
  xPercent: number;
  yPercent: number;
}

export interface CrawledPriceSnapshot {
  eventId: string;
  capturedAt: string;
  status: "fresh" | "partial" | "unavailable";
  sources: MarketplaceCrawlResult[];
  sectionPositions: SeatMapSectionPosition[];
  seatPositions: SeatMapSeatPosition[];
  mapWidth?: number;
  mapHeight?: number;
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

export type PriceAlertScope = "event-lowest" | "sections";

/**
 * A user-created price-drop watch for one tracked event.
 *
 * - `event-lowest` triggers when the cheapest offer across all marketplaces
 *   drops below its baseline.
 * - `sections` triggers when any of the watched sections drops below its own
 *   baseline. One alert can watch multiple sections; each section keeps an
 *   independent baseline keyed by normalized section label.
 *
 * Baselines ratchet down only when a notification fires, so a reported drop is
 * always the total saving since the last notification (or alert creation).
 */
export interface PriceAlert {
  id: string;
  eventId: string;
  scope: PriceAlertScope;
  /** Display labels of watched sections (scope === "sections"). */
  sections: string[];
  /** Per-section baselines keyed by normalized section label. */
  sectionBaselines: Record<string, number>;
  /** Baseline for scope === "event-lowest". */
  baselineCents?: number;
  /** Optional ceiling: only notify when the current price is at or below this. */
  targetCents?: number;
  /** Optional floor on the drop size: ignore drops smaller than this. */
  minDropCents?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastTriggeredAt?: string;
}

export interface PriceAlertSectionDrop {
  section: string;
  previousCents: number;
  currentCents: number;
  dropCents: number;
  marketplace?: string;
  deepLink?: string;
}

/** A persisted record of one fired price-drop alert. */
export interface PriceAlertNotification {
  id: string;
  eventId: string;
  alertId: string;
  scope: PriceAlertScope;
  title: string;
  message: string;
  previousCents: number;
  currentCents: number;
  dropCents: number;
  dropPercent: number;
  sections: string[];
  sectionDrops: PriceAlertSectionDrop[];
  marketplace?: string;
  deepLink?: string;
  capturedAt: string;
  createdAt: string;
  read: boolean;
}

export const marketplaceLabels: Record<Marketplace, string> = {
  ticketmaster: "Ticketmaster",
  stubhub: "StubHub",
  seatgeek: "SeatGeek",
  tickpick: "TickPick",
  gametime: "Gametime",
  "vivid-seats": "Vivid Seats",
};
