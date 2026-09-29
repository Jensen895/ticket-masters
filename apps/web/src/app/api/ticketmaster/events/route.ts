import { fetchPublicPage } from "@/lib/crawlers/http";
import {
  eventsWithinRadius,
  mapTicketmasterSearchData,
  mapTicketmasterSearchPage,
} from "@/lib/ticketmaster";
import type { TicketmasterSearchResponse, TrackedEvent } from "@ticket-hub/contracts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_PAGE_SIZE = 50;
const MAX_VICINITY_PAGES = 20;

function coordinate(value: string | null, minimum: number, maximum: number) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

async function fetchNearbyEvents(query: string, latitude: number, longitude: number, radiusMiles: number) {
  const events: TrackedEvent[] = [];
  const seen = new Set<string>();
  let page = 0;
  let pageCount = 1;

  while (page < pageCount && page < MAX_VICINITY_PAGES) {
    const url = new URL("https://www.ticketmaster.com/api/search/events");
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("latitude", latitude.toFixed(3));
    url.searchParams.set("longitude", longitude.toFixed(3));
    url.searchParams.set("distance", String(radiusMiles));
    url.searchParams.set("distanceUnit", "miles");
    url.searchParams.set("sort", "relevance");
    url.searchParams.set("region", "200");
    url.searchParams.set("size", String(SEARCH_PAGE_SIZE));
    url.searchParams.set("page", String(page));

    const body = await fetchPublicPage(url.toString(), {
      Accept: "application/json",
      "x-tmlangcode": "en-us",
      "x-tmregion": "200",
      "X-TMPlatform": "global",
      "X-TMClient-App": "marketplace_fe",
    });
    const search = mapTicketmasterSearchData(JSON.parse(body) as unknown, page, SEARCH_PAGE_SIZE);
    pageCount = search.pageCount;
    const nearby = eventsWithinRadius(search.items, { latitude, longitude }, radiusMiles);
    for (const event of nearby) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }

    // Ticketmaster location-ranks results. Once a full page has no nearby
    // events, subsequent relevance pages are outside the requested vicinity.
    if (nearby.length === 0) break;
    page += 1;
  }

  return { items: events, total: events.length, page: 0, pageCount: 1 } satisfies TicketmasterSearchResponse;
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const page = Math.max(0, Number.parseInt(input.get("page") ?? "0", 10) || 0);
  const eventQuery = input.get("q")?.trim() ?? "";
  const city = input.get("city")?.trim();
  const latitude = coordinate(input.get("latitude"), -90, 90);
  const longitude = coordinate(input.get("longitude"), -180, 180);
  const radiusMiles = coordinate(input.get("radius"), 1, 500) ?? 100;

  if (latitude !== undefined && longitude !== undefined) {
    try {
      return NextResponse.json(await fetchNearbyEvents(eventQuery, latitude, longitude, radiusMiles));
    } catch (error) {
      return NextResponse.json(
        {
          error: "TICKETMASTER_CRAWL_FAILED",
          message: error instanceof Error
            ? `Ticketmaster search could not be read: ${error.message}`
            : "Ticketmaster search could not be read.",
        },
        { status: 502 },
      );
    }
  }

  const query = [eventQuery, city].filter(Boolean).join(" ");
  const url = new URL("https://www.ticketmaster.com/search");
  if (query) url.searchParams.set("q", query);
  if (page) url.searchParams.set("page", String(page));

  try {
    const html = await fetchPublicPage(url.toString());
    return NextResponse.json(mapTicketmasterSearchPage(html, page));
  } catch (error) {
    return NextResponse.json(
      {
        error: "TICKETMASTER_CRAWL_FAILED",
        message: error instanceof Error
          ? `Ticketmaster search could not be read: ${error.message}`
          : "Ticketmaster search could not be read.",
      },
      { status: 502 },
    );
  }
}
