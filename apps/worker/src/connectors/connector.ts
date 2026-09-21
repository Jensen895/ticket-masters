import type { Marketplace, TicketOffer } from "@ticket-hub/contracts";

export interface CanonicalEventContext {
  eventId: string;
  sourceEventId?: string;
  sourceUrl?: string;
}

export interface DiscoveryResult {
  sourceEventId: string;
  sourceUrl: string;
  eventName: string;
  startsAt: string;
  venue: { name: string; city: string; region: string; timezone: string };
  seatMap?: unknown;
}

export interface ConnectorRefreshResult {
  marketplace: Marketplace;
  label: string;
  color: string;
  status: "fresh" | "unavailable";
  capturedAt: string;
  offers: TicketOffer[];
}

/** Every seller integration must implement this boundary and its own rate limit. */
export interface MarketplaceConnector {
  readonly marketplace: Marketplace;
  discover(externalIdOrUrl: string): Promise<DiscoveryResult>;
  refresh(event: CanonicalEventContext, signal: AbortSignal): Promise<ConnectorRefreshResult>;
}
