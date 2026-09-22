import type { TicketmasterApiSearchPayload } from "@/lib/ticketmaster";
import { mapTicketmasterSearch } from "@/lib/ticketmaster";
import { NextResponse } from "next/server";

const DISCOVERY_API = "https://app.ticketmaster.com/discovery/v2";

export async function GET(request: Request) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TICKETMASTER_NOT_CONFIGURED", message: "Add TICKETMASTER_API_KEY to .env.local to search Ticketmaster." },
      { status: 503 },
    );
  }

  const input = new URL(request.url).searchParams;
  const page = Math.max(0, Number.parseInt(input.get("page") ?? "0", 10) || 0);
  const url = new URL(`${DISCOVERY_API}/events.json`);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("size", "24");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("locale", "*");

  const query = input.get("q")?.trim();
  const city = input.get("city")?.trim();
  if (query) url.searchParams.set("keyword", query);
  if (city) url.searchParams.set("city", city);

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      const message = response.status === 429
        ? "Ticketmaster's search limit was reached. Please try again shortly."
        : "Ticketmaster search is temporarily unavailable.";
      return NextResponse.json({ error: "TICKETMASTER_SEARCH_FAILED", message }, { status: response.status });
    }
    const payload = await response.json() as TicketmasterApiSearchPayload;
    return NextResponse.json(mapTicketmasterSearch(payload));
  } catch {
    return NextResponse.json(
      { error: "TICKETMASTER_UNREACHABLE", message: "Could not reach Ticketmaster. Please try again." },
      { status: 502 },
    );
  }
}
