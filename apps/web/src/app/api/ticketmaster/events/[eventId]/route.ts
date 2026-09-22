import type { TicketmasterApiEvent } from "@/lib/ticketmaster";
import { mapTicketmasterEventDetail } from "@/lib/ticketmaster";
import { NextResponse } from "next/server";

const DISCOVERY_API = "https://app.ticketmaster.com/discovery/v2";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TICKETMASTER_NOT_CONFIGURED", message: "Add TICKETMASTER_API_KEY to .env.local to load event details." },
      { status: 503 },
    );
  }

  const { eventId } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    return NextResponse.json({ error: "INVALID_EVENT_ID", message: "Invalid Ticketmaster event ID." }, { status: 400 });
  }

  const url = new URL(`${DISCOVERY_API}/events/${encodeURIComponent(eventId)}.json`);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("locale", "*");

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND", message: "This event is no longer available from Ticketmaster." }, { status: 404 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "TICKETMASTER_EVENT_FAILED", message: "Ticketmaster event details are temporarily unavailable." }, { status: response.status });
    }
    const event = await response.json() as TicketmasterApiEvent;
    const mapped = mapTicketmasterEventDetail(event);
    if (!mapped) {
      return NextResponse.json({ error: "INVALID_EVENT", message: "Ticketmaster returned an incomplete event." }, { status: 502 });
    }
    return NextResponse.json(mapped);
  } catch {
    return NextResponse.json({ error: "TICKETMASTER_UNREACHABLE", message: "Could not reach Ticketmaster. Please try again." }, { status: 502 });
  }
}
