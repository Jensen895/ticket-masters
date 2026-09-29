interface ReverseGeocodeAddress {
  city?: unknown;
  locality?: unknown;
}

/** Extract a safe city label from the public reverse-geocoding response. */
export function cityFromReverseGeocode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const address = value as ReverseGeocodeAddress;
  for (const candidate of [address.city, address.locality]) {
    if (typeof candidate !== "string") continue;
    const city = candidate.trim();
    if (city && city.length <= 120) return city;
  }
  return undefined;
}
