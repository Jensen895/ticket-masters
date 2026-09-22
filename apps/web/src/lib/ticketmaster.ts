import type {
  EventClassification,
  TicketmasterSearchResponse,
  TrackedEvent,
  TrackedEventDetail,
} from "@ticket-hub/contracts";

interface TicketmasterImage {
  url?: string;
  ratio?: string;
  width?: number;
}

interface TicketmasterClassification {
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
}

interface TicketmasterVenue {
  name?: string;
  city?: { name?: string };
  state?: { name?: string; stateCode?: string };
  country?: { name?: string; countryCode?: string };
  address?: { line1?: string; line2?: string };
  postalCode?: string;
  timezone?: string;
}

export interface TicketmasterApiEvent {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  accessibility?: { info?: string };
  images?: TicketmasterImage[];
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string; dateTBD?: boolean; timeTBA?: boolean };
    status?: { code?: string };
  };
  classifications?: TicketmasterClassification[];
  seatmap?: { staticUrl?: string };
  _embedded?: {
    venues?: TicketmasterVenue[];
    attractions?: Array<{ name?: string }>;
  };
}

function normalizeClassification(event: TicketmasterApiEvent): EventClassification {
  const classification = event.classifications?.[0];
  const segment = classification?.segment?.name?.toLowerCase() ?? "";
  const genre = classification?.genre?.name?.toLowerCase() ?? "";
  const subGenre = classification?.subGenre?.name?.toLowerCase() ?? "";

  if (genre.includes("comedy") || subGenre.includes("comedy")) return "Comedy";
  if (segment.includes("music")) return "Music";
  if (segment.includes("sport")) return "Sports";
  if (segment.includes("arts") || segment.includes("theatre") || segment.includes("theater")) return "Arts & Theater";
  if (segment.includes("family") || genre.includes("family")) return "Family";
  return "Other";
}

function formatDate(localDate?: string) {
  if (!localDate) return "Date TBA";
  const date = new Date(`${localDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return localDate;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTime(localTime?: string, timeTBA?: boolean) {
  if (!localTime || timeTBA) return "Time TBA";
  const [hours = "0", minutes = "0"] = localTime.split(":");
  const date = new Date(Date.UTC(2020, 0, 1, Number(hours), Number(minutes)));
  if (Number.isNaN(date.getTime())) return localTime;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date);
}

function bestImage(images: TicketmasterImage[] = []) {
  return [...images]
    .filter((image) => image.url)
    .sort((left, right) => {
      const ratioScore = Number(right.ratio === "16_9") - Number(left.ratio === "16_9");
      return ratioScore || (right.width ?? 0) - (left.width ?? 0);
    })[0]?.url;
}

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

function statusLabel(code?: string) {
  const labels: Record<string, string> = {
    onsale: "On sale",
    offsale: "Off sale",
    canceled: "Canceled",
    postponed: "Postponed",
    rescheduled: "Rescheduled",
  };
  return code ? labels[code.toLowerCase()] ?? code : undefined;
}

export function mapTicketmasterEvent(event: TicketmasterApiEvent): TrackedEvent | undefined {
  if (!event.id || !event.name) return undefined;
  const venue = event._embedded?.venues?.[0];
  const classification = event.classifications?.[0];
  const start = event.dates?.start;
  const addressParts = [
    venue?.address?.line1,
    venue?.address?.line2,
    [venue?.city?.name, venue?.state?.stateCode, venue?.postalCode].filter(Boolean).join(", "),
    venue?.country?.countryCode,
  ].filter(Boolean);

  return {
    id: event.id,
    name: event.name,
    classification: normalizeClassification(event),
    genre: classification?.genre?.name,
    startsAt: start?.dateTime ?? (start?.localDate ? `${start.localDate}${start.localTime ? `T${start.localTime}` : ""}` : undefined),
    dateLabel: start?.dateTBD ? "Date TBA" : formatDate(start?.localDate),
    timeLabel: formatTime(start?.localTime, start?.timeTBA),
    venue: {
      name: venue?.name ?? "Venue TBA",
      city: venue?.city?.name ?? "",
      region: venue?.state?.stateCode ?? venue?.country?.countryCode ?? "",
      timezone: venue?.timezone ?? "",
    },
    venueAddress: addressParts.join(" · "),
    imageUrl: secureUrl(bestImage(event.images)),
    seatMapUrl: secureUrl(event.seatmap?.staticUrl),
    ticketmasterUrl: secureUrl(event.url) ?? "https://www.ticketmaster.com/",
    status: statusLabel(event.dates?.status?.code),
  };
}

export function mapTicketmasterEventDetail(event: TicketmasterApiEvent): TrackedEventDetail | undefined {
  const summary = mapTicketmasterEvent(event);
  if (!summary) return undefined;

  return {
    ...summary,
    description: event.info,
    importantInfo: [event.pleaseNote].filter((value): value is string => Boolean(value)),
    attractions: (event._embedded?.attractions ?? []).flatMap((attraction) => attraction.name ? [attraction.name] : []),
    accessibilityInfo: event.accessibility?.info,
  };
}

export interface TicketmasterApiSearchPayload {
  _embedded?: { events?: TicketmasterApiEvent[] };
  page?: { totalElements?: number; number?: number; totalPages?: number };
}

export function mapTicketmasterSearch(payload: TicketmasterApiSearchPayload): TicketmasterSearchResponse {
  const items = (payload._embedded?.events ?? []).flatMap((event) => {
    const mapped = mapTicketmasterEvent(event);
    return mapped ? [mapped] : [];
  });
  return {
    items,
    total: payload.page?.totalElements ?? items.length,
    page: payload.page?.number ?? 0,
    pageCount: payload.page?.totalPages ?? (items.length ? 1 : 0),
  };
}
