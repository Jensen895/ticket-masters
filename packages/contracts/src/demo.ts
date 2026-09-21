import type { EventDetail, EventSummary, PriceSnapshot, TicketOffer } from "./index";

const now = "2026-09-21T18:32:00.000Z";

export const demoEvents: EventSummary[] = [
  {
    id: "evt_rose_bowl_01",
    slug: "the-weeknd-after-hours-til-dawn-pasadena",
    name: "The Weeknd: After Hours Til Dawn",
    category: "Music",
    dateLabel: "Sat, Oct 10",
    timeLabel: "7:00 PM",
    startsAt: "2026-10-11T02:00:00.000Z",
    venue: { name: "Rose Bowl", city: "Pasadena", region: "CA", timezone: "America/Los_Angeles" },
    imageUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=84",
    accent: "#5530e8",
    minPriceCents: 12800,
    currency: "USD",
  },
  {
    id: "evt_dodgers_02",
    slug: "giants-at-dodgers-los-angeles",
    name: "San Francisco Giants at Los Angeles Dodgers",
    category: "Sports",
    dateLabel: "Tue, Sep 29",
    timeLabel: "7:10 PM",
    startsAt: "2026-09-30T02:10:00.000Z",
    venue: { name: "Dodger Stadium", city: "Los Angeles", region: "CA", timezone: "America/Los_Angeles" },
    imageUrl: "https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=1200&q=84",
    accent: "#1767bd",
    minPriceCents: 4100,
    currency: "USD",
  },
  {
    id: "evt_olivia_03",
    slug: "olivia-rodrigo-guts-world-tour-inglewood",
    name: "Olivia Rodrigo: GUTS World Tour",
    category: "Music",
    dateLabel: "Fri, Oct 16",
    timeLabel: "8:00 PM",
    startsAt: "2026-10-17T03:00:00.000Z",
    venue: { name: "Kia Forum", city: "Inglewood", region: "CA", timezone: "America/Los_Angeles" },
    imageUrl: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=84",
    accent: "#9d43d8",
    minPriceCents: 9600,
    currency: "USD",
  },
  {
    id: "evt_lakers_04",
    slug: "golden-state-warriors-at-los-angeles-lakers",
    name: "Golden State Warriors at Los Angeles Lakers",
    category: "Sports",
    dateLabel: "Sun, Oct 25",
    timeLabel: "6:30 PM",
    startsAt: "2026-10-26T01:30:00.000Z",
    venue: { name: "Crypto.com Arena", city: "Los Angeles", region: "CA", timezone: "America/Los_Angeles" },
    imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=84",
    accent: "#f6bb24",
    minPriceCents: 11900,
    currency: "USD",
  },
  {
    id: "evt_hamilton_05",
    slug: "hamilton-los-angeles",
    name: "Hamilton",
    category: "Arts",
    dateLabel: "Wed, Nov 4",
    timeLabel: "7:30 PM",
    startsAt: "2026-11-05T03:30:00.000Z",
    venue: { name: "Hollywood Pantages Theatre", city: "Los Angeles", region: "CA", timezone: "America/Los_Angeles" },
    imageUrl: "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1200&q=84",
    accent: "#c79a3d",
    minPriceCents: 7900,
    currency: "USD",
  },
  {
    id: "evt_comedy_06",
    slug: "john-mulaney-mister-whatever-hollywood",
    name: "John Mulaney: Mister Whatever",
    category: "Comedy",
    dateLabel: "Sat, Nov 14",
    timeLabel: "8:00 PM",
    startsAt: "2026-11-15T04:00:00.000Z",
    venue: { name: "Hollywood Bowl", city: "Los Angeles", region: "CA", timezone: "America/Los_Angeles" },
    imageUrl: "https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=1200&q=84",
    accent: "#df3d73",
    minPriceCents: 6700,
    currency: "USD",
  },
];

const demoOffers: TicketOffer[] = [
  { id: "off_01", marketplace: "seatgeek", marketplaceLabel: "SeatGeek", section: "Section 18-L", row: "Row 42", quantity: 2, priceCents: 12800, feesIncluded: true, deepLink: "#", capturedAt: now },
  { id: "off_02", marketplace: "stubhub", marketplaceLabel: "StubHub", section: "Section 18-H", row: "Row 31", quantity: 4, priceCents: 13300, feesIncluded: true, deepLink: "#", capturedAt: now },
  { id: "off_03", marketplace: "ticketmaster", marketplaceLabel: "Ticketmaster", section: "Section 17-L", row: "Row 48", quantity: 2, priceCents: 13950, feesIncluded: true, deepLink: "#", capturedAt: now },
  { id: "off_04", marketplace: "vivid-seats", marketplaceLabel: "Vivid Seats", section: "Section 21-H", row: "Row 23", quantity: 2, priceCents: 14600, feesIncluded: true, deepLink: "#", capturedAt: now },
  { id: "off_05", marketplace: "seatgeek", marketplaceLabel: "SeatGeek", section: "Section 6", row: "Row 18", quantity: 2, priceCents: 17100, feesIncluded: true, deepLink: "#", capturedAt: now },
  { id: "off_06", marketplace: "stubhub", marketplaceLabel: "StubHub", section: "Field A4", row: "Row 12", quantity: 2, priceCents: 24800, feesIncluded: true, deepLink: "#", capturedAt: now },
];

export const demoSnapshot: PriceSnapshot = {
  eventId: "evt_rose_bowl_01",
  version: "snap_demo_01",
  status: "fresh",
  capturedAt: now,
  nextRefreshEligibleAt: "2026-09-21T18:32:10.000Z",
  quotes: [
    { marketplace: "seatgeek", label: "SeatGeek", color: "#20a775", minimumPriceCents: 12800, listingCount: 184, status: "fresh", capturedAt: now },
    { marketplace: "stubhub", label: "StubHub", color: "#5b34da", minimumPriceCents: 13300, listingCount: 241, status: "fresh", capturedAt: now },
    { marketplace: "ticketmaster", label: "Ticketmaster", color: "#076cdf", minimumPriceCents: 13950, listingCount: 96, status: "fresh", capturedAt: now },
    { marketplace: "vivid-seats", label: "Vivid Seats", color: "#ec1754", minimumPriceCents: 14600, listingCount: 158, status: "fresh", capturedAt: now },
  ],
  offers: demoOffers,
};

export const demoEventDetail: EventDetail = {
  ...demoEvents[0]!,
  description: "The Weeknd brings the After Hours Til Dawn stadium tour to Pasadena for one night at the Rose Bowl.",
  venueAddress: "1001 Rose Bowl Drive, Pasadena, CA 91103",
  importantInfo: ["All prices shown include estimated mandatory fees.", "Marketplace inventory and prices can change at any time."],
  snapshot: demoSnapshot,
};

export function findDemoEvent(slugOrId: string): EventDetail | undefined {
  const event = demoEvents.find((candidate) => candidate.slug === slugOrId || candidate.id === slugOrId);
  if (!event) return undefined;

  const priceDelta = event.minPriceCents - demoEventDetail.minPriceCents;
  return {
    ...demoEventDetail,
    ...event,
    snapshot: {
      ...demoSnapshot,
      eventId: event.id,
      quotes: demoSnapshot.quotes.map((quote) => ({
        ...quote,
        minimumPriceCents: Math.max(2900, quote.minimumPriceCents + priceDelta),
      })),
      offers: demoSnapshot.offers.map((offer) => ({
        ...offer,
        priceCents: Math.max(2900, offer.priceCents + priceDelta),
      })),
    },
  };
}
