"use client";

import type { EventRecommendation } from "@ticket-hub/contracts";
import { CalendarDays, MapPin, Plus, Ticket } from "lucide-react";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function SuggestionCard({
  recommendation,
  onAdd,
}: {
  recommendation: EventRecommendation;
  onAdd: () => void;
}) {
  const { event } = recommendation;
  return (
    <article className="suggestionCard">
      <div
        className={`suggestionImage ${event.imageUrl ? "" : "eventImageFallback"}`}
        style={event.imageUrl ? { backgroundImage: `url(${event.imageUrl})` } : undefined}
        aria-hidden="true"
      >
        <span className="suggestionGenre">{event.genre ?? event.classification}</span>
      </div>
      <div className="suggestionBody">
        <p className="suggestionReason">{recommendation.reason}</p>
        <h3>{event.name}</h3>
        <p><CalendarDays size={14} /> {event.dateLabel} · {event.timeLabel}</p>
        <p><MapPin size={14} /> {event.venue.name}{event.venue.city ? ` · ${event.venue.city}` : ""}</p>
      </div>
      <div className="suggestionFooter">
        <div className="suggestionPrice">
          <span><Ticket size={14} /> Lowest public price</span>
          {recommendation.lowestPriceCents !== undefined ? (
            <><strong>{dollars.format(recommendation.lowestPriceCents / 100)}</strong><small>{recommendation.lowestPriceMarketplace}</small></>
          ) : (
            <strong className="priceUnavailable">Not listed yet</strong>
          )}
        </div>
        <button type="button" onClick={onAdd}><Plus size={17} /> Add event</button>
      </div>
    </article>
  );
}
