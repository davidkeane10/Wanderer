/**
 * Geocoding services.
 *
 * Resolution order for named places (geocodeNamedPlace):
 *   1. Photon by Komoot — open, no rate limits, location-biased via lat/lon params.
 *   2. Nominatim (OpenStreetMap) — more thorough for historic/informal names,
 *      rate-limited to 1 req/sec per OSM policy. Used as fallback only.
 *   3. Wikipedia coords API — reliable for parks, landmarks, and historic sites.
 *
 * For reverse geocoding (coords → city):
 *   Primary: expo-location (device Apple/Google geocoder — no rate limits, no key).
 *   Fallback: Photon.
 *
 * All named-place resolvers accept optional userCoords + maxRadiusKm so results
 * that land outside the user's search area are discarded rather than shown with
 * a wrong pin.
 */

import * as ExpoLocation from "expo-location";
import { haversineKm } from "../utils/distance";

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

export interface Coords {
  latitude: number;
  longitude: number;
}

const PHOTON_BASE = "https://photon.komoot.io";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "SideQuests/1.0";

// ---------------------------------------------------------------------------
// Coordinate validation
// ---------------------------------------------------------------------------

/**
 * Returns true if `point` is within `radiusKm` of `center`.
 * Used to discard geocoded results that landed in the wrong region.
 */
export function isWithinRadius(
  point: Coords,
  center: Coords,
  radiusKm: number
): boolean {
  return haversineKm(center.latitude, center.longitude, point.latitude, point.longitude) <= radiusKm;
}

// ---------------------------------------------------------------------------
// Reverse geocoding (coords → city name)
// ---------------------------------------------------------------------------

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
// Photon forward search — unrestricted type, optional location bias
// ---------------------------------------------------------------------------

/**
 * Photon accepts `lat`/`lon` as a soft bias — results near those coordinates
 * are ranked higher without hard-restricting to a bbox.
 */
