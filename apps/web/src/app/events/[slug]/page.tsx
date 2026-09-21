import { findDemoEvent } from "@ticket-hub/contracts/demo";
import { CalendarDays, ChevronRight, Clock3, MapPin, Share2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OfferExplorer } from "@/components/OfferExplorer";
import { SiteHeader } from "@/components/SiteHeader";

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = findDemoEvent(slug);
  if (!event) notFound();

  return (
    <div className="detailPage">
      <SiteHeader compact />
      <div className="eventHero">
        <div className="eventHeroBackdrop" style={{ backgroundImage: `url(${event.imageUrl})` }} />
        <div className="pageShell">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link><ChevronRight size={13} /><span>{event.category}</span><ChevronRight size={13} /><span>{event.name}</span>
          </nav>
          <div className="eventHeroContent">
            <div className="eventPoster" style={{ backgroundImage: `url(${event.imageUrl})` }} />
            <div className="eventTitleBlock">
              <p className="eventCategory">{event.category} · Trending</p>
              <h1>{event.name}</h1>
              <div className="eventMeta">
                <span><CalendarDays size={18} /><b>{event.dateLabel}</b></span>
                <span><Clock3 size={18} />{event.timeLabel}</span>
                <span><MapPin size={18} />{event.venue.name}, {event.venue.city}</span>
              </div>
            </div>
            <button className="shareButton" type="button"><Share2 size={18} /> Share</button>
          </div>
        </div>
      </div>
      <div className="eventNotice"><span>High demand</span> This event is popular. We’re checking all marketplaces for the latest prices.</div>
      <OfferExplorer event={event} />
    </div>
  );
}
