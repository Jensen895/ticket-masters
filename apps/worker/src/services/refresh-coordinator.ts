import type { MarketplaceQuote, PriceSnapshot } from "@ticket-hub/contracts";
import type { MarketplaceConnector } from "../connectors/connector.js";

export interface SnapshotPublisher {
  publish(snapshot: PriceSnapshot): Promise<void>;
  close(): Promise<void>;
}

export interface RefreshLogger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export class RefreshCoordinator {
  constructor(
    private readonly connectors: MarketplaceConnector[],
    private readonly publisher: SnapshotPublisher,
    private readonly deadlineMs: number,
    private readonly logger: RefreshLogger,
  ) {}

  async refresh(eventId: string): Promise<PriceSnapshot> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new Error("refresh deadline exceeded")), this.deadlineMs);

    try {
      const outcomes = await Promise.allSettled(
        this.connectors.map((connector) => connector.refresh({ eventId }, controller.signal)),
      );
      const successful = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
      const offers = successful.flatMap((result) => result.offers);
      const quotes: MarketplaceQuote[] = successful.map((result) => ({
        marketplace: result.marketplace,
        label: result.label,
        color: result.color,
        minimumPriceCents: result.offers.length ? Math.min(...result.offers.map((offer) => offer.priceCents)) : 0,
        listingCount: result.offers.length,
        status: result.status,
        capturedAt: result.capturedAt,
      }));
      const capturedAt = new Date().toISOString();
      const snapshot: PriceSnapshot = {
        eventId,
        version: `snap_${Date.now()}`,
        status: quotes.every((quote) => quote.status === "fresh") ? "fresh" : "partial",
        capturedAt,
        nextRefreshEligibleAt: new Date(Date.now() + 10_000).toISOString(),
        quotes,
        offers,
      };

      await this.publisher.publish(snapshot);
      this.logger.info({ eventId, elapsedMs: Date.now() - startedAt, sources: successful.length, offers: offers.length }, "refresh published");
      return snapshot;
    } catch (error) {
      this.logger.error({ eventId, error }, "refresh failed");
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }
}
