import { cityFromReverseGeocode } from "@/lib/location";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coordinate(value: string | null, minimum: number, maximum: number) {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const latitude = coordinate(input.get("latitude"), -90, 90);
  const longitude = coordinate(input.get("longitude"), -180, 180);
  if (latitude === undefined || longitude === undefined) {
    return NextResponse.json(
      { error: "INVALID_COORDINATES", message: "Valid latitude and longitude are required." },
      { status: 400 },
    );
  }

  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  // City resolution does not require sending the browser's full-precision position.
  url.searchParams.set("latitude", latitude.toFixed(3));
  url.searchParams.set("longitude", longitude.toFixed(3));
  url.searchParams.set("localityLanguage", "en");

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`The location provider returned HTTP ${response.status}.`);
    const city = cityFromReverseGeocode(await response.json());
    if (!city) throw new Error("The location provider did not return a city.");
    return NextResponse.json({
      city,
      latitude: Number(latitude.toFixed(3)),
      longitude: Number(longitude.toFixed(3)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "REVERSE_GEOCODE_FAILED",
        message: error instanceof Error ? error.message : "The city could not be detected.",
      },
      { status: 502 },
    );
  }
}
