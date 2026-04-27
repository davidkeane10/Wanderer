/**
 * Geocoding services.
 *
 * Primary: expo-location (device's Apple/Google geocoder — no rate limits, no API key).
 * Fallback: Photon by Komoot (open, no API key, not rate-limited like Nominatim).
 *
 * Nominatim was removed as primary because it aggressively rate-limits (HTTP 429).
 */

import * as ExpoLocation from "expo-location";

export interface GeocodedLocation {
  cityName: string;
  regionName: string;
  countryName: string;
  latitude: number;
  longitude: number;
}

export interface LocationSuggestion {
  displayName: string;   // "Corvallis, Oregon, United States"
  cityName: string;
  regionName: string;
  countryName: string;
  latitude: number;
  longitude: number;
}

const PHOTON_BASE = "https://photon.komoot.io";
const USER_AGENT = "SideQuests/1.0";

// ---------------------------------------------------------------------------
// Reverse geocoding (coords → city name)
// ---------------------------------------------------------------------------

/**
 * Reverse geocode using the device's native geocoder (Apple/Google).
 * Fast, reliable, no rate limits.
 */
async function reverseGeocodeExpo(
  latitude: number,
  longitude: number
): Promise<GeocodedLocation | null> {
  try {
    const results = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
    if (!results.length) return null;
    const r = results[0];
    const cityName = r.city ?? r.district ?? r.subregion ?? r.name ?? "";
    const regionName = r.region ?? "";
    const countryName = r.country ?? "";
    if (!cityName && !regionName) return null;
    return { cityName, regionName, countryName, latitude, longitude };
  } catch {
    return null;
  }
}

/**
 * Reverse geocode fallback using Photon (OpenStreetMap-based, no API key).
 */
