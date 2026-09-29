import assert from "node:assert/strict";
import test from "node:test";
import type { TrackedEvent } from "@ticket-hub/contracts";
import { isTrackedEventExpired, removeExpiredTrackedEvents } from "./tracked-events.js";

function event(startsAt?: string): TrackedEvent {
  return {
    id: startsAt ?? "tba",
    name: "Test event",
    classification: "Music",
    startsAt,
    dateLabel: "Mon, Sep 28, 2026",
    timeLabel: "7:00 PM",
    venue: { name: "Test venue", city: "Los Angeles", region: "CA", timezone: "America/Los_Angeles" },
    ticketmasterUrl: "https://www.ticketmaster.com/event",
  };
}

test("an event expires at its exact start time", () => {
  const now = Date.parse("2026-09-29T02:00:00.000Z");
  assert.equal(isTrackedEventExpired(event("2026-09-29T01:59:59.999Z"), now), true);
  assert.equal(isTrackedEventExpired(event("2026-09-29T02:00:00.000Z"), now), true);
  assert.equal(isTrackedEventExpired(event("2026-09-29T02:00:00.001Z"), now), false);
});

test("events with missing or invalid start times remain tracked", () => {
  const now = Date.parse("2026-09-29T02:00:00.000Z");
  assert.equal(isTrackedEventExpired(event(), now), false);
  assert.equal(isTrackedEventExpired(event("Date TBA"), now), false);
});

test("removeExpiredTrackedEvents keeps only upcoming and TBA events", () => {
  const now = Date.parse("2026-09-29T02:00:00.000Z");
  const upcoming = event("2026-09-29T03:00:00.000Z");
  const tba = event();
  assert.deepEqual(
    removeExpiredTrackedEvents([event("2026-09-29T01:00:00.000Z"), upcoming, tba], now),
    [upcoming, tba],
  );
});
