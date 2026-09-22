"use client";

import type { TrackedEvent } from "@ticket-hub/contracts";
import { CalendarDays, Check, MapPin, Plus } from "lucide-react";
import Link from "next/link";

export function SearchResultCard({ event, added, onAdd }: { event: TrackedEvent; added: boolean; onAdd: () => void }) {
  return (
    <article className="searchResultCard">
      <div
        className={`searchResultImage ${event.imageUrl ? "" : "eventImageFallback"}`}
        style={event.imageUrl ? { backgroundImage: `url(${event.imageUrl})` } : undefined}
        aria-hidden="true"
      />
      <div className="searchResultBody">
        <span className="classificationPill">{event.classification}{event.genre ? ` · ${event.genre}` : ""}</span>
        <h3>{event.name}</h3>
        <p><CalendarDays size={15} /> {event.dateLabel} · {event.timeLabel}</p>
        <p><MapPin size={15} /> {event.venue.name}{event.venue.city ? `, ${event.venue.city}` : ""}</p>
      </div>
      <div className="searchResultAction">
        <button type="button" className={added ? "added" : ""} onClick={onAdd} disabled={added}>
          {added ? <><Check size={17} /> Added</> : <><Plus size={17} /> Add event</>}
        </button>
        {added && <Link href={`/events/${event.id}`}>View details</Link>}
      </div>
    </article>
  );
}
