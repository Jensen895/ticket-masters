import { fetchPublicPage } from "@/lib/crawlers/http";
import { asTicketmasterDetail, mapTicketmasterSearchPage } from "@/lib/ticketmaster";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(eventId)) {
    return NextResponse.json({ error: "INVALID_EVENT_ID", message: "Invalid Ticketmaster event ID." }, { status: 400 });
  }
  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name || name.length > 300) {
    return NextResponse.json({ error: "EVENT_NAME_REQUIRED", message: "The saved event name is required to refresh this event." }, { status: 400 });
  }

  const url = new URL("https://www.ticketmaster.com/search");
  url.searchParams.set("q", name);
  try {
    const search = mapTicketmasterSearchPage(await fetchPublicPage(url.toString()));
    const event = search.items.find((item) => item.id === eventId);
    if (!event) {
      return NextResponse.json({ error: "EVENT_NOT_FOUND", message: "This event was not found in Ticketmaster’s public search page." }, { status: 404 });
    }
    return NextResponse.json(asTicketmasterDetail(event));
  } catch (error) {
    return NextResponse.json({
      error: "TICKETMASTER_CRAWL_FAILED",
      message: error instanceof Error ? `Ticketmaster event details could not be read: ${error.message}` : "Ticketmaster event details could not be read.",
    }, { status: 502 });
  }
}
