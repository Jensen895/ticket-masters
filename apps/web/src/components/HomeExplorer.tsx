"use client";

import type {
  EventClassification,
  TicketmasterSearchResponse,
  TrackedEvent,
} from "@ticket-hub/contracts";
import {
  CalendarDays,
  CheckCircle2,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventCard } from "./EventCard";
import { SearchResultCard } from "./SearchResultCard";
import {
  readTrackedEvents,
  removeExpiredTrackedEvents,
  writeTrackedEvents,
} from "@/lib/tracked-events";

const classifications: Array<"All" | EventClassification> = [
  "All",
  "Music",
  "Sports",
  "Arts & Theater",
  "Comedy",
  "Family",
  "Other",
];

const groupOrder: EventClassification[] = ["Music", "Sports", "Arts & Theater", "Comedy", "Family", "Other"];
const LOCATION_RADIUS_MILES = 100;

export function HomeExplorer() {
  const [trackedEvents, setTrackedEvents] = useState<TrackedEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number }>();
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "detected" | "unavailable">("idle");
  const [locationMessage, setLocationMessage] = useState("Use my current location");
  const cityEditVersion = useRef(0);
  const [results, setResults] = useState<TrackedEvent[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultPage, setResultPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [classification, setClassification] = useState<(typeof classifications)[number]>("All");

  useEffect(() => {
    const savedEvents = readTrackedEvents(window.localStorage);
    const currentEvents = removeExpiredTrackedEvents(savedEvents);
    if (currentEvents.length !== savedEvents.length) writeTrackedEvents(window.localStorage, currentEvents);
    setTrackedEvents(currentEvents);
    setHydrated(true);
  }, []);

  const detectCity = useCallback((replaceCity = false) => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      setLocationMessage("Location detection is not supported by this browser. Enter a city manually.");
      return;
    }

    setLocationStatus("locating");
    setLocationMessage("Detecting your city…");
    const editVersion = cityEditVersion.current;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const params = new URLSearchParams({
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
        });
        const response = await fetch(`/api/location?${params}`);
        const payload = await response.json() as { city?: string; latitude?: number; longitude?: number; message?: string };
        if (!response.ok || !payload.city || payload.latitude === undefined || payload.longitude === undefined) {
          throw new Error(payload.message || "Your city could not be detected.");
        }
        if (replaceCity || cityEditVersion.current === editVersion) {
          setCity(payload.city);
          setCoordinates({ latitude: payload.latitude, longitude: payload.longitude });
          setLocationStatus("detected");
          setLocationMessage(`Searching within ${LOCATION_RADIUS_MILES} miles of ${payload.city}`);
        } else {
          setLocationStatus("idle");
          setLocationMessage("Use my current location");
        }
      } catch (caught) {
        setLocationStatus("unavailable");
        setLocationMessage(caught instanceof Error ? caught.message : "Your city could not be detected. Enter it manually.");
      }
    }, (locationError) => {
      setLocationStatus("unavailable");
      setLocationMessage(locationError.code === locationError.PERMISSION_DENIED
        ? "Location access was not granted. Enter a city manually or try again."
        : "Your location could not be detected. Enter a city manually or try again.");
    }, {
      enableHighAccuracy: false,
      maximumAge: 15 * 60 * 1_000,
      timeout: 10_000,
    });
  }, []);

  useEffect(() => {
    detectCity();
  }, [detectCity]);

  useEffect(() => {
    if (!hydrated || trackedEvents.length === 0) return;
    let timer: number | undefined;

    function scheduleRemoval(events: TrackedEvent[]) {
      const now = Date.now();
      const currentEvents = removeExpiredTrackedEvents(events, now);
      if (currentEvents.length !== events.length) {
        writeTrackedEvents(window.localStorage, currentEvents);
        setTrackedEvents(currentEvents);
        return;
      }

      const nextStart = currentEvents.reduce((earliest, event) => {
        const startsAt = event.startsAt ? Date.parse(event.startsAt) : Number.NaN;
        return Number.isFinite(startsAt) && startsAt > now ? Math.min(earliest, startsAt) : earliest;
      }, Number.POSITIVE_INFINITY);
      if (!Number.isFinite(nextStart)) return;

      // Recheck hourly so changes to the device clock cannot leave stale events behind.
      const delay = Math.min(Math.max(nextStart - now + 50, 0), 60 * 60 * 1_000);
      timer = window.setTimeout(() => scheduleRemoval(currentEvents), delay);
    }

    scheduleRemoval(trackedEvents);
    return () => window.clearTimeout(timer);
  }, [hydrated, trackedEvents]);

  const trackedIds = useMemo(() => new Set(trackedEvents.map((event) => event.id)), [trackedEvents]);
  const groupedEvents = useMemo(() => groupOrder.flatMap((group) => {
    if (classification !== "All" && classification !== group) return [];
    const events = trackedEvents.filter((event) => event.classification === group);
    return events.length ? [{ classification: group, events }] : [];
  }), [classification, trackedEvents]);

  function persist(events: TrackedEvent[]) {
    setTrackedEvents(events);
    writeTrackedEvents(window.localStorage, events);
  }

  function addEvent(event: TrackedEvent) {
    if (trackedIds.has(event.id)) return;
    persist([event, ...trackedEvents]);
  }

  function removeEvent(eventId: string) {
    persist(trackedEvents.filter((event) => event.id !== eventId));
  }

  async function searchTicketmaster(page = 0, append = false) {
    setLoading(true);
    setError(undefined);
    setHasSearched(true);
    if (!append) setResults([]);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (city.trim()) params.set("city", city.trim());
      if (coordinates) {
        params.set("latitude", String(coordinates.latitude));
        params.set("longitude", String(coordinates.longitude));
        params.set("radius", String(LOCATION_RADIUS_MILES));
      }
      params.set("page", String(page));
      const response = await fetch(`/api/ticketmaster/events?${params.toString()}`);
      const payload = await response.json() as TicketmasterSearchResponse | { message?: string };
      if (!response.ok) throw new Error("message" in payload ? payload.message : undefined);
      const search = payload as TicketmasterSearchResponse;
      setResults((current) => append
        ? [...current, ...search.items.filter((item) => !current.some((existing) => existing.id === item.id))]
        : search.items);
      setResultTotal(search.total);
      setResultPage(search.page);
      setPageCount(search.pageCount);
      if (!append) window.setTimeout(() => document.querySelector("#search-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (caught) {
      setResults([]);
      setResultTotal(0);
      setError(caught instanceof Error && caught.message ? caught.message : "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function submitSearch(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    void searchTicketmaster();
  }

  return (
    <>
      <section className="hero">
        <div className="heroBackdrop" />
        <div className="heroGlow" />
        <div className="heroContent">
          <p className="eyebrow"><Sparkles size={15} /> Your personal event board</p>
          <h1>Find the event.<br /><span>Compare every market.</span></h1>
          <p className="heroCopy">Crawl Ticketmaster for event details and the venue map, then place public prices from six ticket sites on that same map.</p>
          <form className="heroSearch" role="search" onSubmit={submitSearch}>
            <div className="heroSearchField">
              <Search size={22} />
              <label>
                <span>Search Ticketmaster</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artist, team, venue or event" />
              </label>
            </div>
            <div className="heroLocation">
              <MapPin size={21} />
              <label>
                <span aria-live="polite">{locationStatus === "locating" ? "Detecting city…" : locationStatus === "detected" ? "City detected" : locationStatus === "unavailable" ? "City (enter manually)" : "City (optional)"}</span>
                <input
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    cityEditVersion.current += 1;
                    setCoordinates(undefined);
                    if (locationStatus === "detected") setLocationStatus("idle");
                  }}
                  placeholder="Los Angeles"
                  autoComplete="address-level2"
                />
              </label>
              <button
                type="button"
                className="detectLocationButton"
                onClick={() => detectCity(true)}
                disabled={locationStatus === "locating"}
                aria-label={locationMessage}
                title={locationMessage}
              >
                {locationStatus === "locating" ? <LoaderCircle className="spinning" size={17} /> : <LocateFixed size={17} />}
              </button>
            </div>
            <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
          </form>
          <div className="heroTrust">
            <span><Ticket size={14} /> No marketplace API keys</span>
            <span><ShieldCheck size={14} /> Added only when you choose</span>
            <span><CalendarDays size={14} /> Six price sources, one map</span>
          </div>
        </div>
      </section>

      <main>
        {hasSearched && (
          <section className="searchResultsSection pageShell" id="search-results" aria-live="polite">
            <div className="sectionHeading">
              <div>
                <p className="sectionKicker">Ticketmaster results</p>
                <h2>{loading ? "Searching…" : error ? "Search unavailable" : `${resultTotal.toLocaleString()} event${resultTotal === 1 ? "" : "s"} found${coordinates ? ` within ${LOCATION_RADIUS_MILES} miles` : ""}`}</h2>
              </div>
              <button className="textButton" type="button" onClick={() => { setHasSearched(false); setResults([]); setError(undefined); }}>Close results</button>
            </div>
            {error ? (
              <div className="inlineError"><strong>We couldn’t complete that search.</strong><span>{error}</span></div>
            ) : !loading && results.length === 0 ? (
              <div className="emptyState compactEmpty"><Search size={26} /><h3>No Ticketmaster events found</h3><p>Try a broader event, artist, venue, or city.</p></div>
            ) : (
              <div className="searchResultGrid">
                {results.map((event) => (
                  <SearchResultCard key={event.id} event={event} added={trackedIds.has(event.id)} onAdd={() => addEvent(event)} />
                ))}
              </div>
            )}
            {!error && !loading && resultPage + 1 < pageCount && (
              <button className="loadMoreButton" type="button" onClick={() => void searchTicketmaster(resultPage + 1, true)}>
                Load more events
              </button>
            )}
          </section>
        )}

        <section className="categoryBar" aria-label="Saved event classifications">
          <div className="pageShell categoryInner">
            {classifications.map((item) => (
              <button key={item} type="button" className={classification === item ? "active" : ""} onClick={() => setClassification(item)}>
                {item === "All" ? `All my events (${trackedEvents.length})` : item}
              </button>
            ))}
          </div>
        </section>

        <section className="pageShell eventsSection" id="my-events">
          <div className="sectionHeading">
            <div>
              <p className="sectionKicker">Your collection</p>
              <h2>{classification === "All" ? "My events" : classification}</h2>
            </div>
          </div>
          {hydrated && groupedEvents.length > 0 ? (
            <div className="eventGroups">
              {groupedEvents.map((group) => (
                <section className="eventGroup" key={group.classification}>
                  {classification === "All" && <h3>{group.classification}<span>{group.events.length}</span></h3>}
                  <div className="eventGrid">
                    {group.events.map((event) => <EventCard event={event} key={event.id} onRemove={() => removeEvent(event.id)} />)}
                  </div>
                </section>
              ))}
            </div>
          ) : hydrated ? (
            <div className="emptyState">
              <Ticket size={30} />
              <h3>{trackedEvents.length ? `No ${classification} events yet` : "No events added yet"}</h3>
              <p>{trackedEvents.length ? "Choose another classification or add an event from Ticketmaster." : "Search Ticketmaster above and add an event. It will stay here on this browser."}</p>
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Search Ticketmaster</button>
            </div>
          ) : (
            <div className="emptyState loadingState">Loading your events…</div>
          )}
        </section>

        <section className="pageShell confidenceSection" id="how-it-works">
          <div className="confidenceIntro">
            <p className="sectionKicker">Focused by design</p>
            <h2>Only the events<br />you add.</h2>
          </div>
          <div className="confidenceGrid">
            <article><span><Search /></span><h3>Crawl the catalog</h3><p>Look across Ticketmaster’s public pages by event, artist, team, venue, or city.</p></article>
            <article><span><CheckCircle2 /></span><h3>Add what matters</h3><p>Your main page remains empty until you choose an event to track.</p></article>
            <article><span><MapPin /></span><h3>Compare on the map</h3><p>Open an event to see public marketplace prices aligned to Ticketmaster sections.</p></article>
          </div>
        </section>
      </main>
    </>
  );
}
