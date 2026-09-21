"use client";

import type { EventSummary } from "@ticket-hub/contracts";
import { Heart, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function EventCard({ event }: { event: EventSummary }) {
  const [saved, setSaved] = useState(false);

  return (
    <article className="eventCard">
      <Link href={`/events/${event.slug}`} className="eventImageLink" aria-label={`View ${event.name}`}>
        <div className="eventImage" style={{ backgroundImage: `linear-gradient(180deg, transparent 45%, rgba(4, 13, 35, .45)), url(${event.imageUrl})` }}>
          <span className="eventBadge">From {money(event.minPriceCents)}</span>
        </div>
      </Link>
      <button
        type="button"
        className={`saveButton ${saved ? "saved" : ""}`}
        aria-label={saved ? "Remove from saved events" : "Save event"}
        aria-pressed={saved}
        onClick={() => setSaved((value) => !value)}
      >
        <Heart size={19} fill={saved ? "currentColor" : "none"} />
      </button>
      <Link href={`/events/${event.slug}`} className="eventCardBody">
        <div className="dateTile" aria-label={`${event.dateLabel} at ${event.timeLabel}`}>
          <span>{event.dateLabel.split(",")[0]}</span>
          <strong>{event.dateLabel.match(/\d+/)?.[0]}</strong>
        </div>
        <div>
          <p className="eventDate">{event.dateLabel} · {event.timeLabel}</p>
          <h3>{event.name}</h3>
          <p className="venueLine"><MapPin size={14} /> {event.venue.name}</p>
          <p className="priceLine">Tickets from <strong>{money(event.minPriceCents)}</strong></p>
        </div>
      </Link>
    </article>
  );
}
