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
import { distanceInMiles } from "@/lib/ticketmaster";

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
const NEARBY_RADIUS_MILES = 100;
const LOCATION_RADIUS_MILES = 500;

interface SearchCriteria {
  query: string;
  city: string;
  coordinates?: { latitude: number; longitude: number };
}

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
  const [searchClassification, setSearchClassification] = useState<(typeof classifications)[number]>("All");
  const [classification, setClassification] = useState<(typeof classifications)[number]>("All");
  const submittedSearch = useRef<SearchCriteria | undefined>(undefined);

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

  async function searchTicketmaster(
    page = 0,
    requestedClassification = searchClassification,
    criteria = submittedSearch.current ?? { query, city, coordinates },
  ) {
    setLoading(true);
    setError(undefined);
    setHasSearched(true);
    setResults([]);
    try {
      const params = new URLSearchParams();
      if (criteria.query) params.set("q", criteria.query);
      if (criteria.city) params.set("city", criteria.city);
      if (criteria.coordinates) {
        params.set("latitude", String(criteria.coordinates.latitude));
        params.set("longitude", String(criteria.coordinates.longitude));
        params.set("radius", String(LOCATION_RADIUS_MILES));
      }
      if (requestedClassification !== "All") params.set("classification", requestedClassification);
      params.set("page", String(page));
      const response = await fetch(`/api/ticketmaster/events?${params.toString()}`);
      const payload = await response.json() as TicketmasterSearchResponse | { message?: string };
      if (!response.ok) throw new Error("message" in payload ? payload.message : undefined);
      const search = payload as TicketmasterSearchResponse;
      setResults(search.items);
      setResultTotal(search.total);
      setResultPage(search.page);
      setPageCount(search.pageCount);
      window.setTimeout(() => document.querySelector("#search-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (caught) {
      setResults([]);
      setResultTotal(0);
      setPageCount(0);
      setError(caught instanceof Error && caught.message ? caught.message : "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function submitSearch(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const criteria = {
      query: query.trim(),
      city: city.trim(),
      coordinates,
    };
    submittedSearch.current = criteria;
    void searchTicketmaster(0, searchClassification, criteria);
  }

  const visibleResultPages = useMemo(() => {
    const visibleCount = Math.min(5, pageCount);
    const firstPage = Math.max(0, Math.min(resultPage - 2, pageCount - visibleCount));
    return Array.from({ length: visibleCount }, (_, index) => firstPage + index);
  }, [pageCount, resultPage]);

  const groupedSearchResults = useMemo(() => {
    const center = submittedSearch.current?.coordinates;
    if (!center) return { nearby: [] as TrackedEvent[], farther: results };

    const nearby: TrackedEvent[] = [];
    const farther: TrackedEvent[] = [];
    for (const event of results) {
      const { latitude, longitude } = event.venue;
      if (latitude !== undefined
        && longitude !== undefined
        && distanceInMiles(center, { latitude, longitude }) <= NEARBY_RADIUS_MILES) {
        nearby.push(event);
      } else {
        farther.push(event);
      }
    }
    return { nearby, farther };
  }, [results]);

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
                <h2>{loading ? "Searching…" : error ? "Search unavailable" : `${resultTotal.toLocaleString()} ${searchClassification === "All" ? "event" : searchClassification.toLowerCase() + " event"}${resultTotal === 1 ? "" : "s"} found${submittedSearch.current?.coordinates ? ` within ${LOCATION_RADIUS_MILES} miles` : ""}`}</h2>
              </div>
              <button className="textButton" type="button" onClick={() => { setHasSearched(false); setResults([]); setError(undefined); }}>Close results</button>
            </div>
            <div className="searchCategoryTabs" role="tablist" aria-label="Search result categories">
              {classifications.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={searchClassification === item}
                  className={searchClassification === item ? "active" : ""}
                  disabled={loading}
                  onClick={() => {
                    setSearchClassification(item);
                    void searchTicketmaster(0, item);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            {error ? (
              <div className="inlineError"><strong>We couldn’t complete that search.</strong><span>{error}</span></div>
            ) : !loading && results.length === 0 ? (
              <div className="emptyState compactEmpty"><Search size={26} /><h3>No Ticketmaster events found</h3><p>Try a broader event, artist, venue, or city.</p></div>
            ) : (
              <div className="searchResultGroups">
                {groupedSearchResults.nearby.length > 0 && (
                  <section className="searchResultGroup">
                    <h3>Events right beside you</h3>
                    <div className="searchResultGrid">
                      {groupedSearchResults.nearby.map((event) => (
                        <SearchResultCard key={event.id} event={event} added={trackedIds.has(event.id)} onAdd={() => addEvent(event)} />
                      ))}
                    </div>
                  </section>
                )}
                {groupedSearchResults.farther.length > 0 && (
                  <section className="searchResultGroup">
                    {submittedSearch.current?.coordinates && <h3>More events within {LOCATION_RADIUS_MILES} miles</h3>}
                    <div className="searchResultGrid">
                      {groupedSearchResults.farther.map((event) => (
                        <SearchResultCard key={event.id} event={event} added={trackedIds.has(event.id)} onAdd={() => addEvent(event)} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
            {!error && !loading && pageCount > 1 && (
              <nav className="resultPagination" aria-label="Search result pages">
                <button type="button" disabled={resultPage === 0} onClick={() => void searchTicketmaster(resultPage - 1)}>
                  Previous
                </button>
                <div className="resultPageNumbers">
                  {visibleResultPages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={resultPage === page ? "active" : ""}
                      aria-current={resultPage === page ? "page" : undefined}
                      aria-label={`Page ${page + 1}`}
                      onClick={() => void searchTicketmaster(page)}
                    >
                      {page + 1}
                    </button>
                  ))}
                </div>
                <span>Page {resultPage + 1} of {pageCount} · 10 per page</span>
                <button type="button" disabled={resultPage + 1 >= pageCount} onClick={() => void searchTicketmaster(resultPage + 1)}>
                  Next
                </button>
              </nav>
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
