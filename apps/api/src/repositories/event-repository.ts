import type { EventDetail, EventSummary, PriceSnapshot } from "@ticket-hub/contracts";
import { demoEvents, findDemoEvent } from "@ticket-hub/contracts/demo";

export interface EventQuery {
  query?: string;
  category?: string;
  city?: string;
  limit: number;
}

export interface EventRepository {
  search(input: EventQuery): Promise<EventSummary[]>;
  findByIdOrSlug(value: string): Promise<EventDetail | undefined>;
  getLatestSnapshot(eventId: string): Promise<PriceSnapshot | undefined>;
}

/**
 * Development adapter. Replace with PostgresEventRepository and
 * RedisSnapshotRepository without changing routes or domain contracts.
 */
export class DemoEventRepository implements EventRepository {
  async search(input: EventQuery): Promise<EventSummary[]> {
    const query = input.query?.trim().toLowerCase();
    return demoEvents
      .filter((event) => !query || `${event.name} ${event.venue.name} ${event.venue.city}`.toLowerCase().includes(query))
      .filter((event) => !input.category || event.category.toLowerCase() === input.category.toLowerCase())
      .filter((event) => !input.city || event.venue.city.toLowerCase() === input.city.toLowerCase())
      .slice(0, input.limit);
  }

  async findByIdOrSlug(value: string): Promise<EventDetail | undefined> {
    return findDemoEvent(value);
  }

  async getLatestSnapshot(eventId: string): Promise<PriceSnapshot | undefined> {
    return findDemoEvent(eventId)?.snapshot;
  }
}
