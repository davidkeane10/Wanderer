import { forwardGeocode, geocodeNamedPlace } from "./geocode";
import type { FeedItem } from "../types/feed";

interface CachedCoords {
  latitude: number;
  longitude: number;
}

// Module-level cache — persists for the app session, no repeat requests for the same place
const cache = new Map<string, CachedCoords | null>();
// Track in-flight promises so concurrent cards asking for the same place share one request
const inflight = new Map<string, Promise<CachedCoords | null>>();

export async function geocodeWithCache(
  locationName: string
): Promise<CachedCoords | null> {
  const key = locationName.toLowerCase().trim();

  if (cache.has(key)) return cache.get(key) ?? null;

  if (inflight.has(key)) return inflight.get(key)!;

  const promise = forwardGeocode(locationName).then((result) => {
    const coords = result
      ? { latitude: result.latitude, longitude: result.longitude }
      : null;
    cache.set(key, coords);
    inflight.delete(key);
    return coords;
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Attempts to resolve coordinates for a FeedItem that has no locationCoords.
 * Uses the smarter multi-strategy geocoder (Photon unrestricted + Wikipedia)
 * and shares the same dedup/cache layer so identical lookups are never repeated.
 *
 * Returns the updated item (with coords filled in) or the original if geocoding fails.
 */
export async function geocodeResultCoords(
  item: FeedItem,
  cityHint: string | null,
  regionHint: string | null
): Promise<FeedItem> {
  if (item.locationCoords) return item; // already has coords

  const cacheKey = `named:${item.title}|${item.locationName ?? ""}|${cityHint ?? ""}`.toLowerCase();

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey) ?? null;
    return cached ? { ...item, locationCoords: cached } : item;
  }

  if (inflight.has(cacheKey)) {
    const coords = await inflight.get(cacheKey)!;
    return coords ? { ...item, locationCoords: coords } : item;
  }

  const promise = geocodeNamedPlace(
    item.title,
    item.locationName ?? null,
    cityHint,
    regionHint
  ).then((coords) => {
    cache.set(cacheKey, coords);
    inflight.delete(cacheKey);
    return coords;
  });

  inflight.set(cacheKey, promise);
  const coords = await promise;
  return coords ? { ...item, locationCoords: coords } : item;
}
