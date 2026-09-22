import type { EventDetail, EventSummary, PriceSnapshot } from "@ticket-hub/contracts";

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
 * Empty development adapter. Events are no longer pre-populated with fixture
 * data; the web app maintains each user's explicitly added Ticketmaster events.
 * Replace this with a user-scoped persistent repository when identity is added.
 */
export class EmptyEventRepository implements EventRepository {
  async search(_input: EventQuery): Promise<EventSummary[]> {
    return [];
  }

  async findByIdOrSlug(_value: string): Promise<EventDetail | undefined> {
    return undefined;
  }

  async getLatestSnapshot(_eventId: string): Promise<PriceSnapshot | undefined> {
    return undefined;
  }
}
