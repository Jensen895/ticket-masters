"use client";

import type { TrackedEvent } from "@ticket-hub/contracts";
import { MapPin, Trash2 } from "lucide-react";
import Link from "next/link";

export function EventCard({ event, onRemove }: { event: TrackedEvent; onRemove: () => void }) {
  return (
    <article className="eventCard">
      <Link href={`/events/${event.id}`} className="eventImageLink" aria-label={`View ${event.name}`}>
        <div
          className={`eventImage ${event.imageUrl ? "" : "eventImageFallback"}`}
          style={event.imageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(4, 13, 35, .45)), url(${event.imageUrl})` } : undefined}
        >
          <span className="eventBadge">{event.classification}</span>
        </div>
      </Link>
      <button
        type="button"
        className="saveButton removeEventButton"
        aria-label={`Remove ${event.name} from my events`}
        onClick={onRemove}
      >
        <Trash2 size={17} />
      </button>
      <Link href={`/events/${event.id}`} className="eventCardBody">
        <div className="dateTile" aria-label={`${event.dateLabel} at ${event.timeLabel}`}>
          <span>{event.dateLabel.split(",")[0]}</span>
          <strong>{event.dateLabel.match(/\d+/)?.[0] ?? "—"}</strong>
        </div>
        <div>
          <p className="eventDate">{event.dateLabel} · {event.timeLabel}</p>
          <h3>{event.name}</h3>
          <p className="venueLine"><MapPin size={14} /> {event.venue.name}{event.venue.city ? ` · ${event.venue.city}` : ""}</p>
          <p className="eventCardAction">View event and seat map →</p>
        </div>
      </Link>
    </article>
  );
}
