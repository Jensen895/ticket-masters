"use client";

import type {
  CrawledPriceSnapshot,
  MarketplaceCrawlResult,
  SeatMapSeatPosition,
  SeatMapSectionPosition,
  TicketOffer,
} from "@ticket-hub/contracts";
import { Armchair, ExternalLink, LocateFixed, Minus, Plus, X } from "lucide-react";
import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  WheelEvent,
  useMemo,
  useRef,
  useState,
} from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 7.5;
const SECTION_ZOOM = 4.25;
const DETAIL_ZOOM = 2;
const ZOOM_STEP = 0.45;

type RecommendationMode = "lowest" | "best";
type PricedSeat = { position: SeatMapSeatPosition; offer: TicketOffer; offers: TicketOffer[] };
type SectionWithPrice = SeatMapSectionPosition & { offer?: TicketOffer; offers: TicketOffer[] };
type PriceListItem =
  | { kind: "seat"; key: string; seat: PricedSeat }
  | { kind: "offer"; key: string; offer: TicketOffer };

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function normalizeSection(value: string) {
  return value
    .toUpperCase()
    .replace(/\b(?:SECTION|SEC|LEVEL|ZONE|LOWER|UPPER)\b/g, "")
    .replace(/[^A-Z0-9]/g, "") || "ANY";
}

function normalizePlace(value: string) {
  return value.toUpperCase().replace(/\b(?:ROW|SEAT)\b/g, "").replace(/[^A-Z0-9]/g, "").replace(/^0+/, "") || "—";
}

