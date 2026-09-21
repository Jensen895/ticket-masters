import type { Marketplace } from "@ticket-hub/contracts";
import type { CanonicalEventContext, ConnectorRefreshResult, DiscoveryResult, MarketplaceConnector } from "./connector.js";

const labels: Record<Marketplace, { label: string; color: string }> = {
  ticketmaster: { label: "Ticketmaster", color: "#076cdf" },
  stubhub: { label: "StubHub", color: "#5b34da" },
  seatgeek: { label: "SeatGeek", color: "#20a775" },
  "vivid-seats": { label: "Vivid Seats", color: "#ec1754" },
};

/**
 * Deliberately returns no inventory. Implement each seller using an authorized API
 * or a separately reviewed, compliant collector; never put parser details in the coordinator.
 */
export class StubConnector implements MarketplaceConnector {
  readonly marketplace: Marketplace;

  constructor(marketplace: Marketplace) {
    this.marketplace = marketplace;
  }

  async discover(_externalIdOrUrl: string): Promise<DiscoveryResult> {
    throw new Error(`${labels[this.marketplace].label} discovery connector is not configured`);
  }

  async refresh(_event: CanonicalEventContext, signal: AbortSignal): Promise<ConnectorRefreshResult> {
    signal.throwIfAborted();
    return {
      marketplace: this.marketplace,
      ...labels[this.marketplace],
      status: "unavailable",
      capturedAt: new Date().toISOString(),
      offers: [],
    };
  }
}
