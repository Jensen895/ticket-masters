"use client";

import type { CrawledPriceSnapshot, Marketplace, MarketplaceCrawlResult } from "@ticket-hub/contracts";
import { ExternalLink, LocateFixed, Minus, Plus } from "lucide-react";
import { KeyboardEvent, PointerEvent, useMemo, useRef, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.4;

const sourceShortNames: Record<Marketplace, string> = {
  ticketmaster: "TM",
  seatgeek: "SG",
  stubhub: "SH",
  tickpick: "TP",
  gametime: "GT",
  "vivid-seats": "VS",
};

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function normalizeSection(value: string) {
  return value
    .toUpperCase()
    .replace(/\b(?:SECTION|SEC|LEVEL|ZONE|LOWER|UPPER)\b/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+/, "") || "ANY";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

function minimumPrice(source: MarketplaceCrawlResult) {
  return source.offers.length ? Math.min(...source.offers.map((offer) => offer.priceCents)) : undefined;
}

function sourceStatus(source: MarketplaceCrawlResult) {
  if (source.status === "blocked") return "Blocked";
  if (source.status === "not-found") return "Not listed";
  if (source.status === "unavailable") return "No public price";
  if (source.status === "error") return "Unavailable";
  return "—";
}

export function SeatMapViewer({
  imageUrl,
  eventName,
  ticketmasterUrl,
  prices,
  loadingPrices = false,
}: {
  imageUrl?: string;
  eventName: string;
  ticketmasterUrl: string;
  prices?: CrawledPriceSnapshot;
  loadingPrices?: boolean;
}) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const sectionPrices = useMemo(() => {
    const positions = new Map((prices?.sectionPositions ?? []).map((position) => [normalizeSection(position.section), position]));
    const groups = new Map<string, {
      section: string;
      xPercent: number;
      yPercent: number;
      prices: Map<Marketplace, { cents: number; color: string }>;
    }>();
    for (const source of prices?.sources ?? []) {
      for (const offer of source.offers) {
        const key = normalizeSection(offer.section);
        const position = positions.get(key);
        if (!position || key === "ANY") continue;
        const group = groups.get(key) ?? { ...position, prices: new Map() };
        const previous = group.prices.get(source.marketplace);
        if (!previous || offer.priceCents < previous.cents) {
          group.prices.set(source.marketplace, { cents: offer.priceCents, color: source.color });
        }
        groups.set(key, group);
      }
    }
    return [...groups.values()];
  }, [prices]);

  function setZoomLevel(next: number) {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (clamped === MIN_ZOOM) setOffset({ x: 0, y: 0 });
  }

  function reset() {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageUrl || zoom === MIN_ZOOM) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.current.x;
    const deltaY = event.clientY - drag.current.y;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") setZoomLevel(zoom + ZOOM_STEP);
    if (event.key === "-") setZoomLevel(zoom - ZOOM_STEP);
    if (event.key === "0" || event.key === "Escape") reset();
  }

  return (
    <div className="seatMapViewer">
      <div className="seatMapControls" aria-label="Seat map zoom controls">
        <button type="button" onClick={() => setZoomLevel(zoom + ZOOM_STEP)} disabled={!imageUrl || zoom >= MAX_ZOOM} aria-label="Zoom in"><Plus size={19} /></button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoomLevel(zoom - ZOOM_STEP)} disabled={!imageUrl || zoom <= MIN_ZOOM} aria-label="Zoom out"><Minus size={19} /></button>
        <button type="button" onClick={reset} disabled={!imageUrl || (zoom === MIN_ZOOM && offset.x === 0 && offset.y === 0)} aria-label="Reset seat map"><LocateFixed size={18} /></button>
      </div>
      <div
        className={`seatMapCanvas ${zoom > MIN_ZOOM ? "canPan" : ""}`}
        tabIndex={0}
        role="img"
        aria-label={imageUrl ? `Ticketmaster seat map and marketplace prices for ${eventName}` : `Seat map unavailable for ${eventName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={onKeyDown}
      >
        {imageUrl ? (
          <div className="seatMapTransform" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
            <img src={imageUrl} alt={`Ticketmaster venue seat map for ${eventName}`} draggable={false} />
            <div className="sectionPriceLayer" aria-label="Prices by seating section">
              {sectionPrices.map((group) => (
                <div
                  className="sectionPriceMarker"
                  key={normalizeSection(group.section)}
                  style={{ left: `${group.xPercent}%`, top: `${group.yPercent}%` }}
                >
                  <strong>{group.section}</strong>
                  {[...group.prices].map(([marketplace, value]) => (
                    <span key={marketplace}><i style={{ background: value.color }} />{sourceShortNames[marketplace]} {money(value.cents)}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="seatMapUnavailable">
            <LocateFixed size={38} />
            <h3>Seat map not available</h3>
            <p>Ticketmaster has not published a static seat map for this event.</p>
            <a href={ticketmasterUrl} target="_blank" rel="noreferrer">Check Ticketmaster <ExternalLink size={15} /></a>
          </div>
        )}

        {imageUrl && (
          <div className="mapMarketplaceStrip" aria-label="Marketplace price summary">
            {loadingPrices && !prices ? (
              <span className="priceCrawlLoading"><i /> Crawling six marketplaces…</span>
            ) : (prices?.sources ?? []).map((source) => {
              const minimum = minimumPrice(source);
              return (
                <div className={`mapSourcePrice status-${source.status}`} key={source.marketplace}>
                  <span><i style={{ background: source.color }} />{source.label}</span>
                  <strong>{minimum ? money(minimum) : sourceStatus(source)}</strong>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="seatMapFooter">
        <span><i /> Section markers show each site’s lowest listing</span>
        <span>Prices are read-only · {prices ? `checked ${new Date(prices.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "waiting for prices"}</span>
      </div>
      <p className="seatMapDisclaimer">The layout and section coordinates come from Ticketmaster. Prices are read from public marketplace pages; “—” means a site blocked the crawl, had no confident event match, or exposed no public price.</p>
    </div>
  );
}