async function photonSearchAny(
  query: string,
  biasLat?: number,
  biasLon?: number
): Promise<Coords | null> {
  try {
    let url = `${PHOTON_BASE}/api/?q=${encodeURIComponent(query.trim())}&limit=3&lang=en`;
    if (biasLat !== undefined && biasLon !== undefined) {
      url += `&lat=${biasLat}&lon=${biasLon}`;
    }
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
// Nominatim forward search — more thorough for informal/historic names
// Rate-limited to 1 req/sec per OpenStreetMap usage policy.
// ---------------------------------------------------------------------------

let _lastNominatimMs = 0;

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Nominatim search with a viewbox derived from userCoords so results that are
 * geographically close are ranked first. `bounded=0` means it still searches
 * outside the viewbox if nothing is found inside.
 *
 * Returns null immediately if called within 1 second of the previous call
 * (fail-fast rate limit — caller falls through to the next strategy).
 */
async function nominatimSearch(
  query: string,
  userCoords?: Coords | null,
  maxRadiusKm = 100
): Promise<Coords | null> {
  const now = Date.now();
  if (now - _lastNominatimMs < 1_100) return null; // rate-limit: skip if too soon
  _lastNominatimMs = now;

  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      limit: "3",
      addressdetails: "0",
    });

    if (userCoords) {
      const clampedKm = Math.min(maxRadiusKm * 1.5, 200);
      const latDelta = clampedKm / 111;
      const lonDelta = clampedKm / (111 * Math.cos((userCoords.latitude * Math.PI) / 180));
      // Nominatim viewbox format: left,top,right,bottom = minLon,maxLat,maxLon,minLat
      const viewbox = [
        (userCoords.longitude - lonDelta).toFixed(4),
        (userCoords.latitude  + latDelta).toFixed(4),
        (userCoords.longitude + lonDelta).toFixed(4),
        (userCoords.latitude  - latDelta).toFixed(4),
      ].join(",");
      params.set("viewbox", viewbox);
      params.set("bounded", "0");
    }

    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const results: NominatimResult[] = await res.json();
    if (!results.length) return null;

    return { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OSM name search via Overpass — finds exact mapped features by name
// ---------------------------------------------------------------------------

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/**
 * Searches OpenStreetMap directly for a feature with a matching name inside a
 * bounding box around userCoords. Returns the centre-point of the first match.
 *
 * This is the highest-precision strategy: it finds the actual mapped object
 * rather than a geocoder's best guess, and pulls its exact coordinates along
 * with any OSM tags (condition, address, description) for free.
 *
 * Only called when userCoords is available — the bbox prevents the query from
 * scanning the whole planet.
 */
async function osmNameSearch(
  name: string,
  userCoords: Coords,
  radiusKm: number
): Promise<Coords | null> {
  const clampedKm = Math.min(radiusKm * 1.5, 100);
  const latDelta = clampedKm / 111;
  const lonDelta = clampedKm / (111 * Math.cos((userCoords.latitude * Math.PI) / 180));
  const s = (userCoords.latitude  - latDelta).toFixed(5);
  const n = (userCoords.latitude  + latDelta).toFixed(5);
  const w = (userCoords.longitude - lonDelta).toFixed(5);
  const e = (userCoords.longitude + lonDelta).toFixed(5);
  const bbox = `${s},${w},${n},${e}`;

  // Escape for Overpass regex — only allow word chars and spaces
  const safe = name.replace(/[^\w\s]/g, "").trim().slice(0, 80);
  if (!safe) return null;

  const query = `
[out:json][timeout:10];
(
  node["name"~"${safe}",i](${bbox});
  way["name"~"${safe}",i](${bbox});
  relation["name"~"${safe}",i](${bbox});
);
out center 5;
`.trim();

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) continue;
      const json = await res.json() as { elements?: Array<{
        type: string;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
      }> };
      const el = json.elements?.[0];
      if (!el) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat !== undefined && lon !== undefined) {
        return { latitude: lat, longitude: lon };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wikipedia coordinates API
// ---------------------------------------------------------------------------

async function geocodeViaWikipedia(
  title: string
): Promise<Coords | null> {
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
// Forward geocoding (city name → coords) — used for location picker
// ---------------------------------------------------------------------------

async function forwardGeocodeExpo(
  query: string
): Promise<GeocodedLocation | null> {
  try {
    const results = await ExpoLocation.geocodeAsync(query);
    if (!results.length) return null;
    const { latitude, longitude } = results[0];
    return reverseGeocode(latitude, longitude);
  } catch {
    return null;
  }
}

async function forwardGeocodePhoton(
  query: string,
  biasCoords?: Coords | null
): Promise<GeocodedLocation | null> {
  try {
    const suggestions = await searchLocationSuggestions(query, 1, biasCoords);
    return suggestions[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Forward geocode a city/region name to coordinates.
 * biasCoords nudges Photon toward results near the user when resolving
 * ambiguous city names (e.g. "Springfield").
 */
export async function forwardGeocode(
  query: string,
  biasCoords?: Coords | null
): Promise<GeocodedLocation | null> {
  const expo = await forwardGeocodeExpo(query);
  if (expo) return expo;
  return forwardGeocodePhoton(query, biasCoords);
}

// ---------------------------------------------------------------------------
// Smart multi-strategy geocoder for named places (trails, parks, urbex sites)
// ---------------------------------------------------------------------------

/**
 * Resolves coordinates for a named place using a cascade of strategies:
 *   0. OSM name search via Overpass (exact mapped feature — highest precision,
 *      only runs when userCoords is available to scope the bbox)
 *   1. Photon with location bias (soft — prefers results near userCoords)
 *   2. Nominatim with viewbox (harder spatial constraint around userCoords)
 *   3. Wikipedia coordinates API (reliable for parks, landmarks, historic sites)
 *
 * If userCoords + maxRadiusKm are provided, every resolved coordinate is
 * validated against the search area. Results outside are discarded so we never
 * put a pin in the wrong country.
 *
 * All new params are optional — existing callers work unchanged.
 */
export async function geocodeNamedPlace(
  title: string,
  locationName: string | null,
  cityHint: string | null,
  regionHint: string | null,
  userCoords?: Coords | null,
  maxRadiusKm?: number
): Promise<Coords | null> {
  const validationRadiusKm = maxRadiusKm ? maxRadiusKm * 2 : null; // 2× buffer

  function accept(coords: Coords): Coords | null {
    if (!userCoords || !validationRadiusKm) return coords;
    return isWithinRadius(coords, userCoords, validationRadiusKm) ? coords : null;
  }

  // Strip Reddit-style noise: "[OC]", "(x-post)", trailing punctuation, etc.
  const cleanTitle = title
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const biasLat = userCoords?.latitude;
  const biasLon = userCoords?.longitude;

  // ── Strategy 0: OSM name search (exact mapped feature, bbox-scoped) ────────
  // Only runs when we have userCoords — the bbox keeps the query fast and
  // prevents false matches far away. Highest precision for named places in OSM.
  if (userCoords && maxRadiusKm) {
    const osmCandidates = [locationName, cleanTitle.length > 4 ? cleanTitle : null].filter(Boolean) as string[];
    for (const q of osmCandidates) {
      const result = await osmNameSearch(q, userCoords, maxRadiusKm).catch(() => null);
      if (result) {
        const validated = accept(result);
        if (validated) return validated;
      }
    }
  }

  // ── Strategy 1: Photon with location bias ─────────────────────────────────
  // Build candidates most-specific-first so the first hit is most likely correct.
  const photonCandidates: string[] = [];
  if (locationName && regionHint) photonCandidates.push(`${locationName}, ${regionHint}`);
  if (locationName && cityHint)   photonCandidates.push(`${locationName}, ${cityHint}`);
  if (locationName)               photonCandidates.push(locationName);
  if (cleanTitle.length > 4 && regionHint) photonCandidates.push(`${cleanTitle}, ${regionHint}`);
  if (cleanTitle.length > 4 && cityHint)   photonCandidates.push(`${cleanTitle}, ${cityHint}`);
  if (cleanTitle.length > 4)               photonCandidates.push(cleanTitle);

  for (const q of photonCandidates) {
    const result = await photonSearchAny(q, biasLat, biasLon).catch(() => null);
    if (result) {
      const validated = accept(result);
      if (validated) return validated;
    }
  }

  // ── Strategy 2: Nominatim with viewbox around userCoords ──────────────────
  const nominatimCandidates: string[] = [];
  if (locationName && regionHint) nominatimCandidates.push(`${locationName} ${regionHint}`);
  if (locationName && cityHint)   nominatimCandidates.push(`${locationName} ${cityHint}`);
  if (locationName)               nominatimCandidates.push(locationName);
  if (cleanTitle.length > 4 && regionHint) nominatimCandidates.push(`${cleanTitle} ${regionHint}`);
  if (cleanTitle.length > 4 && cityHint)   nominatimCandidates.push(`${cleanTitle} ${cityHint}`);

  for (const q of nominatimCandidates) {
    const result = await nominatimSearch(q, userCoords, maxRadiusKm).catch(() => null);
    if (result) {
      const validated = accept(result);
      if (validated) return validated;
    }
  }

  // ── Strategy 3: Wikipedia coordinates API ────────────────────────────────
  const wikiCandidates = [
    locationName,
    cleanTitle.length > 4 ? cleanTitle : null,
  ].filter(Boolean) as string[];

  for (const q of wikiCandidates) {
    const result = await geocodeViaWikipedia(q).catch(() => null);
    if (result) {
      const validated = accept(result);
      if (validated) return validated;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Confidence-scored resolution — wraps geocodeNamedPlace with source metadata
// ---------------------------------------------------------------------------

export type GeocodeSource = "osm" | "photon" | "nominatim" | "wikipedia";

export interface ResolvedLocation {
  coords: Coords;
  /** 0–1 confidence derived from which strategy resolved the coords */
  confidence: number;
  /** Which geocoding strategy produced this result */
  source: GeocodeSource;
}

/**
 * Like geocodeNamedPlace but also returns the source and a confidence score.
 * Callers that need to decide how much to trust a result (e.g. whether to show
 * a pin vs. silently drop it) should use this variant.
 *
 * Confidence tiers:
 *   0.95 — OSM name search  (exact mapped feature in the user's area)
 *   0.80 — Photon biased    (geocoder hit near the user's coords)
 *   0.70 — Nominatim viewbox (geocoder hit within the search bbox)
 *   0.60 — Wikipedia coords  (reliable for named landmarks, may be imprecise)
 */
export async function geocodeNamedPlaceWithConfidence(
  title: string,
  locationName: string | null,
  cityHint: string | null,
  regionHint: string | null,
  userCoords?: Coords | null,
  maxRadiusKm?: number
): Promise<ResolvedLocation | null> {
  const validationRadiusKm = maxRadiusKm ? maxRadiusKm * 2 : null;

  function accept(coords: Coords): Coords | null {
    if (!userCoords || !validationRadiusKm) return coords;
    return isWithinRadius(coords, userCoords, validationRadiusKm) ? coords : null;
  }

  const cleanTitle = title
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const biasLat = userCoords?.latitude;
  const biasLon = userCoords?.longitude;

  // Strategy 0: OSM
  if (userCoords && maxRadiusKm) {
    const osmCandidates = [locationName, cleanTitle.length > 4 ? cleanTitle : null].filter(Boolean) as string[];
    for (const q of osmCandidates) {
      const result = await osmNameSearch(q, userCoords, maxRadiusKm).catch(() => null);
      if (result) {
        const validated = accept(result);
        if (validated) return { coords: validated, confidence: 0.95, source: "osm" };
      }
    }
  }

  // Strategy 1: Photon biased
  const photonCandidates: string[] = [];
  if (locationName && regionHint) photonCandidates.push(`${locationName}, ${regionHint}`);
  if (locationName && cityHint)   photonCandidates.push(`${locationName}, ${cityHint}`);
  if (locationName)               photonCandidates.push(locationName);
  if (cleanTitle.length > 4 && regionHint) photonCandidates.push(`${cleanTitle}, ${regionHint}`);
  if (cleanTitle.length > 4 && cityHint)   photonCandidates.push(`${cleanTitle}, ${cityHint}`);
  if (cleanTitle.length > 4)               photonCandidates.push(cleanTitle);

  for (const q of photonCandidates) {
    const result = await photonSearchAny(q, biasLat, biasLon).catch(() => null);
    if (result) {
      const validated = accept(result);
      if (validated) return { coords: validated, confidence: 0.80, source: "photon" };
    }
  }

  // Strategy 2: Nominatim viewbox
  const nominatimCandidates: string[] = [];
  if (locationName && regionHint) nominatimCandidates.push(`${locationName} ${regionHint}`);
  if (locationName && cityHint)   nominatimCandidates.push(`${locationName} ${cityHint}`);
  if (locationName)               nominatimCandidates.push(locationName);
  if (cleanTitle.length > 4 && regionHint) nominatimCandidates.push(`${cleanTitle} ${regionHint}`);
  if (cleanTitle.length > 4 && cityHint)   nominatimCandidates.push(`${cleanTitle} ${cityHint}`);

  for (const q of nominatimCandidates) {
    const result = await nominatimSearch(q, userCoords, maxRadiusKm).catch(() => null);
    if (result) {
      const validated = accept(result);
      if (validated) return { coords: validated, confidence: 0.70, source: "nominatim" };
    }
  }

  // Strategy 3: Wikipedia
  const wikiCandidates = [locationName, cleanTitle.length > 4 ? cleanTitle : null].filter(Boolean) as string[];
  for (const q of wikiCandidates) {
    const result = await geocodeViaWikipedia(q).catch(() => null);
    if (result) {
      const validated = accept(result);
      if (validated) return { coords: validated, confidence: 0.60, source: "wikipedia" };
    }
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
  limit = 6,
  biasCoords?: Coords | null
): Promise<LocationSuggestion[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    let url = `${PHOTON_BASE}/api/?q=${encodeURIComponent(query.trim())}&limit=${limit * 2}&lang=en`;
    if (biasCoords) {
      url += `&lat=${biasCoords.latitude}&lon=${biasCoords.longitude}`;
    }
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
