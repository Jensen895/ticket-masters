import {
  buildTicketmasterSearchResponse,
} from "@/lib/ticketmaster";
import {
  fetchNearbyTicketmasterEvents,
  fetchTicketmasterSearchEvents,
} from "@/lib/ticketmaster-catalog";
import type { EventClassification } from "@ticket-hub/contracts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULTS_PAGE_SIZE = 10;
const PREFERRED_RADIUS_MILES = 100;
const classifications = new Set<EventClassification>([
  "Music",
  "Sports",
  "Arts & Theater",
  "Comedy",
  "Family",
  "Other",
]);

function coordinate(value: string | null, minimum: number, maximum: number) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function selectedClassification(value: string | null) {
  return value && classifications.has(value as EventClassification)
    ? value as EventClassification
    : undefined;
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const page = Math.max(0, Number.parseInt(input.get("page") ?? "0", 10) || 0);
  const eventQuery = input.get("q")?.trim() ?? "";
  const city = input.get("city")?.trim();
  const latitude = coordinate(input.get("latitude"), -90, 90);
  const longitude = coordinate(input.get("longitude"), -180, 180);
  const radiusMiles = coordinate(input.get("radius"), 1, 500) ?? 100;
  const classification = selectedClassification(input.get("classification"));

  if (latitude !== undefined && longitude !== undefined) {
    try {
      const center = { latitude, longitude };
      const events = await fetchNearbyTicketmasterEvents(eventQuery, latitude, longitude, radiusMiles);
      return NextResponse.json(buildTicketmasterSearchResponse(events, {
        page,
        pageSize: RESULTS_PAGE_SIZE,
        classification,
        center,
        preferredRadiusMiles: PREFERRED_RADIUS_MILES,
      }));
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
  try {
    const events = await fetchTicketmasterSearchEvents(query);
    return NextResponse.json(buildTicketmasterSearchResponse(events, {
      page,
      pageSize: RESULTS_PAGE_SIZE,
      classification,
    }));
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
