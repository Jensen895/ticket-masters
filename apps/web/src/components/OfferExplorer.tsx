"use client";

import type { EventDetail, Marketplace } from "@ticket-hub/contracts";
import { ArrowUpDown, Check, ChevronDown, Clock3, ExternalLink, Filter, Info, RefreshCw, SlidersHorizontal, Ticket } from "lucide-react";
import { useMemo, useState } from "react";

const sourceInitials: Record<Marketplace, string> = {
  ticketmaster: "TM",
  stubhub: "SH",
  seatgeek: "SG",
  "vivid-seats": "VS",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function OfferExplorer({ event }: { event: EventDetail }) {
  const [source, setSource] = useState<Marketplace | "all">("all");
  const [sort, setSort] = useState<"price" | "section">("price");
  const [quantity, setQuantity] = useState(2);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState("just now");

  const offers = useMemo(() => {
    const selected = source === "all" ? event.snapshot.offers : event.snapshot.offers.filter((offer) => offer.marketplace === source);
    return [...selected].sort((left, right) => sort === "price" ? left.priceCents - right.priceCents : left.section.localeCompare(right.section));
  }, [event.snapshot.offers, sort, source]);

  function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      setRefreshedAt("just now");
    }, 1200);
  }

  return (
    <section className="ticketWorkspace">
      <div className="mapPanel">
        <div className="mapToolbar">
          <button type="button"><Filter size={17} /> Filters</button>
          <button type="button">$128 – $450 <ChevronDown size={15} /></button>
          <button type="button">Any section <ChevronDown size={15} /></button>
        </div>
        <div className="seatMap" aria-label="Stylized Rose Bowl seating map">
          <div className="mapZoom"><button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button></div>
          <div className="stadium">
            <div className="stadiumRing ringOuter">
              {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ transform: `rotate(${index * 30}deg) translateY(-134px)` }}>{index + 1}</i>)}
            </div>
            <div className="stadiumRing ringMiddle" />
            <div className="stadiumField">
              <span>STAGE</span>
              <div />
              <div />
              <div />
            </div>
          </div>
          <div className="mapLegend"><i /> Available sections <span>Zoom in to see rows</span></div>
        </div>
      </div>

      <aside className="listingPanel">
        <div className="listingHeader">
          <div>
            <div className="liveStatus"><i /> Live comparison</div>
            <h2>{event.snapshot.offers.length * 113} tickets</h2>
            <p>Prices include estimated fees</p>
          </div>
          <button className="refreshButton" type="button" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? "spinning" : ""} />
            {refreshing ? "Checking…" : `Updated ${refreshedAt}`}
          </button>
        </div>

        <div className="quoteStrip" aria-label="Lowest price by marketplace">
          <button className={source === "all" ? "selected" : ""} type="button" onClick={() => setSource("all")}>
            <span className="sourceLogo allLogo">ALL</span><small>Best price</small><strong>{money(Math.min(...event.snapshot.quotes.map((quote) => quote.minimumPriceCents)))}</strong>
          </button>
          {event.snapshot.quotes.map((quote) => (
            <button className={source === quote.marketplace ? "selected" : ""} key={quote.marketplace} type="button" onClick={() => setSource(quote.marketplace)}>
              <span className="sourceLogo" style={{ backgroundColor: quote.color }}>{sourceInitials[quote.marketplace]}</span>
              <small>{quote.label}</small><strong>{money(quote.minimumPriceCents)}</strong>
            </button>
          ))}
        </div>

        <div className="listingControls">
          <div className="quantityPicker">
            <span>Tickets</span>
            {[1, 2, 3, 4].map((value) => <button type="button" key={value} onClick={() => setQuantity(value)} className={quantity === value ? "active" : ""}>{value}</button>)}
          </div>
          <button className="sortButton" type="button" onClick={() => setSort((value) => value === "price" ? "section" : "price")}>
            <ArrowUpDown size={15} /> {sort === "price" ? "Lowest price" : "Section"}
          </button>
        </div>

        <div className="offerList">
          {offers.map((offer, index) => (
            <article className={`offerCard ${index === 0 ? "bestOffer" : ""}`} key={offer.id}>
              {index === 0 && source === "all" && <div className="bestPriceLabel"><Check size={13} /> Best price</div>}
              <div className="offerSource"><span className={`sourceLogo source-${offer.marketplace}`}>{sourceInitials[offer.marketplace]}</span><span>{offer.marketplaceLabel}</span></div>
              <div className="offerSeat">
                <strong>{offer.section}</strong>
                <span>{offer.row} · {quantity} tickets together</span>
              </div>
              <div className="offerPrice">
                <strong>{money(offer.priceCents)}</strong>
                <span>each · fees included</span>
              </div>
              <a href={offer.deepLink} onClick={(click) => click.preventDefault()} aria-label={`View on ${offer.marketplaceLabel}`}><ExternalLink size={17} /></a>
            </article>
          ))}
          {offers.length === 0 && <div className="noOffers"><Ticket size={25} /><strong>No matching offers</strong><span>Try showing all marketplaces.</span></div>}
        </div>
        <div className="listingFinePrint"><Info size={14} /> Inventory is owned by each marketplace. Prices can change before checkout.</div>
      </aside>
    </section>
  );
}
