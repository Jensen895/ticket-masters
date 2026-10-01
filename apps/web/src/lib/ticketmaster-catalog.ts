import "server-only";

import type { TrackedEvent } from "@ticket-hub/contracts";
import { fetchPublicPage } from "./crawlers/http";
import {
  eventsWithinRadius,
  mapTicketmasterSearchData,
  mapTicketmasterSearchPage,
} from "./ticketmaster";

const SOURCE_PAGE_SIZE = 50;
const DEFAULT_MAX_SOURCE_PAGES = 20;

export async function fetchNearbyTicketmasterEvents(
  query: string,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  maxPages = DEFAULT_MAX_SOURCE_PAGES,
) {
  const events: TrackedEvent[] = [];
  const seen = new Set<string>();
  let page = 0;
  let pageCount = 1;

  while (page < pageCount && page < maxPages) {
    const url = new URL("https://www.ticketmaster.com/api/search/events");
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("latitude", latitude.toFixed(3));
    url.searchParams.set("longitude", longitude.toFixed(3));
    url.searchParams.set("distance", String(radiusMiles));
    url.searchParams.set("distanceUnit", "miles");
    url.searchParams.set("sort", "date");
    url.searchParams.set("region", "200");
    url.searchParams.set("size", String(SOURCE_PAGE_SIZE));
    url.searchParams.set("page", String(page));

    const body = await fetchPublicPage(url.toString(), {
      Accept: "application/json",
      "x-tmlangcode": "en-us",
      "x-tmregion": "200",
      "X-TMPlatform": "global",
      "X-TMClient-App": "marketplace_fe",
    });
    const search = mapTicketmasterSearchData(JSON.parse(body) as unknown, page, SOURCE_PAGE_SIZE);
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

  return events;
}

export async function fetchTicketmasterSearchEvents(
  query: string,
  maxPages = DEFAULT_MAX_SOURCE_PAGES,
) {
  const events: TrackedEvent[] = [];
  const seen = new Set<string>();
  let sourcePage = 0;
  let pageCount = 1;

  while (sourcePage < pageCount && sourcePage < maxPages) {
    const url = new URL("https://www.ticketmaster.com/search");
    if (query) url.searchParams.set("q", query);
    url.searchParams.set("sort", "date");
    if (sourcePage) url.searchParams.set("page", String(sourcePage));

    const html = await fetchPublicPage(url.toString());
    const search = mapTicketmasterSearchPage(html, sourcePage);
    pageCount = search.pageCount;
    for (const event of search.items) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
    sourcePage += 1;
  }

  return events;
}
