import type {
  EventClassification,
  EventRecommendation,
  TicketmasterRecommendationsResponse,
  TrackedEvent,
} from "@ticket-hub/contracts";
import { NextResponse } from "next/server";
import { crawlLowestPrice } from "@/lib/crawlers/marketplaces";
import { extractJsonScripts, ticketmasterGenres } from "@/lib/crawlers/page-data";
import { fetchPublicPage } from "@/lib/crawlers/http";
import {
  buildRecommendationProfile,
  rankRecommendationCandidates,
  recommendationCenter,
  recommendationReason,
} from "@/lib/recommendations";
import {
  fetchNearbyTicketmasterEvents,
  fetchTicketmasterSearchEvents,
} from "@/lib/ticketmaster-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUGGESTION_LIMIT = 5;
const SUGGESTION_RADIUS_MILES = 100;
const CANDIDATE_SOURCE_PAGES = 3;
const MAX_SEED_GENRE_LOOKUPS = 20;
const MAX_GENRE_LOOKUPS = 40;
const classifications = new Set<EventClassification>([
  "Music",
  "Sports",
  "Arts & Theater",
  "Comedy",
  "Family",
  "Other",
]);

function safeTicketmasterUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "ticketmaster.com" || url.hostname.endsWith(".ticketmaster.com"))
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function trackedEvent(value: unknown): TrackedEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Partial<TrackedEvent>;
  const ticketmasterUrl = safeTicketmasterUrl(event.ticketmasterUrl);
  if (!event.id || !/^[a-zA-Z0-9_-]+$/.test(event.id)
    || typeof event.name !== "string" || !event.name || event.name.length > 300
    || !event.classification || !classifications.has(event.classification)
    || typeof event.dateLabel !== "string" || !event.dateLabel
    || typeof event.timeLabel !== "string" || !event.timeLabel || !ticketmasterUrl
    || !event.venue || typeof event.venue.name !== "string") return undefined;
  const latitude = typeof event.venue.latitude === "number" && Number.isFinite(event.venue.latitude)
    && event.venue.latitude >= -90 && event.venue.latitude <= 90 ? event.venue.latitude : undefined;
  const longitude = typeof event.venue.longitude === "number" && Number.isFinite(event.venue.longitude)
    && event.venue.longitude >= -180 && event.venue.longitude <= 180 ? event.venue.longitude : undefined;
  return {
    id: event.id,
    name: event.name,
    classification: event.classification,
    genre: typeof event.genre === "string" ? event.genre.slice(0, 100) : undefined,
    startsAt: typeof event.startsAt === "string" ? event.startsAt : undefined,
    dateLabel: event.dateLabel,
    timeLabel: event.timeLabel,
    venue: {
      name: event.venue.name,
      city: typeof event.venue.city === "string" ? event.venue.city : "",
      region: typeof event.venue.region === "string" ? event.venue.region : "",
      timezone: typeof event.venue.timezone === "string" ? event.venue.timezone : "",
      latitude,
      longitude,
    },
    ticketmasterUrl,
    attractions: event.attractions?.filter((name): name is string => typeof name === "string").slice(0, 10),
    attractionUrls: event.attractionUrls?.flatMap((url) => {
      const safe = safeTicketmasterUrl(url);
      return safe ? [safe] : [];
    }).slice(0, 10),
  };
}

function requestCoordinates(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const point = value as { latitude?: unknown; longitude?: unknown };
  return typeof point.latitude === "number" && point.latitude >= -90 && point.latitude <= 90
    && typeof point.longitude === "number" && point.longitude >= -180 && point.longitude <= 180
    ? { latitude: point.latitude, longitude: point.longitude }
    : undefined;
}

