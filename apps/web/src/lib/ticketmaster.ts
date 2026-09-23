import type {
  EventClassification,
  TicketmasterSearchResponse,
  TrackedEvent,
  TrackedEventDetail,
} from "@ticket-hub/contracts";

interface TicketmasterWebsiteEvent {
  id?: string;
  title?: string;
  url?: string;
  seatmapUrl?: string;
  dates?: { startDate?: string };
  venue?: {
    name?: string;
    city?: string;
    state?: string;
    countryCode?: string;
    addressLineOne?: string;
    code?: string;
  };
  timeZone?: string;
  cancelled?: boolean;
  postponed?: boolean;
  rescheduled?: boolean;
  soldOut?: boolean;
  artists?: Array<{
    name?: string;
    imageUrls?: Record<string, string | undefined>;
  }>;
  majorCategory?: { id?: string };
}

interface SearchQueryData {
  total?: number;
  events?: TicketmasterWebsiteEvent[];
}

interface ApiQuery {
  endpointName?: string;
  data?: SearchQueryData;
}

const categoryIds: Record<string, EventClassification> = {
  KZFzniwnSyZfZ7v7nJ: "Music",
  KZFzniwnSyZfZ7v7nE: "Sports",
  KZFzniwnSyZfZ7v7na: "Arts & Theater",
  KZFzniwnSyZfZ7v7n1: "Other",
};

function secureUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
}

function classificationFor(event: TicketmasterWebsiteEvent): EventClassification {
  const category = event.majorCategory?.id ? categoryIds[event.majorCategory.id] : undefined;
  if (category) return category;
  const title = event.title?.toLowerCase() ?? "";
  if (title.includes("comedy")) return "Comedy";
  return "Other";
}

function formatDateTime(startsAt?: string, timeZone?: string) {
  if (!startsAt) return { dateLabel: "Date TBA", timeLabel: "Time TBA" };
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return { dateLabel: startsAt, timeLabel: "Time TBA" };
  const zone = timeZone || "UTC";
  try {
    return {
      dateLabel: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: zone,
      }).format(date),
      timeLabel: new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: zone,
      }).format(date),
    };
  } catch {
    return {
      dateLabel: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date),
      timeLabel: new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" }).format(date),
    };
  }
}

function bestImage(event: TicketmasterWebsiteEvent) {
  const urls = event.artists?.flatMap((artist) => Object.values(artist.imageUrls ?? {}).filter((url): url is string => Boolean(url))) ?? [];
  return secureUrl(urls.find((url) => url.includes("16_9")) ?? urls[0]);
}

function statusLabel(event: TicketmasterWebsiteEvent) {
  if (event.cancelled) return "Canceled";
  if (event.postponed) return "Postponed";
  if (event.rescheduled) return "Rescheduled";
  if (event.soldOut) return "Sold out";
  return "On sale";
}

function mapWebsiteEvent(event: TicketmasterWebsiteEvent): TrackedEvent | undefined {
  if (!event.id || !event.title || !event.url) return undefined;
  const dateTime = formatDateTime(event.dates?.startDate, event.timeZone);
  const venue = event.venue;
  return {
    id: event.id,
    name: event.title,
    classification: classificationFor(event),
    startsAt: event.dates?.startDate,
    ...dateTime,
    venue: {
      name: venue?.name ?? "Venue TBA",
      city: venue?.city ?? "",
      region: venue?.state ?? venue?.countryCode ?? "",
      timezone: event.timeZone ?? "",
    },
    venueAddress: [venue?.addressLineOne, [venue?.city, venue?.state, venue?.code].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · "),
    imageUrl: bestImage(event),
    seatMapUrl: secureUrl(event.seatmapUrl),
    ticketmasterUrl: secureUrl(event.url) ?? "https://www.ticketmaster.com/",
    status: statusLabel(event),
    attractions: (event.artists ?? []).flatMap((artist) => artist.name ? [artist.name] : []),
  };
}

function scriptContentsById(html: string, id: string) {
  const marker = `id="${id}"`;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const start = html.indexOf(">", markerIndex);
  const end = html.indexOf("</script>", start);
  return start >= 0 && end > start ? html.slice(start + 1, end) : undefined;
}

function findSearchData(value: unknown, depth = 0): SearchQueryData | undefined {
  if (!value || typeof value !== "object" || depth > 8) return undefined;
  const record = value as Record<string, unknown>;
  if (record.endpointName === "searchEvents" && record.data && typeof record.data === "object") {
    return record.data as SearchQueryData;
  }
  for (const child of Object.values(record)) {
    const result = findSearchData(child, depth + 1);
    if (result) return result;
  }
  return undefined;
}

/** Parse the public page state embedded in Ticketmaster search-result HTML. */
export function mapTicketmasterSearchPage(html: string, page = 0): TicketmasterSearchResponse {
  const source = scriptContentsById(html, "__NEXT_DATA__");
  if (!source) throw new Error("Ticketmaster did not publish search data in this page.");
  const payload = JSON.parse(source) as unknown;
  const data = findSearchData(payload);
  if (!data) throw new Error("Ticketmaster search data could not be read.");
  const items = (data.events ?? []).flatMap((event) => {
    const mapped = mapWebsiteEvent(event);
    return mapped ? [mapped] : [];
  });
  const total = data.total ?? items.length;
  return {
    items,
    total,
    page,
    pageCount: Math.ceil(total / Math.max(items.length, 20)),
  };
}

export function asTicketmasterDetail(event: TrackedEvent): TrackedEventDetail {
  return {
    ...event,
    importantInfo: [],
    attractions: event.attractions ?? [],
  };
}
