interface SchemaEvent {
  name: string;
  startDate?: string;
  venue?: string;
  url?: string;
  lowPrice?: number;
}

const eventTypes = new Set(["Event", "SportsEvent", "MusicEvent", "TheaterEvent", "ComedyEvent"]);
const ignoredWords = new Set([
  "a", "an", "and", "at", "in", "live", "of", "the", "tickets", "tour", "vs", "versus",
]);

export function walkJson(value: unknown, visitor: (record: Record<string, unknown>) => void, depth = 0): void {
  if (!value || typeof value !== "object" || depth > 14) return;
  if (Array.isArray(value)) {
    for (const child of value) walkJson(child, visitor, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  visitor(record);
  for (const child of Object.values(record)) walkJson(child, visitor, depth + 1);
}

export function extractJsonScripts(html: string): unknown[] {
  const values: unknown[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    const body = match[2]?.trim();
    if (!body || !/(?:application\/(?:ld\+json|json)|id=["']__NEXT_DATA__["'])/i.test(attributes)) continue;
    try {
      values.push(JSON.parse(body) as unknown);
    } catch {
      // A malformed analytics script should not make the entire source fail.
    }
  }

  const assignedMarker = "window.__data=";
  const assignedAt = html.indexOf(assignedMarker);
  if (assignedAt >= 0) {
    const start = html.indexOf("{", assignedAt + assignedMarker.length);
    let end = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index >= 0 && index < html.length; index += 1) {
      const character = html[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (character === "{") depth += 1;
      if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }
    if (start >= 0 && end > start) {
      try {
        values.push(JSON.parse(html.slice(start, end).replace(/\bundefined\b/g, "null")) as unknown);
      } catch {
        // Some sites change this payload frequently; JSON-LD remains a fallback.
      }
    }
  }
  return values;
}

function schemaType(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [String(value ?? "")];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function schemaEvents(payloads: unknown[]): SchemaEvent[] {
  const events: SchemaEvent[] = [];
  for (const payload of payloads) {
    walkJson(payload, (record) => {
      const isSchemaEvent = schemaType(record["@type"]).some((type) => eventTypes.has(type));
      const webPath = text(record.webPath);
      const isVividProduction = Boolean(webPath?.includes("/production/") && record.venue && record.id);
      if (!isSchemaEvent && !isVividProduction) return;
      const location = record.location && typeof record.location === "object"
        ? record.location as Record<string, unknown>
        : record.venue && typeof record.venue === "object"
          ? record.venue as Record<string, unknown>
          : undefined;
      const offers = record.offers && typeof record.offers === "object"
        ? record.offers as Record<string, unknown>
        : undefined;
      const name = text(record.name);
      if (!name) return;
      const showAllInPrice = record.showAip === true;
      events.push({
        name,
        startDate: text(record.startDate) ?? text(record.utcDate) ?? text(record.localDate)?.replace(/\[[^\]]+\]$/, ""),
        venue: text(location?.name),
        url: text(record.url) ?? text(offers?.url) ?? webPath ?? text(record.organicUrl),
        lowPrice: (showAllInPrice ? number(record.minAipPrice) : undefined)
          ?? number(offers?.lowPrice)
          ?? number(offers?.price)
          ?? number(record.minPrice),
      });
    });
  }
  return events;
}

function tokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((word) => word.length > 1 && !ignoredWords.has(word)));
}

function overlap(left: string, right: string) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let matches = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) matches += 1;
  return matches / Math.max(leftTokens.size, rightTokens.size);
}

export function bestMatchingEvent(
  events: SchemaEvent[],
  expected: { name: string; startsAt?: string; venue: string },
): SchemaEvent | undefined {
  let best: { event: SchemaEvent; score: number } | undefined;
  for (const event of events) {
    let score = overlap(expected.name, event.name) * 8;
    if (/\bparking\b/i.test(event.name) !== /\bparking\b/i.test(expected.name)) score -= 8;
    if (event.venue) score += overlap(expected.venue, event.venue) * 3;
    const expectedDate = expected.startsAt ? Date.parse(expected.startsAt) : Number.NaN;
    const candidateDate = event.startDate ? Date.parse(event.startDate) : Number.NaN;
    if (Number.isFinite(expectedDate) && Number.isFinite(candidateDate)) {
      const hours = Math.abs(expectedDate - candidateDate) / 3_600_000;
      score += hours <= 30 ? 5 : hours <= 54 ? 1 : -5;
    }
    const hasPublicPrice = event.lowPrice && event.url ? 0.25 : 0;
    score += hasPublicPrice;
    if (!best || score > best.score) best = { event, score };
  }
  return best && best.score >= 5 ? best.event : undefined;
}

export function normalizeSection(value: string) {
  return value
    .toUpperCase()
    .replace(/\b(?:SECTION|SEC|LEVEL|ZONE|LOWER|UPPER)\b/g, "")
    .replace(/[^A-Z0-9]/g, "") || "ANY";
}

export function safeUrlForHost(value: string | undefined, domains: string[]) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    if (!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
