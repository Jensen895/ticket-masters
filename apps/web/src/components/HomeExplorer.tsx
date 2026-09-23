"use client";

import type {
  EventClassification,
  TicketmasterSearchResponse,
  TrackedEvent,
} from "@ticket-hub/contracts";
import {
  CalendarDays,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EventCard } from "./EventCard";
import { SearchResultCard } from "./SearchResultCard";
import { readTrackedEvents, writeTrackedEvents } from "@/lib/tracked-events";

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

export function HomeExplorer() {
  const [trackedEvents, setTrackedEvents] = useState<TrackedEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [results, setResults] = useState<TrackedEvent[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultPage, setResultPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [classification, setClassification] = useState<(typeof classifications)[number]>("All");

  useEffect(() => {
    setTrackedEvents(readTrackedEvents(window.localStorage));
    setHydrated(true);
  }, []);

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
                <span>City (optional)</span>
                <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Los Angeles" />
              </label>
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
                <h2>{loading ? "Searching…" : error ? "Search unavailable" : `${resultTotal.toLocaleString()} event${resultTotal === 1 ? "" : "s"} found`}</h2>
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