async function eventGenre(
  event: TrackedEvent,
  cache: Map<string, Promise<string | undefined>>,
  legacyEventCache: Map<string, Promise<TrackedEvent | undefined>>,
) {
  if (event.genre?.trim()) return event.genre.trim();
  let attractionUrls = event.attractionUrls ?? [];
  // Events saved by older app versions predate attractionUrls. Recover the
  // matching artist page once so those collections still get genre matches.
  if (!attractionUrls.length) {
    let pendingEvent = legacyEventCache.get(event.id);
    if (!pendingEvent) {
      pendingEvent = fetchTicketmasterSearchEvents(event.attractions?.[0] ?? event.name, 1)
        .then((matches) => matches.find((match) => match.id === event.id))
        .catch(() => undefined);
      legacyEventCache.set(event.id, pendingEvent);
    }
    attractionUrls = (await pendingEvent)?.attractionUrls ?? [];
  }
  for (const candidateUrl of attractionUrls) {
    const url = safeTicketmasterUrl(candidateUrl);
    if (!url) continue;
    let pending = cache.get(url);
    if (!pending) {
      pending = fetchPublicPage(url)
        .then((html) => ticketmasterGenres(extractJsonScripts(html))[0])
        .catch(() => undefined);
      cache.set(url, pending);
    }
    const genre = await pending;
    if (genre) return genre;
  }
  return undefined;
}

async function enrichGenres(events: TrackedEvent[], maximum: number) {
  const cache = new Map<string, Promise<string | undefined>>();
  const legacyEventCache = new Map<string, Promise<TrackedEvent | undefined>>();
  const enriched: TrackedEvent[] = [];
  for (let index = 0; index < Math.min(events.length, maximum); index += 10) {
    const batch = events.slice(index, Math.min(index + 10, maximum));
    enriched.push(...await Promise.all(batch.map(async (event) => ({
      ...event,
      genre: await eventGenre(event, cache, legacyEventCache),
    }))));
  }
  return [...enriched, ...events.slice(maximum)];
}

function dominantCity(events: TrackedEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.venue.city) counts.set(event.venue.city, (counts.get(event.venue.city) ?? 0) + 1);
  }
  return [...counts].sort((first, second) => second[1] - first[1])[0]?.[0];
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", message: "A JSON request body is required." }, { status: 400 });
  }
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawEvents = Array.isArray(record.events) ? record.events.slice(0, 100) : [];
  const events = rawEvents.flatMap((value) => {
    const parsed = trackedEvent(value);
    return parsed ? [parsed] : [];
  });
  if (!events.length) {
    const empty: TicketmasterRecommendationsResponse = { items: [], preferredGenres: [] };
    return NextResponse.json(empty);
  }

  try {
    const enrichedTrackedEvents = await enrichGenres(events, MAX_SEED_GENRE_LOOKUPS);
    const profile = buildRecommendationProfile(enrichedTrackedEvents);
    const center = requestCoordinates(record.coordinates) ?? recommendationCenter(events);
    const preferredClassifications = new Set(profile.classifications.slice(0, 3).map(({ name }) => name));
    const catalog = center
      ? await fetchNearbyTicketmasterEvents("", center.latitude, center.longitude, SUGGESTION_RADIUS_MILES, CANDIDATE_SOURCE_PAGES)
      : await fetchTicketmasterSearchEvents(
        [profile.genres[0]?.name, dominantCity(events)].filter(Boolean).join(" "),
        CANDIDATE_SOURCE_PAGES,
      );
    const eligibleCatalog = catalog.filter((event) => preferredClassifications.has(event.classification));
    const candidates = profile.genres.length
      ? await enrichGenres(eligibleCatalog, MAX_GENRE_LOOKUPS)
      : eligibleCatalog;
    const ranked = rankRecommendationCandidates(candidates, events, profile, {
      center,
      limit: SUGGESTION_LIMIT,
    });
    const items = await Promise.all(ranked.map(async (event): Promise<EventRecommendation> => {
      const lowest = await crawlLowestPrice(event).catch(() => undefined);
      return {
        event,
        reason: recommendationReason(event, profile),
        lowestPriceCents: lowest?.priceCents,
        lowestPriceMarketplace: lowest?.marketplace,
      };
    }));
    const response: TicketmasterRecommendationsResponse = {
      items,
      preferredGenres: profile.genres.slice(0, 3).map(({ name }) => name),
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({
      error: "RECOMMENDATIONS_FAILED",
      message: error instanceof Error
        ? `Suggestions could not be loaded: ${error.message}`
        : "Suggestions could not be loaded.",
    }, { status: 502 });
  }
}
