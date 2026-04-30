/**
 * Abandoned / urban-exploration locations from OpenStreetMap via Overpass API.
 * No API key required. Queries for abandoned buildings, ruins, derelict
 * factories, disused railways, and similar urbex-worthy structures.
 */

import type { FeedItem } from "../types/feed";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const OVERPASS_FALLBACKS = [
  OVERPASS_URL,
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function runOverpassQuery(query: string, timeoutMs = 50_000): Promise<OverpassElement[]> {
  for (const endpoint of OVERPASS_FALLBACKS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      const json: OverpassResponse = await response.json();
      const elements = json.elements ?? [];
      if (elements.length > 0) return elements;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  timestamp?: string; // ISO 8601 — present when query uses `out meta`
}

interface OverpassWayOrRelation {
  type: "way" | "relation";
  id: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
  timestamp?: string; // ISO 8601 — present when query uses `out meta`
}

type OverpassElement = OverpassNode | OverpassWayOrRelation;

interface OverpassResponse {
  elements: OverpassElement[];
}


/**
 * Returns true if OSM tags indicate the structure no longer exists physically.
 * Demolished/razed sites are excluded — there's nothing to visit.
 */
function isDemolished(tags: Record<string, string>): boolean {
  return (
    tags.demolished === "yes" ||
    tags.razed === "yes" ||
    tags.removed === "yes" ||
    tags.lifecycle === "demolished" ||
    tags["demolished:building"] != null ||
    tags["razed:building"] != null
  );
}

/**
 * Returns a short human-readable note on how confident we are that the place
 * is still abandoned, based on OSM check_date and the element's edit timestamp.
 *
 * check_date / survey:date — a mapper physically visited and confirmed the state.
 * timestamp               — last time *anyone* edited the element in OSM.
 *
 * Returns null when there is no date signal at all.
 */
function getVerificationNote(tags: Record<string, string>, timestamp?: string): string | null {
  const currentYear = new Date().getFullYear();

  // Explicit field survey beats everything — a human stood there and confirmed it
  const surveyDate = tags["check_date"] ?? tags["survey:date"] ?? tags["source:date"];
  if (surveyDate) {
    const year = new Date(surveyDate).getFullYear();
    if (isNaN(year)) return null;
    const age = currentYear - year;
    if (age <= 1) return `Verified on-site ${year}`;
    if (age <= 3) return `Surveyed ${year}`;
    return `Last surveyed ${year} — verify before visiting`;
  }

  // Fall back to the OSM edit timestamp (less reliable — any edit triggers it)
  if (timestamp) {
    const year = new Date(timestamp).getFullYear();
    if (isNaN(year)) return null;
    const age = currentYear - year;
    if (age <= 1) return `OSM updated ${year}`;
    if (age <= 3) return `OSM data from ${year}`;
    return `OSM data from ${year} — may have changed`;
  }

  return null;
}

/**
 * Returns true if OSM tags indicate the place is currently operational/active.
 * These should be excluded from urbex results even if they have a ruins/historic tag.
 */
function isCurrentlyOperational(tags: Record<string, string>): boolean {
  // opening_hours is the clearest signal — abandoned places don't have schedules
  if (tags.opening_hours) return true;

  // Active amenity tag (school, university, library, etc.) with no abandoned override
  if (tags.amenity && !tags["abandoned:amenity"]) return true;

  // Active shop or office
  if (tags.shop || tags.office) return true;

  // Tourism tags that indicate managed/active sites (ruins as a tourism tag is fine to keep)
  const activeTourism = ["museum", "attraction", "theme_park", "zoo", "aquarium", "gallery", "hotel"];
  if (tags.tourism && activeTourism.includes(tags.tourism)) return true;

  // Active building types — currently occupied / in-use structures
  const activeBuiltTypes = [
    "university", "school", "college", "hospital", "clinic",
    "church", "cathedral", "mosque", "temple", "synagogue",
    "library", "government", "civic", "retail", "commercial",
    "supermarket", "stadium", "sports_centre", "train_station",
  ];
  if (tags.building && activeBuiltTypes.includes(tags.building)) return true;

  // Leisure or sport tags without abandoned prefix → active recreational use
  if (tags.leisure && !tags["abandoned:leisure"]) return true;
  if (tags.sport) return true;

  // Active contact info strongly suggests current operation
  if (tags.phone || tags["contact:phone"] || tags["contact:email"]) return true;

  // Entrance fee = managed / paid attraction (not derelict)
  if (tags.fee && tags.fee !== "no") return true;

  // Named operator → someone is actively running it
  if (tags.operator) return true;

  // Brand tag = chain business (always active)
  if (tags.brand) return true;

  // landuse values that indicate active land
  const activeLanduse = ["commercial", "retail", "industrial", "institutional", "education"];
  if (tags.landuse && activeLanduse.includes(tags.landuse)) return true;

  return false;
}

function getTypeLabel(tags: Record<string, string>): string {
  if (tags["abandoned:building"]) return "Abandoned Building";
  if (tags["abandoned:industrial"]) return "Abandoned Factory";
  if (tags["abandoned:amenity"]) return "Abandoned " + tags["abandoned:amenity"];
  if (tags["ruins"] === "yes" || tags["historic"] === "ruins") return "Ruins";
  if (tags["disused:railway"]) return "Disused Railway";
  if (tags["building:condition"] === "abandoned") return "Abandoned Building";
  if (tags["abandoned"] === "yes") return "Abandoned Site";
  return "Urbex Site";
}

function buildDescription(tags: Record<string, string>, timestamp?: string): string {
  const parts: string[] = [];

  const typeLabel = getTypeLabel(tags);
  parts.push(typeLabel);

  if (tags.description) parts.push(tags.description);
  else if (tags.note) parts.push(tags.note);

  if (tags["start_date"]) parts.push(`Est. ${tags["start_date"]}`);
  if (tags["end_date"] || tags["abandoned:since"]) {
    parts.push(`Abandoned ${tags["end_date"] ?? tags["abandoned:since"]}`);
  }
  if (tags.website) parts.push("Has website");

  const verificationNote = getVerificationNote(tags, timestamp);
  if (verificationNote) parts.push(verificationNote);

  return parts.join(" · ");
}

function elementToFeedItem(el: OverpassElement): FeedItem | null {
  const tags = el.tags ?? {};
  const realName = tags.name ?? tags["name:en"] ?? tags["abandoned:name"] ?? null;

  if (!realName) return null;

  // Nothing to visit if the structure has been torn down
  if (isDemolished(tags)) return null;

  // Skip places that are still actively operated (e.g. university buildings
  // that happen to carry a historic=ruins or abandoned=yes tag in OSM).
  if (isCurrentlyOperational(tags)) return null;

  let coords: { latitude: number; longitude: number } | null = null;
  if (el.type === "node") {
    coords = { latitude: (el as OverpassNode).lat, longitude: (el as OverpassNode).lon };
  } else {
    const c = (el as OverpassWayOrRelation).center;
    if (c) coords = { latitude: c.lat, longitude: c.lon };
  }

  if (!coords) return null;

  const osmType = el.type === "node" ? "node" : el.type === "relation" ? "relation" : "way";

  return {
    id: `osm_urbex_${el.id}`,
    source: "trails",
    activityType: "urbex",
    title: realName,
    description: buildDescription(tags, el.timestamp),
    imageUrl: tags.image ?? tags.wikimedia_commons ?? null,
    externalUrl: `https://www.openstreetmap.org/${osmType}/${el.id}`,
    locationName: tags["addr:city"] ?? tags["addr:suburb"] ?? realName,
    locationCoords: coords,
    score: null,
    commentCount: null,
    createdAt: null,
    sourceName: "OpenStreetMap",
    rating: null,
  };
}

function elementToRailwayFeedItem(el: OverpassElement): FeedItem | null {
  const tags = el.tags ?? {};
  const isRailwayCorridor = tags.railway === "abandoned" || tags.railway === "disused";

  let coords: { latitude: number; longitude: number } | null = null;
  if (el.type === "node") {
    coords = { latitude: (el as OverpassNode).lat, longitude: (el as OverpassNode).lon };
  } else {
    const c = (el as OverpassWayOrRelation).center;
    if (c) coords = { latitude: c.lat, longitude: c.lon };
  }
  if (!coords) return null;

  if (isRailwayCorridor) {
    const name = tags.name ?? tags["name:en"] ?? tags["old_name"] ?? null;
    if (!name) return null;
    const label = tags.railway === "abandoned" ? "Abandoned Railway" : "Disused Railway";
    const descParts = [label];
    if (tags.description) descParts.push(tags.description);
    if (tags["start_date"]) descParts.push(`Built ${tags["start_date"]}`);
    if (tags.operator) descParts.push(`Former operator: ${tags.operator}`);
    const verificationNote = getVerificationNote(tags, el.timestamp);
    if (verificationNote) descParts.push(verificationNote);
    const osmType = el.type === "relation" ? "relation" : "way";
    return {
      id: `osm_rail_line_${el.id}`,
      source: "trails",
      activityType: "urbex",
      title: name,
      description: descParts.join(" · "),
      imageUrl: null,
      externalUrl: `https://www.openstreetmap.org/${osmType}/${el.id}`,
      locationName: name,
      locationCoords: coords,
      score: null,
      commentCount: null,
      createdAt: null,
      sourceName: "Railroad Corridor",
      rating: null,
    };
  }

  // Structure found along the railway — skip demolished sites, then reuse the
  // existing converter and stamp the Railroad Corridor source
  if (isDemolished(tags)) return null;
  const base = elementToFeedItem(el);
  if (!base) return null;
  return {
    ...base,
    id: `osm_rail_find_${el.id}`,
    sourceName: "Railroad Corridor",
    description: base.description
      ? `${base.description} · Along old railroad`
      : "Found along abandoned railroad corridor",
  };
}

/**
 * Fetch abandoned factories, industrial ruins, and derelict structures
 * that sit within 500 m of an old railroad corridor.
 *
 * Strategy: two-pass Overpass query.
 *   Pass 1 — collect every abandoned/disused railway way and relation in the
 *             bounding box into a named set (.railways).
 *   Pass 2 — query for abandoned structures within 500 m of that set, plus
 *             the railway lines themselves so users can see the full corridor.
 *
 * This mirrors the common urbex heuristic of following old rail lines to find
 * former factories, depots, water towers, and other industrial remnants that
 * were built specifically to serve the railroad.
 */
export async function fetchAbandonedAlongRailways(
  latitude: number,
  longitude: number,
  radiusMeters = 25_000
): Promise<FeedItem[]> {
  // Keep the bounding box reasonable — the inner `around:500` filter does the
  // heavy lifting, so a 30 km box returns railways up to 30 km away while only
  // surfacing structures within 500 m of their tracks.
  const clampedRadius = Math.min(radiusMeters, 30_000);
  const latDelta = clampedRadius / 111_111;
  const lonDelta = clampedRadius / (111_111 * Math.cos((latitude * Math.PI) / 180));
  const s = (latitude  - latDelta).toFixed(6);
  const n = (latitude  + latDelta).toFixed(6);
  const w = (longitude - lonDelta).toFixed(6);
  const e = (longitude + lonDelta).toFixed(6);
  const bbox = `${s},${w},${n},${e}`;

  const ACTIVE = `[!"amenity"][!"shop"][!"office"][!"tourism"][!"opening_hours"][!"operator"]`;

  const query = `
[out:json][timeout:50];
(
  way["railway"~"^(abandoned|disused)$"](${bbox});
  relation["railway"~"^(abandoned|disused)$"](${bbox});
)->.railways;
(
  node(around.railways:500)["abandoned:building"];
  way(around.railways:500)["abandoned:building"];
  node(around.railways:500)["abandoned:industrial"];
  way(around.railways:500)["abandoned:industrial"];
  node(around.railways:500)["abandoned:amenity"];
  way(around.railways:500)["abandoned:amenity"];
  node(around.railways:500)["abandoned"="yes"]${ACTIVE};
  way(around.railways:500)["abandoned"="yes"]${ACTIVE};
  node(around.railways:500)["building:condition"="abandoned"];
  way(around.railways:500)["building:condition"="abandoned"];
  node(around.railways:500)["ruins"="yes"]${ACTIVE};
  way(around.railways:500)["ruins"="yes"]${ACTIVE};
  node(around.railways:500)["historic"="ruins"]${ACTIVE};
  way(around.railways:500)["historic"="ruins"]${ACTIVE};
  way.railways;
  relation.railways;
);
out center tags meta 60;
`.trim();

  const elements = await runOverpassQuery(query);

  if (__DEV__) {
    console.log(`[AbandonedOSM] Railroad corridor query: ${elements.length} raw elements`);
  }

  const seen = new Set<number>();
  const items = elements
    .filter((el) => {
      if (seen.has(el.id)) return false;
      seen.add(el.id);
      return true;
    })
    .map(elementToRailwayFeedItem)
    .filter((item): item is FeedItem => item !== null);

  if (__DEV__) {
    console.log(`[AbandonedOSM] Railroad corridor: ${items.length} items after filtering`);
  }

  return items.slice(0, 60);
}

/**
 * Fetch abandoned buildings, ruins, and derelict structures within
 * radiusMeters of the given coordinates using the Overpass API.
 *
 * Uses a bounding-box filter (not `around:`) so Overpass can use its spatial
 * index — typically 3-5× faster. Falls back through mirror endpoints if the
 * primary server is busy.
 */
export async function fetchNearbyAbandonedPlaces(
  latitude: number,
  longitude: number,
  radiusMeters = 25_000
): Promise<FeedItem[]> {
  const clampedRadius = Math.min(radiusMeters, 25_000);
  const latDelta = clampedRadius / 111_111;
  const lonDelta = clampedRadius / (111_111 * Math.cos((latitude * Math.PI) / 180));
  const s = (latitude  - latDelta).toFixed(6);
  const n = (latitude  + latDelta).toFixed(6);
  const w = (longitude - lonDelta).toFixed(6);
  const e = (longitude + lonDelta).toFixed(6);
  const bbox = `${s},${w},${n},${e}`;

  // Active-place exclusions applied server-side to keep the response small
  const ACTIVE_EXCLUSIONS = `[!"amenity"][!"shop"][!"office"][!"tourism"][!"opening_hours"][!"fee"][!"operator"][!"brand"]`;

  const query = `
[out:json][timeout:35];
(
  node["abandoned"="yes"]${ACTIVE_EXCLUSIONS}(${bbox});
  way["abandoned"="yes"]${ACTIVE_EXCLUSIONS}(${bbox});
  node["abandoned:building"](${bbox});
  way["abandoned:building"](${bbox});
  node["building:condition"="abandoned"](${bbox});
  way["building:condition"="abandoned"](${bbox});
  node["ruins"="yes"]${ACTIVE_EXCLUSIONS}(${bbox});
  way["ruins"="yes"]${ACTIVE_EXCLUSIONS}(${bbox});
  node["historic"="ruins"]${ACTIVE_EXCLUSIONS}(${bbox});
  way["historic"="ruins"]${ACTIVE_EXCLUSIONS}(${bbox});
  relation["historic"="ruins"]${ACTIVE_EXCLUSIONS}(${bbox});
  way["disused:railway"](${bbox});
  node["abandoned:railway"](${bbox});
  way["abandoned:railway"](${bbox});
  way["abandoned:industrial"](${bbox});
  node["abandoned:amenity"](${bbox});
  way["abandoned:amenity"](${bbox});
);
out center tags meta 40;
`.trim();

  const elements = await runOverpassQuery(query);

  if (__DEV__) {
    console.log(`[AbandonedOSM] Nearby abandoned places: ${elements.length} raw elements`);
  }

  const items = elements
    .map(elementToFeedItem)
    .filter((item): item is FeedItem => item !== null);

  // Sort items with coordinates first so map pins appear as soon as results land
  items.sort((a, b) => (b.locationCoords ? 1 : 0) - (a.locationCoords ? 1 : 0));

  return items.slice(0, 40);
}
