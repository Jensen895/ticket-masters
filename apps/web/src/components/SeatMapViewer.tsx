"use client";

import { ExternalLink, LocateFixed, Minus, Plus } from "lucide-react";
import { KeyboardEvent, PointerEvent, useRef, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.4;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function SeatMapViewer({
  imageUrl,
  eventName,
  ticketmasterUrl,
}: {
  imageUrl?: string;
  eventName: string;
  ticketmasterUrl: string;
}) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

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
        aria-label={imageUrl ? `Interactive Ticketmaster seat map for ${eventName}. Use plus and minus to zoom, then drag to pan.` : `Seat map unavailable for ${eventName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={onKeyDown}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Ticketmaster venue seat map for ${eventName}`}
            draggable={false}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          />
        ) : (
          <div className="seatMapUnavailable">
            <LocateFixed size={38} />
            <h3>Seat map not available</h3>
            <p>Ticketmaster has not published a static seat map for this event.</p>
            <a href={ticketmasterUrl} target="_blank" rel="noreferrer">Check Ticketmaster <ExternalLink size={15} /></a>
          </div>
        )}
      </div>
      <div className="seatMapFooter">
        <span><i /> Seating sections</span>
        <span>Use +/− to zoom · drag to pan</span>
      </div>
      <p className="seatMapDisclaimer">This is the official venue layout supplied by Ticketmaster. The public Discovery API does not expose live per-seat availability; use Ticketmaster for current selectable seats.</p>
    </div>
  );
}
