import assert from "node:assert/strict";
import test from "node:test";
import type { TrackedEvent } from "@ticket-hub/contracts";
import { distanceInMiles, eventsWithinRadius, mapTicketmasterSearchData } from "./ticketmaster.js";

function event(id: string, latitude?: number, longitude?: number): TrackedEvent {
  return {
    id,
    name: `Event ${id}`,
    classification: "Music",
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
