import "server-only";

import type {
  CrawledPriceSnapshot,
  Marketplace,
  MarketplaceCrawlResult,
  SeatMapPoint,
  SeatMapSeatPosition,
  SeatMapSectionPosition,
  TicketOffer,
  TrackedEvent,
} from "@ticket-hub/contracts";
import { CrawlHttpError, fetchPublicPage } from "./http";
import {
  bestMatchingEvent,
  extractJsonScripts,
  normalizeSection,
  safeUrlForHost,
  schemaEvents,
  walkJson,
} from "./page-data";

interface SourceDefinition {
  marketplace: Marketplace;
  label: string;
  color: string;
  domains: string[];
  searchUrl(event: TrackedEvent): string;
}

const sources: SourceDefinition[] = [
  {
    marketplace: "ticketmaster",
    label: "Ticketmaster",
    color: "#076cdf",
    domains: ["ticketmaster.com"],
    searchUrl: (event) => event.ticketmasterUrl,
  },
  {
    marketplace: "seatgeek",
    label: "SeatGeek",
    color: "#20a775",
    domains: ["seatgeek.com"],
    searchUrl: (event) => `https://seatgeek.com/search?search=${encodeURIComponent(marketplaceQuery(event))}`,
  },
  {
    marketplace: "stubhub",
    label: "StubHub",
    color: "#5b34da",
    domains: ["stubhub.com"],
    searchUrl: (event) => `https://www.stubhub.com/find/s/?q=${encodeURIComponent(marketplaceQuery(event))}`,
  },
  {
    marketplace: "tickpick",
    label: "TickPick",
    color: "#f35321",
    domains: ["tickpick.com"],
    searchUrl: (event) => `https://www.tickpick.com/${performerSlug(event)}-tickets/`,
  },
  {
    marketplace: "gametime",
    label: "Gametime",
    color: "#f04e98",
    domains: ["gametime.co"],
    searchUrl: (event) => `https://gametime.co/search?q=${encodeURIComponent(marketplaceQuery(event))}`,
  },
  {
    marketplace: "vivid-seats",
    label: "Vivid Seats",
    color: "#ec1754",
    domains: ["vividseats.com"],
    searchUrl: (event) => `https://www.vividseats.com/search?searchTerm=${encodeURIComponent(marketplaceQuery(event))}`,
  },
];

interface SnapshotCacheEntry {
  expiresAt: number;
  value: Promise<CrawledPriceSnapshot>;
}

const globalCache = globalThis as typeof globalThis & {
  __ticketMastersSnapshotCache?: Map<string, SnapshotCacheEntry>;
};
const snapshotCache = globalCache.__ticketMastersSnapshotCache ?? new Map<string, SnapshotCacheEntry>();
globalCache.__ticketMastersSnapshotCache = snapshotCache;

