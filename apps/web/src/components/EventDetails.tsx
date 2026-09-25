"use client";

import type { CrawledPriceSnapshot, TrackedEvent, TrackedEventDetail } from "@ticket-hub/contracts";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  ExternalLink,
  Info,
  MapPin,
  Share2,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readTrackedEvents, writeTrackedEvents } from "@/lib/tracked-events";
import { PriceAlertManager } from "./PriceAlertManager";
import { SeatMapViewer } from "./SeatMapViewer";
import { SiteHeader } from "./SiteHeader";

type DisplayEvent = TrackedEvent | TrackedEventDetail;

function detailValues(event: DisplayEvent) {
  if ("importantInfo" in event) return event;
  return { ...event, importantInfo: [], attractions: event.attractions ?? [] };
}

export function EventDetails({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<DisplayEvent>();
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [prices, setPrices] = useState<CrawledPriceSnapshot>();
  const [warning, setWarning] = useState<string>();
  const [shareLabel, setShareLabel] = useState("Share");
  const priceEventRef = useRef<TrackedEvent | undefined>(undefined);
  const loadingPricesRef = useRef(false);

  const refreshPrices = useCallback(async () => {
    const priceEvent = priceEventRef.current;
    if (!priceEvent || loadingPricesRef.current) return;
    loadingPricesRef.current = true;
    setLoadingPrices(true);
    try {
      const response = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(priceEvent),
      });
      const payload = await response.json() as CrawledPriceSnapshot | { message?: string };
      if (!response.ok) throw new Error("message" in payload ? payload.message : undefined);
      setPrices(payload as CrawledPriceSnapshot);
    } catch (caught) {
      setWarning((current) => current ?? (caught instanceof Error && caught.message
        ? `Marketplace prices could not be loaded: ${caught.message}`
        : "Marketplace prices could not be loaded."));
    } finally {
      loadingPricesRef.current = false;
      setLoadingPrices(false);
    }
  }, []);

  useEffect(() => {
    const tracked = readTrackedEvents(window.localStorage);
    const saved = tracked.find((candidate) => candidate.id === eventId);
    if (!saved) {
      setMissing(true);
      setLoading(false);
      return;
    }
    const savedEvent = saved;

    setEvent(savedEvent);
    let cancelled = false;

    async function loadEvent() {
      let priceEvent: TrackedEvent = savedEvent;
      try {
        const params = new URLSearchParams({ name: savedEvent.name });
        const response = await fetch(`/api/ticketmaster/events/${encodeURIComponent(eventId)}?${params}`);
        const payload = await response.json() as TrackedEventDetail | { message?: string };
        if (!response.ok) throw new Error("message" in payload ? payload.message : undefined);
        const detail = payload as TrackedEventDetail;
        priceEvent = detail;
        if (cancelled) return;
        setEvent(detail);
        writeTrackedEvents(window.localStorage, tracked.map((candidate) => candidate.id === detail.id ? detail : candidate));
      } catch (caught) {
        if (cancelled) return;
        setWarning(caught instanceof Error && caught.message
          ? `${caught.message} Showing your saved event information.`
          : "Could not refresh this event. Showing your saved event information.");
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (cancelled) return;
      priceEventRef.current = priceEvent;
      await refreshPrices();
    }

    void loadEvent();
    return () => { cancelled = true; };
  }, [eventId, refreshPrices]);

  function removeEvent() {
    const remaining = readTrackedEvents(window.localStorage).filter((candidate) => candidate.id !== eventId);
    writeTrackedEvents(window.localStorage, remaining);
    router.push("/");
  }

  async function share() {
    const shareData = { title: event?.name, url: window.location.href };
    const shareApi = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
    try {
      if (shareApi) await shareApi.call(navigator, shareData);
      else await navigator.clipboard.writeText(window.location.href);
      setShareLabel(shareApi ? "Shared" : "Link copied");
      window.setTimeout(() => setShareLabel("Share"), 1600);
    } catch {
      // A dismissed native share sheet does not require an error state.
    }
  }

  if (missing) {
    return (
      <div className="detailPage">
        <SiteHeader compact />
        <main className="untrackedEvent">
          <Info size={34} />
          <h1>This event isn’t in your collection</h1>
          <p>For privacy, this app only opens events that you have explicitly added.</p>
          <Link href="/"><ArrowLeft size={17} /> Search and add an event</Link>
        </main>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="detailPage">
        <SiteHeader compact />
        <main className="detailLoading"><span />Loading your event…</main>
      </div>
    );
  }

  const detail = detailValues(event);

  return (
    <div className="detailPage">
      <SiteHeader compact />
      <div className="eventHero">
        <div className="eventHeroBackdrop" style={event.imageUrl ? { backgroundImage: `url(${event.imageUrl})` } : undefined} />
        <div className="pageShell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/"><ArrowLeft size={14} /> My events</Link><span>/</span><span>{event.classification}</span>
          </nav>
          <div className="eventHeroContent">
            <div className="eventPoster" style={event.imageUrl ? { backgroundImage: `url(${event.imageUrl})` } : undefined} />
            <div className="eventTitleBlock">
              <p className="eventCategory">{event.classification}{event.genre ? ` · ${event.genre}` : ""}</p>
              <h1>{event.name}</h1>
              <div className="eventMeta">
                <span><CalendarDays size={18} /><b>{event.dateLabel}</b></span>
                <span><Clock3 size={18} />{event.timeLabel}</span>
                <span><MapPin size={18} />{event.venue.name}{event.venue.city ? `, ${event.venue.city}` : ""}</span>
              </div>
            </div>
            <button className="shareButton" type="button" onClick={share}><Share2 size={18} /> {shareLabel}</button>
          </div>
        </div>
      </div>

      {warning && <div className="eventWarning"><Info size={15} /> {warning}</div>}
      {loading && <div className="eventRefreshing">Crawling event information from Ticketmaster…</div>}

      <main className="detailContent pageShell">
        <section className="seatMapSection">
          <div className="detailSectionHeading">
            <div>
              <p className="sectionKicker">Seat allocations</p>
              <h2>Venue seat map</h2>
            </div>
            <span className="mapSource">Interactive seat geometry · lowest price across six sources</span>
          </div>
          <SeatMapViewer
            imageUrl={event.seatMapUrl}
            eventName={event.name}
            ticketmasterUrl={event.ticketmasterUrl}
            prices={prices}
            loadingPrices={loadingPrices}
          />
        </section>

        <aside className="eventInfoPanel">
          <div className="eventInfoHeading">
            <p className="sectionKicker">Event information</p>
            <h2>Know before you go</h2>
          </div>
          <dl className="eventFacts">
            <div><dt><CalendarDays size={18} /> Date</dt><dd>{event.dateLabel}</dd></div>
            <div><dt><Clock3 size={18} /> Time</dt><dd>{event.timeLabel}{event.venue.timezone ? <small>{event.venue.timezone.replaceAll("_", " ")}</small> : null}</dd></div>
            <div><dt><MapPin size={18} /> Venue</dt><dd>{event.venue.name}<small>{event.venueAddress || [event.venue.city, event.venue.region].filter(Boolean).join(", ")}</small></dd></div>
            <div><dt><Tag size={18} /> Classification</dt><dd>{event.classification}<small>{event.genre}</small></dd></div>
            {detail.attractions.length > 0 && <div><dt><Users size={18} /> Featuring</dt><dd>{detail.attractions.join(", ")}</dd></div>}
          </dl>

          {event.status && <div className={`eventStatus status-${event.status.toLowerCase().replaceAll(" ", "-")}`}><i /> {event.status}</div>}
          {detail.description && <p className="eventDescription">{detail.description}</p>}
          {detail.importantInfo.map((item) => <div className="importantInfo" key={item}><Info size={17} /><p>{item}</p></div>)}
          {detail.accessibilityInfo && <div className="accessibilityInfo"><strong>Accessibility</strong><p>{detail.accessibilityInfo}</p></div>}

          <a className="ticketmasterLink" href={event.ticketmasterUrl} target="_blank" rel="noreferrer">
            View live seat availability on Ticketmaster <ExternalLink size={17} />
          </a>
          <button className="removeDetailButton" type="button" onClick={removeEvent}><Trash2 size={16} /> Remove from my events</button>
        </aside>
      </main>

      <div className="pageShell alertSectionWrap">
        <PriceAlertManager
          eventId={eventId}
          eventName={event.name}
          snapshot={prices}
          loadingPrices={loadingPrices}
          onRefreshPrices={() => void refreshPrices()}
        />
      </div>
    </div>
  );
}
