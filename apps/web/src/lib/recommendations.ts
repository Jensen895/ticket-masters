import type { EventClassification, TrackedEvent } from "@ticket-hub/contracts";
import { distanceInMiles } from "./ticketmaster";

export interface RecommendationPreference {
  name: string;
  count: number;
}

export interface RecommendationProfile {
  genres: RecommendationPreference[];
  classifications: Array<{ name: EventClassification; count: number }>;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

function rankedCounts<T extends string>(values: T[]) {
  const counts = new Map<string, { name: T; count: number }>();
  for (const value of values) {
    const key = normalized(value);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { name: value, count: 1 });
  }
  return [...counts.values()].sort((first, second) => (
    second.count - first.count || first.name.localeCompare(second.name)
  ));
}

export function buildRecommendationProfile(events: TrackedEvent[]): RecommendationProfile {
  return {
    genres: rankedCounts(events.flatMap((event) => event.genre?.trim() ? [event.genre.trim()] : [])),
    classifications: rankedCounts(events.map((event) => event.classification)),
  };
}

export function recommendationCenter(events: TrackedEvent[]) {
  const coordinates = events.flatMap((event) => (
    event.venue.latitude !== undefined && event.venue.longitude !== undefined
      ? [{
        city: normalized(event.venue.city),
        latitude: event.venue.latitude,
        longitude: event.venue.longitude,
      }]
      : []
  ));
  if (!coordinates.length) return undefined;
  const cityCounts = new Map<string, number>();
  for (const point of coordinates) {
    if (point.city) cityCounts.set(point.city, (cityCounts.get(point.city) ?? 0) + 1);
  }
  const dominantCity = [...cityCounts].sort((first, second) => second[1] - first[1])[0]?.[0];
  const localCoordinates = dominantCity
    ? coordinates.filter((point) => point.city === dominantCity)
    : coordinates;
  return {
    latitude: localCoordinates.reduce((total, point) => total + point.latitude, 0) / localCoordinates.length,
    longitude: localCoordinates.reduce((total, point) => total + point.longitude, 0) / localCoordinates.length,
  };
}

function preferenceCount<T extends string>(preferences: Array<{ name: T; count: number }>, value?: string) {
  if (!value) return 0;
  return preferences.find((preference) => normalized(preference.name) === normalized(value))?.count ?? 0;
}

function startTime(event: TrackedEvent) {
  const time = event.startsAt ? Date.parse(event.startsAt) : Number.NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function distance(event: TrackedEvent, center?: { latitude: number; longitude: number }) {
  const { latitude, longitude } = event.venue;
  return center && latitude !== undefined && longitude !== undefined
    ? distanceInMiles(center, { latitude, longitude })
    : Number.POSITIVE_INFINITY;
}

export function rankRecommendationCandidates(
  candidates: TrackedEvent[],
  trackedEvents: TrackedEvent[],
  profile: RecommendationProfile,
  options: {
    center?: { latitude: number; longitude: number };
    limit?: number;
    now?: number;
  } = {},
) {
  const trackedIds = new Set(trackedEvents.map((event) => event.id));
  const seen = new Set<string>();
  const now = options.now ?? Date.now();
  const hasGenrePreferences = profile.genres.length > 0;

  return candidates
    .filter((event) => {
      if (trackedIds.has(event.id) || seen.has(event.id)) return false;
      seen.add(event.id);
      const startsAt = startTime(event);
      if (!Number.isFinite(startsAt) || startsAt <= now) return false;
      if (event.status === "Canceled" || /\b(?:parking|hotel package|vip club|fast lane|lounge access)\b/i.test(event.name)) return false;
      return hasGenrePreferences
        ? preferenceCount(profile.genres, event.genre) > 0
        : preferenceCount(profile.classifications, event.classification) > 0;
    })
    .sort((first, second) => {
      const firstPreference = hasGenrePreferences
        ? preferenceCount(profile.genres, first.genre)
        : preferenceCount(profile.classifications, first.classification);
      const secondPreference = hasGenrePreferences
        ? preferenceCount(profile.genres, second.genre)
        : preferenceCount(profile.classifications, second.classification);
      if (firstPreference !== secondPreference) return secondPreference - firstPreference;
      const distanceDelta = distance(first, options.center) - distance(second, options.center);
      if (Number.isFinite(distanceDelta) && distanceDelta !== 0) return distanceDelta;
      return startTime(first) - startTime(second) || first.name.localeCompare(second.name);
    })
    .slice(0, options.limit ?? 5);
}

export function recommendationReason(event: TrackedEvent, profile: RecommendationProfile) {
  const genre = profile.genres.find((preference) => normalized(preference.name) === normalized(event.genre ?? ""));
  return genre
    ? `Because you follow ${genre.name}`
    : `Because you follow ${event.classification.toLowerCase()} events`;
}
