import type { TrackedEvent } from "@ticket-hub/contracts";
import { crawlPriceComparison } from "@/lib/crawlers/marketplaces";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTrackedEvent(value: unknown): value is TrackedEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TrackedEvent>;
  return typeof event.id === "string"
    && /^[a-zA-Z0-9_-]+$/.test(event.id)
    && typeof event.name === "string"
    && event.name.length > 0
    && event.name.length <= 300
    && typeof event.ticketmasterUrl === "string"
    && event.ticketmasterUrl.startsWith("https://")
    && Boolean(event.venue && typeof event.venue.name === "string");
}

export async function POST(request: Request) {
  let event: unknown;
  try {
    event = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", message: "A JSON event body is required." }, { status: 400 });
  }
  if (!isTrackedEvent(event)) {
    return NextResponse.json({ error: "INVALID_EVENT", message: "The event data is incomplete or invalid." }, { status: 400 });
  }
  try {
    return NextResponse.json(await crawlPriceComparison(event));
  } catch (error) {
    return NextResponse.json({
      error: "PRICE_CRAWL_FAILED",
      message: error instanceof Error ? error.message : "Marketplace prices could not be crawled.",
    }, { status: 502 });
  }
}