async function reverseGeocodePhoton(
  latitude: number,
  longitude: number
): Promise<GeocodedLocation | null> {
  try {
    const url = `${PHOTON_BASE}/reverse?lat=${latitude}&lon=${longitude}&limit=1&lang=en`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const json: PhotonResponse = await res.json();
    const f = json.features?.[0];
    if (!f) return null;
    const p = f.properties;
    return {
      cityName: p.city ?? p.name ?? "",
      regionName: p.state ?? p.county ?? "",
      countryName: p.country ?? "",
      latitude,
      longitude,
    };
  } catch {
    return null;
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<GeocodedLocation | null> {
  const expo = await reverseGeocodeExpo(latitude, longitude);
  if (expo) return expo;
  return reverseGeocodePhoton(latitude, longitude);
}

// ---------------------------------------------------------------------------
// Forward geocoding (city name → coords)
// ---------------------------------------------------------------------------

/**
 * Forward geocode using expo-location's device geocoder.
 */
async function forwardGeocodeExpo(query: string): Promise<GeocodedLocation | null> {
  try {
    const results = await ExpoLocation.geocodeAsync(query);
    if (!results.length) return null;
    const { latitude, longitude } = results[0];
    // Reverse geocode to get proper city/region names
    return reverseGeocode(latitude, longitude);
  } catch {
    return null;
  }
}

/**
 * Forward geocode fallback using Photon.
 */
async function forwardGeocodePhoton(query: string): Promise<GeocodedLocation | null> {
  try {
    const suggestions = await searchLocationSuggestions(query, 1);
    return suggestions[0] ?? null;
  } catch {
    return null;
  }
}

export async function forwardGeocode(query: string): Promise<GeocodedLocation | null> {
  const expo = await forwardGeocodeExpo(query);
  if (expo) return expo;
  return forwardGeocodePhoton(query);
}

// ---------------------------------------------------------------------------
// Unrestricted Photon search (parks, forests, landmarks — any OSM type)
// searchLocationSuggestions filters to city-type results only; this variant
// accepts every Photon feature type so named places geocode correctly.
// ---------------------------------------------------------------------------

async function photonSearchAny(query: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const encoded = encodeURIComponent(query.trim());
    const url = `${PHOTON_BASE}/api/?q=${encoded}&limit=3&lang=en`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const json: PhotonResponse = await res.json();
    const f = json.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.geometry.coordinates;
    return { latitude: lat, longitude: lon };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wikipedia coordinates API — returns coords for any Wikipedia page title.
// Excellent for parks, forests, mountains, landmarks, and historic sites.
// ---------------------------------------------------------------------------

async function geocodeViaWikipedia(
  title: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php` +
      `?action=query&prop=coordinates&titles=${encodeURIComponent(title)}` +
      `&format=json&origin=*`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    const pages = Object.values(json?.query?.pages ?? {}) as Record<string, unknown>[];
    for (const page of pages) {
      const coords = (page as { coordinates?: { lat: number; lon: number }[] }).coordinates;
      const c = coords?.[0];
      if (c?.lat !== undefined && c?.lon !== undefined) {
        return { latitude: c.lat, longitude: c.lon };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Smart multi-strategy geocoder for named places (trails, parks, urbex sites)
// ---------------------------------------------------------------------------

/**
 * Resolves coordinates for a result that has a title and/or locationName but
 * no coords yet. Tries multiple strategies in order of reliability:
 *   1. Photon with locationName + regional context (unrestricted type)
 *   2. Photon with clean title + regional context
 *   3. Wikipedia coordinates API by locationName
 *   4. Wikipedia coordinates API by title
 *
 * Returns null if all strategies fail so callers can skip safely.
 */
export async function geocodeNamedPlace(
  title: string,
  locationName: string | null,
  cityHint: string | null,
  regionHint: string | null
): Promise<{ latitude: number; longitude: number } | null> {
  // Strip Reddit-style noise: "[OC]", "(x-post)", trailing punctuation, etc.
  const cleanTitle = title
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Ordered query candidates — most specific first
  const photonCandidates: string[] = [];
  if (locationName && regionHint) photonCandidates.push(`${locationName}, ${regionHint}`);
  if (locationName && cityHint)   photonCandidates.push(`${locationName}, ${cityHint}`);
  if (locationName)               photonCandidates.push(locationName);
  if (cleanTitle.length > 4 && regionHint) photonCandidates.push(`${cleanTitle}, ${regionHint}`);
  if (cleanTitle.length > 4 && cityHint)   photonCandidates.push(`${cleanTitle}, ${cityHint}`);
  if (cleanTitle.length > 4)               photonCandidates.push(cleanTitle);

  for (const q of photonCandidates) {
    const result = await photonSearchAny(q).catch(() => null);
    if (result) return result;
  }

  // Wikipedia fallback — very reliable for named natural and historic places
  const wikiCandidates = [locationName, cleanTitle.length > 4 ? cleanTitle : null].filter(Boolean) as string[];
  for (const q of wikiCandidates) {
    const result = await geocodeViaWikipedia(q).catch(() => null);
    if (result) return result;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Autocomplete suggestions
// ---------------------------------------------------------------------------

interface PhotonFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    state?: string;
    county?: string;
    country?: string;
    type?: string;
    osm_type?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

// Place types we want to show as suggestions (skip streets, addresses, POIs)
const SUGGESTION_TYPES = new Set([
  "city", "town", "village", "hamlet", "neighbourhood", "suburb",
  "district", "county", "administrative", "municipality", "state",
]);

/**
 * Returns up to `limit` location suggestions for the given query using Photon.
 * Used for the autocomplete dropdown in the location picker.
 */
export async function searchLocationSuggestions(
  query: string,
  limit = 6
): Promise<LocationSuggestion[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const encoded = encodeURIComponent(query.trim());
    const url = `${PHOTON_BASE}/api/?q=${encoded}&limit=${limit * 2}&lang=en`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return [];
    const json: PhotonResponse = await res.json();

    const seen = new Set<string>();
    const results: LocationSuggestion[] = [];

    for (const f of json.features ?? []) {
      const p = f.properties;
      const type = p.type ?? "";
      if (!SUGGESTION_TYPES.has(type)) continue;

      const [lon, lat] = f.geometry.coordinates;
      const cityName = p.city ?? p.name ?? "";
      const regionName = p.state ?? p.county ?? "";
      const countryName = p.country ?? "";

      const displayParts = [cityName || p.name, regionName, countryName].filter(Boolean);
      const displayName = displayParts.join(", ");

      if (!displayName || seen.has(displayName.toLowerCase())) continue;
      seen.add(displayName.toLowerCase());

      results.push({ displayName, cityName, regionName, countryName, latitude: lat, longitude: lon });
      if (results.length >= limit) break;
    }

    return results;
  } catch {
    return [];
  }
}
