import assert from "node:assert/strict";
import test from "node:test";
import type { TrackedEvent } from "@ticket-hub/contracts";
import {
  buildTicketmasterSearchResponse,
  distanceInMiles,
  eventsWithinRadius,
  mapTicketmasterSearchData,
  sortEventsByPreferredRadiusThenDate,
} from "./ticketmaster.js";

function event(id: string, latitude?: number, longitude?: number, startsAt = "2026-09-29T19:00:00-07:00"): TrackedEvent {
  return {
    id,
    name: `Event ${id}`,
    classification: "Music",
    startsAt,
    dateLabel: "Tue, Sep 29, 2026",
    timeLabel: "7:00 PM",
    venue: { name: "Venue", city: "City", region: "CA", timezone: "America/Los_Angeles", latitude, longitude },
    ticketmasterUrl: "https://www.ticketmaster.com/event",
  };
}

test("distanceInMiles calculates geographic distance", () => {
  const losAngeles = { latitude: 34.0522, longitude: -118.2437 };
  const sanDiego = { latitude: 32.7157, longitude: -117.1611 };
  assert.ok(Math.abs(distanceInMiles(losAngeles, sanDiego) - 111.5) < 1);
});

test("sortEventsByPreferredRadiusThenDate prioritizes the 100-mile area before date", () => {
  const center = { latitude: 34.0522, longitude: -118.2437 };
  const now = Date.parse("2026-09-29T12:00:00-07:00");
  const sorted = sortEventsByPreferredRadiusThenDate([
    event("later-near", 34.0522, -118.2437, "2026-10-01T19:00:00-07:00"),
    event("sooner-far", 37.7749, -122.4194, "2026-09-30T19:00:00-07:00"),
    event("sooner-near-farther", 33.8366, -117.9143, "2026-09-30T19:00:00-07:00"),
    event("sooner-near-closest", 34.043, -118.267, "2026-09-30T19:00:00-07:00"),
    event("date-tba", 37.7749, -122.4194, "TBA"),
  ], center, 100, now);

  assert.deepEqual(sorted.map(({ id }) => id), [
    "sooner-near-closest",
    "sooner-near-farther",
    "later-near",
    "sooner-far",
    "date-tba",
  ]);
});

test("buildTicketmasterSearchResponse filters before making ten-item pages", () => {
  const events = Array.from({ length: 13 }, (_, index) => ({
    ...event(String(index), 34.0522, -118.2437, `2026-10-${String(index + 1).padStart(2, "0")}T19:00:00-07:00`),
    classification: index === 12 ? "Sports" as const : "Music" as const,
  }));
  const firstPage = buildTicketmasterSearchResponse(events, {
    page: 0,
    pageSize: 10,
    classification: "Music",
    now: Date.parse("2026-09-29T12:00:00-07:00"),
  });
  const secondPage = buildTicketmasterSearchResponse(events, {
    page: 1,
    pageSize: 10,
    classification: "Music",
    now: Date.parse("2026-09-29T12:00:00-07:00"),
  });

  assert.equal(firstPage.items.length, 10);
  assert.equal(secondPage.items.length, 2);
  assert.equal(firstPage.total, 12);
  assert.equal(firstPage.pageCount, 2);
});

test("eventsWithinRadius excludes distant events and venues without coordinates", () => {
  const center = { latitude: 34.0522, longitude: -118.2437 };
  assert.deepEqual(eventsWithinRadius([
    event("near", 34.043, -118.267),
    event("far", 37.768, -122.387),
    event("unknown"),
  ], center, 100).map(({ id }) => id), ["near"]);
});

test("mapTicketmasterSearchData retains venue coordinates", () => {
  const result = mapTicketmasterSearchData({
    total: 1,
    events: [{
      id: "event-1",
      title: "Test event",
      url: "https://www.ticketmaster.com/event",
      venue: { name: "Venue", city: "Los Angeles", latitude: 34.043, longitude: -118.267 },
    }],
  }, 0, 50);
  assert.equal(result.items[0]?.venue.latitude, 34.043);
  assert.equal(result.items[0]?.venue.longitude, -118.267);
  assert.equal(result.pageCount, 1);
});