function performerSlug(event: TrackedEvent) {
  const name = event.attractions?.[0] ?? event.name;
  const withoutPrefix = name.replace(/^[^:]{1,24}:\s*/, "");
  const participant = withoutPrefix.split(/\s+(?:vs\.?|at|@)\s+/i)[0] ?? withoutPrefix;
  return participant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function searchQuery(name: string) {
  return name.replace(/\b(?:vs\.?|versus|at)\b/gi, " ").replace(/[^a-z0-9]+/gi, " ").replace(/\s+/g, " ").trim();
}

function marketplaceQuery(event: TrackedEvent) {
  const attractions = event.attractions?.filter(Boolean) ?? [];
  return searchQuery(attractions.length ? attractions.join(" ") : event.name);
}

function stringValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function priceFromListing(record: Record<string, unknown>) {
  const nested = record.price && typeof record.price === "object"
    ? record.price as Record<string, unknown>
    : undefined;
  const explicitCents = numericValue(record.priceCents)
    ?? numericValue(record.price_cents)
    ?? numericValue(record.amountInCents)
    ?? numericValue(nested?.total)
    ?? numericValue(nested?.preTaxTotal);
  if (explicitCents && explicitCents > 0) {
    return { priceCents: Math.round(explicitCents), feesIncluded: nested?.total !== undefined };
  }
  const dollars = numericValue(record.displayPrice)
    ?? numericValue(record.listingPrice)
    ?? numericValue(record.currentPrice)
    ?? numericValue(typeof record.price === "object" ? nested?.amount : record.price);
  return dollars && dollars > 0
    ? { priceCents: Math.round(dollars * 100), feesIncluded: Boolean(record.feesIncluded) }
    : undefined;
}

function sectionFromListing(record: Record<string, unknown>) {
  const spot = record.spot && typeof record.spot === "object" ? record.spot as Record<string, unknown> : undefined;
  const seat = record.seat && typeof record.seat === "object" ? record.seat as Record<string, unknown> : undefined;
  return stringValue(record.section, record.sectionName, record.section_name, spot?.section, seat?.section);
}

function rowFromListing(record: Record<string, unknown>) {
  const spot = record.spot && typeof record.spot === "object" ? record.spot as Record<string, unknown> : undefined;
  const seat = record.seat && typeof record.seat === "object" ? record.seat as Record<string, unknown> : undefined;
  return stringValue(record.row, record.rowName, record.row_name, spot?.row, seat?.row) ?? "—";
}

function seatsFromListing(record: Record<string, unknown>) {
  const spot = record.spot && typeof record.spot === "object" ? record.spot as Record<string, unknown> : undefined;
  const seat = record.seat && typeof record.seat === "object" ? record.seat as Record<string, unknown> : undefined;
  const seats = new Set<string>();
  const addSeat = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number") {
      for (const label of String(value).split(",").map((item) => item.trim()).filter(Boolean)) seats.add(label);
      return;
    }
    if (value && typeof value === "object") {
      const candidate = value as Record<string, unknown>;
      addSeat(candidate.number ?? candidate.name ?? candidate.label ?? candidate.seatNumber);
    }
  };
  for (const value of [record.seats, record.seatNumbers, record.seat_numbers, record.seatNames]) {
    if (Array.isArray(value)) value.forEach(addSeat);
    else addSeat(value);
  }
  addSeat(stringValue(
    record.seatNumber,
    record.seat_number,
    record.seatName,
    record.seatLabel,
    typeof record.seat === "string" ? record.seat : undefined,
    seat?.number,
    seat?.name,
    spot?.seat,
    spot?.seatNumber,
  ));
  const start = numericValue(record.startSeat ?? record.start_seat);
  const end = numericValue(record.endSeat ?? record.end_seat);
  if (start && end && Number.isInteger(start) && Number.isInteger(end) && end >= start && end - start < 20) {
    for (let number = start; number <= end; number += 1) seats.add(String(number));
  }
  return [...seats];
}

function quantityFromListing(record: Record<string, unknown>) {
  const direct = numericValue(record.quantity) ?? numericValue(record.availableQuantity);
  if (direct) return Math.max(1, Math.round(direct));
  if (Array.isArray(record.availableLots)) {
    const quantities = record.availableLots.flatMap((value) => {
      const parsed = numericValue(value);
      return parsed ? [parsed] : [];
    });
    if (quantities.length) return Math.max(...quantities);
  }
  return 1;
}

function extractListings(
  payloads: unknown[],
  source: SourceDefinition,
  sourceUrl: string,
  capturedAt: string,
): TicketOffer[] {
  const offers: TicketOffer[] = [];
  const seen = new Set<string>();
  let pageUsesAllInPricing = false;
  walkJson(payloads, (record) => {
    if (record.showAip === true) pageUsesAllInPricing = true;
  });
  walkJson(payloads, (record) => {
    const section = sectionFromListing(record);
    const price = priceFromListing(record);
    if (!section || !price) return;
    const row = rowFromListing(record);
    const seats = seatsFromListing(record);
    const id = stringValue(record.id, record.listingId, record.listing_id)
      ?? `${normalizeSection(section)}-${row}-${price.priceCents}`;
    for (const seatLabel of seats.length ? seats : [undefined]) {
      const dedupeKey = `${id}-${normalizeSection(section)}-${row}-${seatLabel ?? "any"}-${price.priceCents}`;
      if (seen.has(dedupeKey) || offers.length >= 500) continue;
      seen.add(dedupeKey);
      offers.push({
        id: `${source.marketplace}-${id}${seatLabel ? `-${seatLabel}` : ""}`,
        marketplace: source.marketplace,
        marketplaceLabel: source.label,
        section,
        row,
        seat: seatLabel,
        quantity: quantityFromListing(record),
        priceCents: price.priceCents,
        feesIncluded: price.feesIncluded || pageUsesAllInPricing,
        deepLink: safeUrlForHost(stringValue(record.seoUrl, record.url), source.domains) ?? sourceUrl,
        capturedAt,
      });
    }
  });
  return offers;
}

