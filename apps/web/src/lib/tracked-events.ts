import type { EventClassification, TrackedEvent } from "@ticket-hub/contracts";

export const TRACKED_EVENTS_STORAGE_KEY = "ticket-masters:tracked-events:v1";

const classifications = new Set<EventClassification>([
  "Music",
  "Sports",
  "Arts & Theater",
  "Comedy",
  "Family",
  "Other",
]);

function isTrackedEvent(value: unknown): value is TrackedEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TrackedEvent>;
  return typeof event.id === "string"
    && typeof event.name === "string"
    && typeof event.dateLabel === "string"
    && typeof event.timeLabel === "string"
    && typeof event.ticketmasterUrl === "string"
    && event.ticketmasterUrl.startsWith("https://")
    && (!event.imageUrl || event.imageUrl.startsWith("https://"))
    && (!event.seatMapUrl || event.seatMapUrl.startsWith("https://"))
    && Boolean(event.classification && classifications.has(event.classification))
    && Boolean(event.venue && typeof event.venue.name === "string");
}

export function readTrackedEvents(storage: Pick<Storage, "getItem">): TrackedEvent[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(TRACKED_EVENTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isTrackedEvent) : [];
  } catch {
    return [];
  }
}

export function writeTrackedEvents(storage: Pick<Storage, "setItem">, events: TrackedEvent[]) {
  storage.setItem(TRACKED_EVENTS_STORAGE_KEY, JSON.stringify(events));
}
