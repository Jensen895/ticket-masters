import { fetchPublicPage } from "@/lib/crawlers/http";
import { mapTicketmasterSearchPage } from "@/lib/ticketmaster";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const page = Math.max(0, Number.parseInt(input.get("page") ?? "0", 10) || 0);
  const query = [input.get("q")?.trim(), input.get("city")?.trim()].filter(Boolean).join(" ");
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