function aggregateOffer(
  source: SourceDefinition,
  event: ReturnType<typeof bestMatchingEvent>,
  capturedAt: string,
  matchedUrl?: string,
): TicketOffer[] {
  if (!event?.lowPrice || !matchedUrl) return [];
  return [{
    id: `${source.marketplace}-event-minimum`,
    marketplace: source.marketplace,
    marketplaceLabel: source.label,
    section: "Any section",
    row: "—",
    quantity: 1,
    priceCents: Math.round(event.lowPrice * 100),
    feesIncluded: source.marketplace === "tickpick",
    deepLink: matchedUrl,
    capturedAt,
  }];
}

function blockedPage(html: string) {
  return html.length < 5_000 && /(?:access denied|captcha|forbidden|identify|robot|security incident|challenge validation|challenge content|verify-url)/i.test(html);
}

function failureStatus(error: unknown): Pick<MarketplaceCrawlResult, "status" | "message"> {
  if (error instanceof CrawlHttpError && [401, 403, 429].includes(error.status ?? 0)) {
    return { status: "blocked", message: "The marketplace declined this public page request." };
  }
  return {
    status: "error",
    message: error instanceof Error ? error.message : "The marketplace page could not be read.",
  };
}

function sourceIdentity(source: SourceDefinition) {
  return { marketplace: source.marketplace, label: source.label, color: source.color };
}

async function crawlSource(source: SourceDefinition, event: TrackedEvent): Promise<MarketplaceCrawlResult> {
  const capturedAt = new Date().toISOString();
  const searchUrl = safeUrlForHost(source.searchUrl(event), source.domains);
  if (!searchUrl) {
    return { ...sourceIdentity(source), status: "error", capturedAt, message: "The generated marketplace URL was invalid.", offers: [] };
  }

  try {
    const searchHtml = await fetchPublicPage(searchUrl);
    if (blockedPage(searchHtml)) {
      return { ...sourceIdentity(source), status: "blocked", capturedAt, sourceUrl: searchUrl, message: "The marketplace served a bot-check page.", offers: [] };
    }
    const searchPayloads = extractJsonScripts(searchHtml);
    const matched = source.marketplace === "ticketmaster"
      ? undefined
      : bestMatchingEvent(schemaEvents(searchPayloads), {
        name: event.name,
        startsAt: event.startsAt,
        venue: event.venue.name,
      });
    const absoluteMatchedUrl = matched?.url?.startsWith("/")
      ? new URL(matched.url, searchUrl).toString()
      : matched?.url;
    const matchedUrl = safeUrlForHost(absoluteMatchedUrl, source.domains);
    let detailHtml = searchHtml;
    let sourceUrl = matchedUrl ?? searchUrl;
    if (matchedUrl && matchedUrl !== searchUrl) {
      try {
        detailHtml = await fetchPublicPage(matchedUrl);
        if (blockedPage(detailHtml)) throw new CrawlHttpError("The marketplace served a bot-check page.", 403);
      } catch (error) {
        const aggregate = aggregateOffer(source, matched, capturedAt, matchedUrl);
        if (aggregate.length) {
          const failure = failureStatus(error);
          return { ...sourceIdentity(source), status: "fresh", capturedAt, sourceUrl, offers: aggregate, message: `Showing the public event minimum. Section listings were unavailable: ${failure.message}` };
        }
        throw error;
      }
    }

    const detailPayloads = extractJsonScripts(detailHtml);
    const listings = extractListings(detailPayloads, source, sourceUrl, capturedAt);
    const offers = [...listings, ...aggregateOffer(source, matched, capturedAt, matchedUrl)];
    if (offers.length) {
      return {
        ...sourceIdentity(source),
        status: "fresh",
        capturedAt,
        sourceUrl,
        offers,
        message: listings.length ? undefined : "This site publishes only an event-level minimum on its public page.",
      };
    }
    if (!matched && source.marketplace !== "ticketmaster") {
      return { ...sourceIdentity(source), status: "not-found", capturedAt, sourceUrl, message: "No confidently matching event was found.", offers: [] };
    }
    return { ...sourceIdentity(source), status: "unavailable", capturedAt, sourceUrl, message: "No public price listings were present in the page.", offers: [] };
  } catch (error) {
    return { ...sourceIdentity(source), ...failureStatus(error), capturedAt, sourceUrl: searchUrl, offers: [] };
  }
}

