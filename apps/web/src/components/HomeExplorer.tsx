"use client";

import type { EventCategory, EventSummary } from "@ticket-hub/contracts";
import { ArrowRight, CalendarDays, ChevronRight, MapPin, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { EventCard } from "./EventCard";

const categories: Array<"All" | EventCategory> = ["All", "Music", "Sports", "Arts", "Comedy"];

export function HomeExplorer({ events }: { events: EventSummary[] }) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("All");

  const visibleEvents = useMemo(() => {
    const normalized = submittedQuery.trim().toLowerCase();
    return events.filter((event) => {
      const categoryMatches = category === "All" || event.category === category;
      const queryMatches = !normalized || [event.name, event.venue.name, event.venue.city].some((value) => value.toLowerCase().includes(normalized));
      return categoryMatches && queryMatches;
    });
  }, [category, events, submittedQuery]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query);
    document.querySelector("#events")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <section className="hero">
        <div className="heroBackdrop" />
        <div className="heroGlow" />
        <div className="heroContent">
          <p className="eyebrow"><Sparkles size={15} /> One search. Every marketplace.</p>
          <h1>Find your seat.<br /><span>Keep the change.</span></h1>
          <p className="heroCopy">Compare real-time ticket prices from the sites you trust—without opening ten tabs.</p>
          <form className="heroSearch" role="search" onSubmit={submitSearch}>
            <div className="heroSearchField">
              <Search size={22} />
              <label>
                <span>What do you want to see?</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artist, team, venue or event" />
              </label>
            </div>
            <div className="heroLocation">
              <MapPin size={21} />
              <label>
                <span>Near</span>
                <input defaultValue="Los Angeles, CA" aria-label="Location" />
              </label>
            </div>
            <button type="submit">Search</button>
          </form>
          <div className="heroTrust">
            <span><Zap size={14} /> Prices refreshed live</span>
            <span><ShieldCheck size={14} /> Verified marketplaces</span>
            <span><CalendarDays size={14} /> All-in pricing</span>
          </div>
        </div>
      </section>

      <main>
        <section className="categoryBar" aria-label="Event categories">
          <div className="pageShell categoryInner">
            {categories.map((item) => (
              <button key={item} type="button" className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
                {item === "All" ? "All events" : item === "Arts" ? "Arts & Theater" : item}
              </button>
            ))}
          </div>
        </section>

        <section className="pageShell eventsSection" id="events">
          <div className="sectionHeading">
            <div>
              <p className="sectionKicker">Happening near you</p>
              <h2>{submittedQuery ? `Results for “${submittedQuery}”` : "Popular in Los Angeles"}</h2>
            </div>
            <button className="textButton" type="button">View all <ChevronRight size={17} /></button>
          </div>
          {visibleEvents.length > 0 ? (
            <div className="eventGrid">
              {visibleEvents.map((event) => <EventCard event={event} key={event.id} />)}
            </div>
          ) : (
            <div className="emptyState">
              <Search size={30} />
              <h3>No events found</h3>
              <p>Try a different artist, venue, city, or category.</p>
              <button type="button" onClick={() => { setQuery(""); setSubmittedQuery(""); setCategory("All"); }}>Clear search</button>
            </div>
          )}
        </section>

        <section className="compareBanner pageShell">
          <div>
            <p className="sectionKicker light">How ticket-masters works</p>
            <h2>Same seats. Smarter price.</h2>
            <p>We scan leading ticket marketplaces at once, normalize the fees, and surface the best value while it’s still available.</p>
            <Link href={`/events/${events[0]?.slug ?? ""}`}>See a live comparison <ArrowRight size={18} /></Link>
          </div>
          <div className="comparisonGraphic" aria-hidden="true">
            <div className="scanLine" />
            <div className="graphicCard cardOne"><span>SeatGeek</span><strong>$128</strong><small>All-in</small></div>
            <div className="graphicCard cardTwo"><span>StubHub</span><strong>$133</strong><small>All-in</small></div>
            <div className="graphicCard cardThree"><span>Ticketmaster</span><strong>$140</strong><small>All-in</small></div>
            <div className="bestTag">Best price</div>
          </div>
        </section>

        <section className="pageShell confidenceSection">
          <div className="confidenceIntro">
            <p className="sectionKicker">Search with confidence</p>
            <h2>Everything you need.<br />Nothing you don’t.</h2>
          </div>
          <div className="confidenceGrid">
            <article><span><Zap /></span><h3>Fresh, fast prices</h3><p>Listings refresh in parallel, so you see the newest available price in seconds.</p></article>
            <article><span><ShieldCheck /></span><h3>Trusted sources</h3><p>Compare inventory from established, verified ticket marketplaces.</p></article>
            <article><span><Sparkles /></span><h3>No surprise fees</h3><p>Compare estimated totals with mandatory fees included whenever available.</p></article>
          </div>
        </section>
      </main>
    </>
  );
}