function seatKey(section: string, row: string, seat: string) {
  return `${normalizeSection(section)}:${normalizePlace(row)}:${normalizePlace(seat)}`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

function cheaper(left: TicketOffer | undefined, right: TicketOffer) {
  if (!left || right.priceCents < left.priceCents) return right;
  if (right.priceCents === left.priceCents && right.feesIncluded && !left.feesIncluded) return right;
  return left;
}

function isExactSeatOffer(offer: TicketOffer) {
  const seat = normalizePlace(offer.seat ?? "");
  return offer.row !== "—" && !["—", "ANY", "GA", "NA", "TBA", "UNKNOWN"].includes(seat);
}

function sourceSummary(source: MarketplaceCrawlResult) {
  if (source.status === "fresh" && source.offers.length) {
    const minimum = source.offers.reduce((lowest, offer) => Math.min(lowest, offer.priceCents), Number.POSITIVE_INFINITY);
    const exactSeats = new Set(source.offers.filter(isExactSeatOffer)
      .map((offer) => seatKey(offer.section, offer.row, offer.seat!))).size;
    const mappedListings = source.offers.filter((offer) => normalizeSection(offer.section) !== "ANY").length;
    return {
      price: `From ${money(minimum)}`,
      coverage: exactSeats
        ? `${exactSeats.toLocaleString()} exact seat${exactSeats === 1 ? "" : "s"}`
        : mappedListings
          ? `${mappedListings.toLocaleString()} section/row price${mappedListings === 1 ? "" : "s"}`
          : "Event minimum only",
    };
  }
  return { price: availabilityLabel(source), coverage: source.message };
}

function sectionDistance(section: SeatMapSectionPosition) {
  return Math.hypot(section.xPercent - 50, section.yPercent - 50);
}

function seatDistance(seat: SeatMapSeatPosition) {
  return Math.hypot(seat.xPercent - 50, seat.yPercent - 50);
}

function seatLabelCompare(left: PricedSeat, right: PricedSeat) {
  return left.position.section.localeCompare(right.position.section, undefined, { numeric: true })
    || left.position.row.localeCompare(right.position.row, undefined, { numeric: true })
    || left.position.seat.localeCompare(right.position.seat, undefined, { numeric: true });
}

function zoomForSection(section: SeatMapSectionPosition) {
  if (!section.outline?.length) return SECTION_ZOOM;
  const xValues = section.outline.map((point) => point.xPercent);
  const yValues = section.outline.map((point) => point.yPercent);
  const sectionSpan = Math.max(
    Math.max(...xValues) - Math.min(...xValues),
    Math.max(...yValues) - Math.min(...yValues),
    1,
  );
  return clampZoom(Math.max(SECTION_ZOOM, 58 / sectionSpan));
}

function availabilityLabel(source: MarketplaceCrawlResult) {
  if (source.status === "fresh" && source.offers.length) return "Available";
  if (source.status === "not-found") return "Not listed";
  return "Not available";
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
  const [mode, setMode] = useState<RecommendationMode>("lowest");
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>();
  const [selectedSeatId, setSelectedSeatId] = useState<string>();
  const map = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const mapData = useMemo(() => {
    const allOffers = (prices?.sources ?? []).flatMap((source) => source.offers);
    const positions = new Map((prices?.sectionPositions ?? []).map((position) => [normalizeSection(position.section), position]));
    const lowestBySection = new Map<string, TicketOffer>();
    const lowestBySeat = new Map<string, TicketOffer>();
    const offersBySectionSource = new Map<string, Map<TicketOffer["marketplace"], TicketOffer>>();
    const offersBySeatSource = new Map<string, Map<TicketOffer["marketplace"], TicketOffer>>();

    for (const offer of allOffers) {
      const sectionKey = normalizeSection(offer.section);
      if (sectionKey === "ANY" || !positions.has(sectionKey)) continue;
      lowestBySection.set(sectionKey, cheaper(lowestBySection.get(sectionKey), offer));
      const sectionSources = offersBySectionSource.get(sectionKey) ?? new Map();
      sectionSources.set(offer.marketplace, cheaper(sectionSources.get(offer.marketplace), offer));
      offersBySectionSource.set(sectionKey, sectionSources);
      if (isExactSeatOffer(offer)) {
        const key = seatKey(offer.section, offer.row, offer.seat!);
        lowestBySeat.set(key, cheaper(lowestBySeat.get(key), offer));
        const seatSources = offersBySeatSource.get(key) ?? new Map();
        seatSources.set(offer.marketplace, cheaper(seatSources.get(offer.marketplace), offer));
        offersBySeatSource.set(key, seatSources);
      }
    }

    const sections: SectionWithPrice[] = [...positions.entries()].map(([key, position]) => ({
      ...position,
      offer: lowestBySection.get(key),
      offers: [...(offersBySectionSource.get(key)?.values() ?? [])].sort((left, right) => left.priceCents - right.priceCents),
    }));
    const pricedSeats: PricedSeat[] = (prices?.seatPositions ?? []).flatMap((position) => {
      const key = seatKey(position.section, position.row, position.seat);
      const offer = lowestBySeat.get(key);
      const offers = [...(offersBySeatSource.get(key)?.values() ?? [])].sort((left, right) => left.priceCents - right.priceCents);
      return offer ? [{ position, offer, offers }] : [];
    });

    const sourceColors = new Map((prices?.sources ?? []).map((source) => [source.marketplace, source.color]));
    const mappedOfferIds = new Set(pricedSeats.flatMap((seat) => seat.offers.map((offer) => offer.id)));
    return {
      sections,
      pricedSeats,
      lowestBySeat,
      sourceColors,
      mappedOfferIds,
    };
  }, [prices]);

  const selectedSection = mapData.sections.find((section) => normalizeSection(section.section) === selectedSectionKey);
  const sectionSeats = useMemo(() => selectedSectionKey
    ? (prices?.seatPositions ?? []).filter((seat) => normalizeSection(seat.section) === selectedSectionKey)
    : [], [prices, selectedSectionKey]);
  const selectedSeat = mapData.pricedSeats.find((seat) => seat.position.id === selectedSeatId);

  const sortedSeats = useMemo(() => [...mapData.pricedSeats].sort((left, right) => mode === "lowest"
    ? left.offer.priceCents - right.offer.priceCents
      || seatDistance(left.position) - seatDistance(right.position)
      || seatLabelCompare(left, right)
    : seatDistance(left.position) - seatDistance(right.position)
      || left.offer.priceCents - right.offer.priceCents
      || seatLabelCompare(left, right)), [mapData.pricedSeats, mode]);

  const unmappedOffers = useMemo(() => (prices?.sources ?? [])
    .flatMap((source) => source.offers)
    .filter((offer) => !mapData.mappedOfferIds.has(offer.id))
    .sort((left, right) => mode === "lowest"
      ? left.priceCents - right.priceCents
        || left.section.localeCompare(right.section, undefined, { numeric: true })
      : left.section.localeCompare(right.section, undefined, { numeric: true })
        || left.row.localeCompare(right.row, undefined, { numeric: true })
        || left.priceCents - right.priceCents), [mapData.mappedOfferIds, mode, prices]);

  const priceListItems = useMemo<PriceListItem[]>(() => {
    const seatItems: PriceListItem[] = sortedSeats.map((seat) => ({ kind: "seat", key: `seat-${seat.position.id}`, seat }));
    const offerItems: PriceListItem[] = unmappedOffers.map((offer) => ({ kind: "offer", key: `offer-${offer.id}`, offer }));
    if (mode === "best") return [...seatItems, ...offerItems];
    return [...seatItems, ...offerItems].sort((left, right) => {
      const leftPrice = left.kind === "seat" ? left.seat.offer.priceCents : left.offer.priceCents;
      const rightPrice = right.kind === "seat" ? right.seat.offer.priceCents : right.offer.priceCents;
      return leftPrice - rightPrice;
    });
  }, [mode, sortedSeats, unmappedOffers]);

  const rowOfferMarkers = useMemo(() => {
    if (!selectedSectionKey || !sectionSeats.length) return [];
    const offersByRow = new Map<string, Map<TicketOffer["marketplace"], TicketOffer>>();
    for (const offer of (prices?.sources ?? []).flatMap((source) => source.offers)) {
      if (normalizeSection(offer.section) !== selectedSectionKey || offer.row === "—" || isExactSeatOffer(offer)) continue;
      const rowKey = normalizePlace(offer.row);
      const sourceOffers = offersByRow.get(rowKey) ?? new Map();
      sourceOffers.set(offer.marketplace, cheaper(sourceOffers.get(offer.marketplace), offer));
      offersByRow.set(rowKey, sourceOffers);
    }
    return [...offersByRow.entries()].flatMap(([rowKey, sourceOffers]) => {
      const rowSeats = sectionSeats.filter((seat) => normalizePlace(seat.row) === rowKey);
      if (!rowSeats.length) return [];
      const offers = [...sourceOffers.values()].sort((left, right) => left.priceCents - right.priceCents);
      return [{
        row: offers[0]!.row,
        offer: offers[0]!,
        offers,
        xPercent: rowSeats.reduce((sum, seat) => sum + seat.xPercent, 0) / rowSeats.length,
        yPercent: rowSeats.reduce((sum, seat) => sum + seat.yPercent, 0) / rowSeats.length,
      }];
    });
  }, [prices, sectionSeats, selectedSectionKey]);

  const recommendation = useMemo(() => {
    if (sortedSeats.length) return sortedSeats[0];
    return [...mapData.sections].filter((section) => section.offer).sort((left, right) => mode === "lowest"
      ? left.offer!.priceCents - right.offer!.priceCents
      : sectionDistance(left) - sectionDistance(right) || left.offer!.priceCents - right.offer!.priceCents)[0];
  }, [mapData.sections, mode, sortedSeats]);

  function setZoomLevel(next: number) {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (clamped === MIN_ZOOM) setOffset({ x: 0, y: 0 });
  }

  function reset() {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setSelectedSectionKey(undefined);
    setSelectedSeatId(undefined);
  }

  function focusSection(section: SectionWithPrice) {
    if (suppressClick.current || !section.offer) return;
    const mapElement = map.current;
    const targetZoom = zoomForSection(section);
    setSelectedSectionKey(normalizeSection(section.section));
    setSelectedSeatId(undefined);
    setZoom(targetZoom);
    if (mapElement) {
      setOffset({
        x: -(section.xPercent / 100 - .5) * mapElement.offsetWidth * targetZoom,
        y: -(section.yPercent / 100 - .5) * mapElement.offsetHeight * targetZoom,
      });
    }
  }

  function focusSeat(seat: PricedSeat) {
    if (!imageUrl) return;
    const section = mapData.sections.find((candidate) => normalizeSection(candidate.section) === normalizeSection(seat.position.section));
    if (!section) return;
    const mapElement = map.current;
    const targetZoom = zoomForSection(section);
    setSelectedSectionKey(normalizeSection(section.section));
    setSelectedSeatId(seat.position.id);
    setZoom(targetZoom);
    if (mapElement) {
      setOffset({
        x: -(seat.position.xPercent / 100 - .5) * mapElement.offsetWidth * targetZoom,
        y: -(seat.position.yPercent / 100 - .5) * mapElement.offsetHeight * targetZoom,
      });
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageUrl || zoom === MIN_ZOOM) return;
    if ((event.target as Element).closest("button, a")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.current.lastX;
    const deltaY = event.clientY - drag.current.lastY;
    drag.current.lastX = event.clientX;
    drag.current.lastY = event.clientY;
    if (Math.hypot(event.clientX - drag.current.startX, event.clientY - drag.current.startY) > 5) suppressClick.current = true;
    setOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") setZoomLevel(zoom + ZOOM_STEP);
    if (event.key === "-") setZoomLevel(zoom - ZOOM_STEP);
    if (event.key === "0" || event.key === "Escape") reset();
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!imageUrl) return;
    event.preventDefault();
    setZoomLevel(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }

  const showSeatDetail = zoom >= DETAIL_ZOOM;
  const seatsToRender = selectedSectionKey
    ? sectionSeats
    : showSeatDetail ? mapData.pricedSeats.map((seat) => seat.position) : [];
  const recommendedSection = recommendation && "position" in recommendation
    ? normalizeSection(recommendation.position.section)
    : recommendation ? normalizeSection(recommendation.section) : undefined;

  const mapStyle = {
    aspectRatio: prices?.mapWidth && prices.mapHeight ? `${prices.mapWidth} / ${prices.mapHeight}` : undefined,
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
    "--map-zoom": zoom,
  } as CSSProperties;
  const pathScale = `scale(${100 / (prices?.mapWidth ?? 100)} ${100 / (prices?.mapHeight ?? 100)})`;

  return (
    <div className="seatMapViewer">
      <div className="seatMapWorkspace">
        <div className="seatMapStage">
          <div className="seatMapControls" aria-label="Seat map zoom controls">
            <button type="button" onClick={() => setZoomLevel(zoom + ZOOM_STEP)} disabled={!imageUrl || zoom >= MAX_ZOOM} aria-label="Zoom in"><Plus size={19} /></button>
            <span aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoomLevel(zoom - ZOOM_STEP)} disabled={!imageUrl || zoom <= MIN_ZOOM} aria-label="Zoom out"><Minus size={19} /></button>
            <button type="button" onClick={reset} disabled={!imageUrl || (zoom === MIN_ZOOM && !selectedSectionKey)} aria-label="Reset seat map"><LocateFixed size={18} /></button>
          </div>
          <div
            className={`seatMapCanvas ${zoom > MIN_ZOOM ? "canPan" : ""}`}
            tabIndex={0}
            role="application"
            aria-label={imageUrl ? `Interactive Ticketmaster seat map and lowest marketplace prices for ${eventName}` : `Seat map unavailable for ${eventName}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onKeyDown={onKeyDown}
            onWheel={onWheel}
          >
            {imageUrl ? (
              <div ref={map} className="seatMapTransform" style={mapStyle}>
            <img src={imageUrl} alt={`Ticketmaster venue seat map for ${eventName}`} draggable={false} />

            {!showSeatDetail && (
              <>
                <svg className="sectionHitLayer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Select a seating section">
                  {mapData.sections.flatMap((section) => section.paths?.length || section.outline?.length ? [(
                    section.paths?.length ? (
                    <path
                      className={`sectionHitArea ${section.offer ? "" : "noListings"} ${normalizeSection(section.section) === recommendedSection ? "recommended" : ""}`}
                      key={normalizeSection(section.section)}
                      d={section.paths.join(" ")}
                      transform={pathScale}
                      role={section.offer ? "button" : "img"}
                      tabIndex={section.offer ? 0 : -1}
                      aria-disabled={!section.offer}
                      aria-label={`Section ${section.section}${section.offer ? `, tickets from ${money(section.offer.priceCents)}` : ", no listings found"}`}
                      onClick={section.offer ? () => focusSection(section) : undefined}
                      onKeyDown={(event) => {
                        if (section.offer && (event.key === "Enter" || event.key === " ")) focusSection(section);
                      }}
                    />
                    ) : (
                    <polygon
                      className={`sectionHitArea ${section.offer ? "" : "noListings"} ${normalizeSection(section.section) === recommendedSection ? "recommended" : ""}`}
                      key={normalizeSection(section.section)}
                      points={section.outline!.map((point) => `${point.xPercent},${point.yPercent}`).join(" ")}
                      role={section.offer ? "button" : "img"}
                      tabIndex={section.offer ? 0 : -1}
                      aria-disabled={!section.offer}
                      aria-label={`Section ${section.section}${section.offer ? `, tickets from ${money(section.offer.priceCents)}` : ", no listings found"}`}
                      onClick={section.offer ? () => focusSection(section) : undefined}
                      onKeyDown={(event) => {
                        if (section.offer && (event.key === "Enter" || event.key === " ")) focusSection(section);
                      }}
                    />
                    )
                  )] : [])}
                </svg>
                <div className="sectionPriceLayer" aria-label="Lowest price by seating section">
                  {mapData.sections.filter((section) => section.offer || !section.outline?.length).map((section) => (
                    <button
                      className={`sectionPriceMarker ${section.offer ? "" : "noListings"} ${normalizeSection(section.section) === recommendedSection ? "recommended" : ""}`}
                      key={normalizeSection(section.section)}
                      style={{ left: `${section.xPercent}%`, top: `${section.yPercent}%` }}
                      type="button"
                      disabled={!section.offer}
                      onClick={() => focusSection(section)}
                    >
                      <strong>{section.section}</strong>
                      <span>{section.offer ? money(section.offer.priceCents) : "View seats"}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {showSeatDetail && selectedSection && (selectedSection.paths?.length || selectedSection.outline?.length) && (
              <svg className="sectionFocusLayer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {selectedSection.paths?.length
                  ? <path d={selectedSection.paths.join(" ")} transform={pathScale} />
                  : <polygon points={selectedSection.outline!.map((point) => `${point.xPercent},${point.yPercent}`).join(" ")} />}
              </svg>
            )}

            {showSeatDetail && (
              <div className="seatDetailLayer" aria-label={selectedSection ? `Seats in section ${selectedSection.section}` : "Exact seats with public prices"}>
                {seatsToRender.map((position) => {
                  const offer = mapData.lowestBySeat.get(seatKey(position.section, position.row, position.seat));
                  const selected = position.id === selectedSeatId;
                  return offer ? (
                    <button
                      className={`seatDot available ${selected ? "selected" : ""}`}
                      key={position.id}
                      style={{
                        left: `${position.xPercent}%`,
                        top: `${position.yPercent}%`,
                        "--seat-source": mapData.sourceColors.get(offer.marketplace),
                      } as CSSProperties}
                      type="button"
                      aria-label={`Section ${position.section}, row ${position.row}, seat ${position.seat}, ${money(offer.priceCents)} on ${offer.marketplaceLabel}`}
                      title={`Row ${position.row}, seat ${position.seat} · ${money(offer.priceCents)} on ${offer.marketplaceLabel}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!suppressClick.current) setSelectedSeatId(position.id);
                      }}
                    >
                      <span><b>{money(offer.priceCents)}</b><small>{offer.marketplaceLabel}</small></span>
                    </button>
                  ) : (
                    <i
                      className="seatDot"
                      key={position.id}
                      style={{ left: `${position.xPercent}%`, top: `${position.yPercent}%` }}
                      title={`Section ${position.section}, row ${position.row}, seat ${position.seat}`}
                    />
                  );
                })}
                {rowOfferMarkers.map((marker) => (
                  <a
                    className="rowPriceMarker"
                    href={marker.offer.deepLink}
                    key={normalizePlace(marker.row)}
                    rel="noreferrer"
                    style={{
                      left: `${marker.xPercent}%`,
                      top: `${marker.yPercent}%`,
                      "--row-source": mapData.sourceColors.get(marker.offer.marketplace),
                    } as CSSProperties}
                    target="_blank"
                    title={`${marker.offers.map((offer) => `${money(offer.priceCents)} on ${offer.marketplaceLabel}`).join(" · ")} · Row ${marker.row}`}
                  >
                    <b>{money(marker.offer.priceCents)}</b>
                    <small>Row {marker.row}{marker.offers.length > 1 ? ` · ${marker.offers.length} sites` : ` · ${marker.offer.marketplaceLabel}`}</small>
                  </a>
                ))}
              </div>
            )}
              </div>
            ) : (
              <div className="seatMapUnavailable">
                <LocateFixed size={38} />
                <h3>Seat map not available</h3>
                <p>Ticketmaster has not published a static seat map for this event.</p>
                <a href={ticketmasterUrl} target="_blank" rel="noreferrer">Check Ticketmaster <ExternalLink size={15} /></a>
              </div>
            )}

            {imageUrl && loadingPrices && !prices && (
              <span className="priceCrawlLoading"><i /> Loading sections, seats, and prices…</span>
            )}

            {imageUrl && !selectedSection && recommendation && (
              <button
                className="mapRecommendation"
                type="button"
                onClick={() => {
                  if ("position" in recommendation) focusSeat(recommendation);
                  else focusSection(recommendation);
                }}
              >
                <span>{mode === "lowest" ? "Lowest found" : "Best available"}</span>
                <strong>{recommendation.offer ? money(recommendation.offer.priceCents) : "View"}</strong>
                <small>Section {"position" in recommendation ? recommendation.position.section : recommendation.section}</small>
              </button>
            )}

            {imageUrl && selectedSection && (
              <div className="seatSelectionCard" aria-live="polite">
                <button className="closeSeatSelection" type="button" onClick={reset} aria-label="Return to all sections"><X size={17} /></button>
                <span className="selectionEyebrow">Section {selectedSection.section}</span>
                {selectedSeat ? (
                  <>
                    <h3>Row {selectedSeat.position.row} · Seat {selectedSeat.position.seat}</h3>
                    <p>{selectedSeat.offers.length > 1 ? "Compare every marketplace that disclosed this exact seat." : "This marketplace disclosed the exact seat."}</p>
                    <div className="selectedOfferList">
                      {selectedSeat.offers.map((offer, index) => (
                        <a href={offer.deepLink} target="_blank" rel="noreferrer" key={offer.marketplace}>
                          <span><i style={{ background: mapData.sourceColors.get(offer.marketplace) }} />{offer.marketplaceLabel}{index === 0 && <small>Lowest</small>}</span>
                          <strong>{money(offer.priceCents)}</strong>
                          <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <h3><Armchair size={17} /> Choose an available seat</h3>
                    <p>{sectionSeats.length
                      ? `${sectionSeats.length} seat locations shown. Priced dots are listings whose exact seat was publicly disclosed.`
                      : "Ticketmaster did not publish individual seat coordinates for this section."}</p>
                    <div className="selectedOfferList">
                      {selectedSection.offers.map((offer, index) => (
                        <a href={offer.deepLink} target="_blank" rel="noreferrer" key={offer.marketplace}>
                          <span><i style={{ background: mapData.sourceColors.get(offer.marketplace) }} />{offer.marketplaceLabel}{index === 0 && <small>Lowest</small>}</span>
                          <strong>{money(offer.priceCents)}</strong>
                          <ExternalLink size={13} />
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="seatPricePanel" aria-label="Marketplace prices by seat or section">
          <div className="seatPriceHeading">
            <div>
              <span>Available listings</span>
              <h3>Prices by seat or section</h3>
            </div>
            <strong>{priceListItems.length.toLocaleString()}</strong>
          </div>
          <div className="seatPriceSort" role="group" aria-label="Sort seat prices">
            <button className={mode === "lowest" ? "active" : ""} type="button" onClick={() => setMode("lowest")}>Lowest price</button>
            <button className={mode === "best" ? "active" : ""} type="button" title="Sorts available seats by distance from the center of the venue map" onClick={() => setMode("best")}>Best position</button>
          </div>
          {loadingPrices && !prices ? (
            <div className="seatPriceEmpty"><i /> Finding the lowest price for each seat…</div>
          ) : priceListItems.length ? (
            <ol className="seatPriceList">
              {priceListItems.map((item, index) => item.kind === "seat" ? (
                <li className={item.seat.position.id === selectedSeatId ? "selected" : ""} key={item.key}>
                  <button type="button" onClick={() => focusSeat(item.seat)} disabled={!imageUrl} aria-label={`Show section ${item.seat.position.section}, row ${item.seat.position.row}, seat ${item.seat.position.seat} on the map`}>
                    {index === 0 && <small>{mode === "lowest" ? "Lowest price" : "Best position"}</small>}
                    <strong>Section {item.seat.position.section}</strong>
                    <span>Row {item.seat.position.row} · Seat {item.seat.position.seat}</span>
                  </button>
                  <a href={item.seat.offer.deepLink} target="_blank" rel="noreferrer" aria-label={`View seat ${item.seat.position.seat} on ${item.seat.offer.marketplaceLabel}`}>
                    <strong>{money(item.seat.offer.priceCents)}</strong>
                    <span>
                      {item.seat.offers.map((offer) => <i style={{ background: mapData.sourceColors.get(offer.marketplace) }} key={offer.marketplace} />)}
                      {item.seat.offers.length > 1 ? `${item.seat.offers.length} sites` : item.seat.offer.marketplaceLabel}<ExternalLink size={12} />
                    </span>
                  </a>
                </li>
              ) : (
                <li key={item.key}>
                  <div className="seatListingLocation">
                    {index === 0 && <small>{mode === "lowest" ? "Lowest price" : "First section"}</small>}
                    <strong>{normalizeSection(item.offer.section) === "ANY" ? "Section not disclosed" : `Section ${item.offer.section}`}</strong>
                    <span>{item.offer.row !== "—" ? `Row ${item.offer.row}` : "Event-level minimum"}{item.offer.seat ? ` · Seat ${item.offer.seat}` : ""}</span>
                  </div>
                  <a href={item.offer.deepLink} target="_blank" rel="noreferrer" aria-label={normalizeSection(item.offer.section) === "ANY" ? `View event minimum on ${item.offer.marketplaceLabel}` : `View section ${item.offer.section} on ${item.offer.marketplaceLabel}`}>
                    <strong>{money(item.offer.priceCents)}</strong>
                    <span><i style={{ background: mapData.sourceColors.get(item.offer.marketplace) }} />{item.offer.marketplaceLabel}<ExternalLink size={12} /></span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <div className="seatPriceEmpty">
              <Armchair size={24} />
              <strong>No section or seat prices found</strong>
              <span>No marketplace returned a public listing price for this event.</span>
            </div>
          )}
        </aside>
      </div>
      {prices && (
        <div className="mapMarketplaceStrip" aria-label="Marketplace price coverage">
          {prices.sources.map((source) => {
            const summary = sourceSummary(source);
            return (
              <div className={`mapSourcePrice status-${source.status}`} key={source.marketplace}>
                <span><i style={{ background: source.color }} />{source.label}</span>
                <strong>{summary.price}</strong>
                <small title={source.message}>{summary.coverage}</small>
              </div>
            );
          })}
        </div>
      )}
      <div className="seatMapFooter">
        <span><i /> Click a section to see its exact seat layout</span>
        <span>{prices ? `${(prices.seatPositions ?? []).length.toLocaleString()} seats · checked ${new Date(prices.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Waiting for prices"}</span>
      </div>
      <p className="seatMapDisclaimer">Each mapped seat uses the color of its lowest exact-seat offer. Section/row prices appear in the section panel, while event-only minimums appear in the source cards below the map.</p>
    </div>
  );
}
