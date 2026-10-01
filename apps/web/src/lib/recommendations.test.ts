import assert from "node:assert/strict";
import test from "node:test";
import type { TrackedEvent } from "@ticket-hub/contracts";
import {
  buildRecommendationProfile,
  rankRecommendationCandidates,
  recommendationCenter,
} from "./recommendations.js";

function event(
  id: string,
  genre: string | undefined,
  classification: TrackedEvent["classification"] = "Music",
  startsAt = "2026-11-01T19:00:00-07:00",
): TrackedEvent {
  return {
    id,
    name: `Event ${id}`,
    genre,
    classification,
    startsAt,
    dateLabel: "Sun, Nov 1, 2026",
    timeLabel: "7:00 PM",
    venue: {
      name: "Venue",
      city: "Los Angeles",
      region: "CA",
      timezone: "America/Los_Angeles",
      latitude: 34.0522,
      longitude: -118.2437,
    },
    ticketmasterUrl: `https://www.ticketmaster.com/event/${id}`,
  };
}

test("buildRecommendationProfile weights genres by the user's added events", () => {
  const profile = buildRecommendationProfile([
    event("one", "Pop"),
    event("two", "Rock"),
    event("three", "Pop"),
  ]);

  assert.deepEqual(profile.genres, [
    { name: "Pop", count: 2 },
    { name: "Rock", count: 1 },
  ]);
});

test("genre matching tolerates punctuation differences in specific subgenres", () => {
  const tracked = [event("saved", "K-Pop")];
  const ranked = rankRecommendationCandidates([
    event("matching", "KPop"),
    event("too-broad", "Pop"),
  ], tracked, buildRecommendationProfile(tracked), {
    now: Date.parse("2026-09-30T00:00:00-07:00"),
  });

  assert.deepEqual(ranked.map(({ id }) => id), ["matching"]);
});

test("rankRecommendationCandidates excludes saved, expired, unrelated, and add-on events", () => {
  const tracked = [event("saved", "Pop"), event("another", "Pop")];
  const profile = buildRecommendationProfile(tracked);
  const candidates = [
    event("saved", "Pop"),
    event("rock", "Rock"),
    event("past", "Pop", "Music", "2026-09-01T19:00:00-07:00"),
    { ...event("parking", "Pop"), name: "Arena Parking" },
    event("match-two", "Pop", "Music", "2026-10-03T19:00:00-07:00"),
    event("match-one", "Pop", "Music", "2026-10-02T19:00:00-07:00"),
  ];

  const ranked = rankRecommendationCandidates(candidates, tracked, profile, {
    now: Date.parse("2026-09-30T00:00:00-07:00"),
    limit: 5,
  });

  assert.deepEqual(ranked.map(({ id }) => id), ["match-one", "match-two"]);
});

test("recommendationCenter averages the user's most common saved-event city", () => {
  const first = event("first", "Pop");
  const second = event("second", "Pop");
  second.venue.latitude = 36.0522;
  second.venue.longitude = -116.2437;
  const elsewhere = event("elsewhere", "Rock");
  elsewhere.venue.city = "New York";
  elsewhere.venue.latitude = 40.7128;
  elsewhere.venue.longitude = -74.006;

  assert.deepEqual(recommendationCenter([first, second, elsewhere]), {
    latitude: 35.0522,
    longitude: -117.2437,
  });
});
