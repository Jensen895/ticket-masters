import "server-only";

import { ProxyAgent, fetch as undiciFetch } from "undici";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CACHE_MS = 60_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

interface CachedPage {
  expiresAt: number;
  value: Promise<string>;
}

const globalCache = globalThis as typeof globalThis & {
  __ticketMastersPageCache?: Map<string, CachedPage>;
};

const pageCache = globalCache.__ticketMastersPageCache ?? new Map<string, CachedPage>();
globalCache.__ticketMastersPageCache = pageCache;

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export class CrawlHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function crawlerUserAgent() {
  return process.env.CRAWLER_USER_AGENT?.trim()
    || "ticket-masters/0.1 (private personal event-price viewer)";
}

async function requestPage(url: string, extraHeaders: Record<string, string>): Promise<string> {
  const response = await undiciFetch(url, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": crawlerUserAgent(),
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(Number(process.env.CRAWL_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)),
    dispatcher: proxyDispatcher,
  });

  if (!response.ok) {
    throw new CrawlHttpError(`The site returned HTTP ${response.status}.`, response.status);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new CrawlHttpError("The page was larger than the crawler safety limit.");
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new CrawlHttpError("The page was larger than the crawler safety limit.");
  }
  return body;
}

/** Small in-process cache keeps a page load from repeatedly hitting seller sites. */
export function fetchPublicPage(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const now = Date.now();
  const cacheKey = JSON.stringify([url, extraHeaders]);
  const cached = pageCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = requestPage(url, extraHeaders).catch((error) => {
    pageCache.delete(cacheKey);
    throw error;
  });
  pageCache.set(cacheKey, {
    expiresAt: now + Number(process.env.CRAWL_CACHE_TTL_MS ?? DEFAULT_CACHE_MS),
    value,
  });

  if (pageCache.size > 200) {
    for (const [key, item] of pageCache) {
      if (item.expiresAt <= now) pageCache.delete(key);
    }
  }
  return value;
}