interface GeometryShape {
  labels?: Array<{ text?: string; x?: number; y?: number }>;
  bounds?: string[];
  path?: string;
}

interface GeometrySegment {
  id?: string;
  name?: string;
  segmentCategory?: string;
  shapes?: GeometryShape[];
  segments?: GeometrySegment[];
  totalPlaces?: number;
}

interface GeometryPlace {
  grid?: string;
  gridX?: number;
  gridY?: number;
  id?: string;
  name?: string;
  x?: number;
  y?: number;
}

interface SeatMapGeometry {
  sectionPositions: SeatMapSectionPosition[];
  seatPositions: SeatMapSeatPosition[];
  mapWidth?: number;
  mapHeight?: number;
}

function pointsFromShape(shape: GeometryShape): Array<{ x: number; y: number }> {
  return shape.bounds?.flatMap((bounds) => [...bounds.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))) ?? [];
}

interface GeometryPage {
  height?: number;
  width?: number;
  images?: Array<{ width?: number; height?: number }>;
  segments?: GeometrySegment[];
}

function positionFromShape(shape: GeometryShape) {
  const label = shape.labels?.[0];
  if (typeof label?.x === "number" && typeof label.y === "number") return { x: label.x, y: label.y };
  const points = pointsFromShape(shape);
  if (!points.length) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function rowSegments(segment: GeometrySegment): Array<{ id: string; name: string }> {
  const rows: Array<{ id: string; name: string }> = [];
  const visit = (candidate: GeometrySegment) => {
    if (candidate.segmentCategory === "ROW" && candidate.id && candidate.name) {
      rows.push({ id: candidate.id.split(":").at(-1) ?? candidate.id, name: candidate.name });
    }
    for (const child of candidate.segments ?? []) visit(child);
  };
  visit(segment);
  return rows.sort((left, right) => right.id.length - left.id.length);
}

async function ticketmasterSeatMap(eventId: string): Promise<SeatMapGeometry> {
  if (!/^[a-zA-Z0-9_-]+$/.test(eventId)) return { sectionPositions: [], seatPositions: [] };
  try {
    const baseUrl = `https://mapsapi.tmol.io/maps/geometry/3/event/${encodeURIComponent(eventId)}`;
    const geometryUrl = `${baseUrl}?systemId=HOST`;
    const placesUrl = `${baseUrl}/places?systemId=HOST`;
    const [geometryJson, placesJson] = await Promise.all([
      fetchPublicPage(geometryUrl),
      fetchPublicPage(placesUrl).catch(() => "[]"),
    ]);
    const page = JSON.parse(geometryJson) as { pages?: GeometryPage[] };
    const geometry = page.pages?.[0];
    if (!geometry) return { sectionPositions: [], seatPositions: [] };
    const height = geometry.height ?? 7_680;
    const image = geometry.images?.[0];
    const scale = image?.height ? height / image.height : 10;
    const width = geometry.width ?? (image?.width ? image.width * scale : 10_240);
    const positions = new Map<string, SeatMapSectionPosition>();
    const rowsBySection = new Map<string, Array<{ id: string; name: string }>>();
    for (const segment of geometry.segments ?? []) {
      if (!segment.name || !segment.shapes?.length) continue;
      const point = positionFromShape(segment.shapes[0]!);
      if (!point) continue;
      const key = normalizeSection(segment.name);
      if (positions.has(key)) continue;
      const outlinePoints = pointsFromShape(segment.shapes[0]!);
      const outline: SeatMapPoint[] = outlinePoints.map((outlinePoint) => ({
        xPercent: outlinePoint.x / width * 100,
        yPercent: outlinePoint.y / height * 100,
      }));
      positions.set(key, {
        section: segment.name,
        xPercent: Math.max(2, Math.min(98, point.x / width * 100)),
        yPercent: Math.max(2, Math.min(98, point.y / height * 100)),
        outline: outline.length >= 3 ? outline : undefined,
        paths: segment.shapes.flatMap((shape) => shape.path ? [shape.path] : []),
        seatCount: segment.totalPlaces,
      });
      rowsBySection.set(key, rowSegments(segment));
    }
    const places = JSON.parse(placesJson) as GeometryPlace[];
    const seatPositions: SeatMapSeatPosition[] = [];
    const allRows = [...rowsBySection].flatMap(([sectionKey, rows]) => rows.map((row) => ({ ...row, sectionKey })));
    const rowsById = new Map(allRows.map((row) => [row.id, row]));
    const rowIdLengths = [...new Set(allRows.map((row) => row.id.length))].sort((left, right) => right - left);
    const naturalRowsBySection = new Map([...rowsBySection].map(([key, rows]) => [
      key,
      [...rows].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true })),
    ]));
    for (const place of (Array.isArray(places) ? places : []).slice(0, 50_000)) {
      if (!place.grid || !place.id || !place.name || typeof place.x !== "number" || typeof place.y !== "number") continue;
      let matchedRow: (typeof allRows)[number] | undefined;
      for (const length of rowIdLengths) {
        matchedRow = rowsById.get(place.id.slice(0, length));
        if (matchedRow) break;
      }
      const directSectionKey = normalizeSection(place.grid);
      const reversedSectionKey = normalizeSection([...place.grid].reverse().join(""));
      const sectionKey = matchedRow?.sectionKey
        ?? (positions.has(directSectionKey) ? directSectionKey : reversedSectionKey);
      const section = positions.get(sectionKey);
      if (!section) continue;
      const row = matchedRow?.name ?? (typeof place.gridY === "number" ? naturalRowsBySection.get(sectionKey)?.[place.gridY]?.name : undefined);
      if (!row) continue;
      seatPositions.push({
        id: place.id,
        section: section.section,
        row,
        seat: place.name,
        xPercent: place.x / width * 100,
        yPercent: place.y / height * 100,
      });
    }
    return {
      sectionPositions: [...positions.values()],
      seatPositions,
      mapWidth: width,
      mapHeight: height,
    };
  } catch {
    return { sectionPositions: [], seatPositions: [] };
  }
}

async function createSnapshot(event: TrackedEvent): Promise<CrawledPriceSnapshot> {
  const [sourceResults, seatMap] = await Promise.all([
    Promise.all(sources.map((source) => crawlSource(source, event))),
    ticketmasterSeatMap(event.id),
  ]);
  const sourcesWithPrices = sourceResults.filter((source) => source.offers.length > 0).length;
  return {
    eventId: event.id,
    capturedAt: new Date().toISOString(),
    status: sourcesWithPrices === sources.length ? "fresh" : sourcesWithPrices ? "partial" : "unavailable",
    sources: sourceResults,
    ...seatMap,
  };
}

export function crawlPriceComparison(event: TrackedEvent): Promise<CrawledPriceSnapshot> {
  const cacheKey = `exact-paths-v1:${event.id}:${event.startsAt ?? "tba"}:${event.attractions?.join("|") ?? ""}`;
  const now = Date.now();
  const cached = snapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = createSnapshot(event).catch((error) => {
    snapshotCache.delete(cacheKey);
    throw error;
  });
  snapshotCache.set(cacheKey, { expiresAt: now + Number(process.env.PRICE_CACHE_TTL_MS ?? 60_000), value });
  return value;
}
