/**
 * Abandoned / urban-exploration locations from OpenStreetMap via Overpass API.
 * No API key required. Queries for abandoned buildings, ruins, derelict
 * factories, disused railways, and similar urbex-worthy structures.
 */

import type { FeedItem } from "../types/feed";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OverpassWayOrRelation {
  type: "way" | "relation";
  id: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

type OverpassElement = OverpassNode | OverpassWayOrRelation;

interface OverpassResponse {
  elements: OverpassElement[];
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

function buildDescription(tags: Record<string, string>): string {
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

  return parts.join(" · ");
}

function elementToFeedItem(el: OverpassElement): FeedItem | null {
  const tags = el.tags ?? {};
  const realName = tags.name ?? tags["name:en"] ?? tags["abandoned:name"] ?? null;

  // Skip unnamed items — "Ruins" / "Abandoned Site" as both title and
  // description is useless; OSM has thousands of untagged nodes like this.
  if (!realName) return null;

  // Skip places that are still actively operated (e.g. university buildings
  // that happen to carry a historic=ruins or abandoned=yes tag in OSM).
  if (isCurrentlyOperational(tags)) return null;

  const name = realName;

  let coords: { latitude: number; longitude: number } | null = null;
  if (el.type === "node") {
    coords = { latitude: (el as OverpassNode).lat, longitude: (el as OverpassNode).lon };
  } else {
    const c = (el as OverpassWayOrRelation).center;
    if (c) coords = { latitude: c.lat, longitude: c.lon };
  }

  // Skip elements with no coords
  if (!coords) return null;

  const osmType = el.type === "node" ? "node" : el.type === "relation" ? "relation" : "way";

  return {
    id: `osm_urbex_${el.id}`,
    source: "trails", // reuse "trails" source type for OSM items
    activityType: "urbex",
    title: name,
    description: buildDescription(tags),
    imageUrl: tags.image ?? tags.wikimedia_commons ?? null,
    externalUrl: `https://www.openstreetmap.org/${osmType}/${el.id}`,
    locationName: tags["addr:city"] ?? tags["addr:suburb"] ?? name,
    locationCoords: coords,
    score: null,
    commentCount: null,
    createdAt: null,
    sourceName: "OpenStreetMap",
    rating: null,
  };
}

/**
 * Fetch abandoned buildings, ruins, and derelict structures within
 * radiusMeters of the given coordinates using the Overpass API.
 */
export async function fetchNearbyAbandonedPlaces(
  latitude: number,
  longitude: number,
  radiusMeters = 25000
): Promise<FeedItem[]> {
  const r = radiusMeters;
  const loc = `${latitude},${longitude}`;

  // Query covers the most common OSM tagging patterns for abandoned/urbex sites.
  // Negative filters ([!"key"]) are applied at the API level so active operational
  // places (university buildings, restaurants, managed tourist sites, etc.) are
  // excluded before the response is even sent — reducing noise and payload size.
  const ACTIVE_EXCLUSIONS = `[!"amenity"][!"shop"][!"office"][!"tourism"][!"opening_hours"][!"fee"][!"operator"][!"brand"]`;
  const query = `
[out:json][timeout:25];
(
  node["abandoned"="yes"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  way["abandoned"="yes"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  node["abandoned:building"](around:${r},${loc});
  way["abandoned:building"](around:${r},${loc});
  node["building:condition"="abandoned"](around:${r},${loc});
  way["building:condition"="abandoned"](around:${r},${loc});
  node["ruins"="yes"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  way["ruins"="yes"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  node["historic"="ruins"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  way["historic"="ruins"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  relation["historic"="ruins"]${ACTIVE_EXCLUSIONS}(around:${r},${loc});
  way["disused:railway"](around:${r},${loc});
  node["abandoned:railway"](around:${r},${loc});
  way["abandoned:railway"](around:${r},${loc});
  way["abandoned:industrial"](around:${r},${loc});
  node["abandoned:amenity"](around:${r},${loc});
  way["abandoned:amenity"](around:${r},${loc});
);
out center tags 40;
  `.trim();

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) throw new Error(`Overpass error: ${response.status}`);

  const json: OverpassResponse = await response.json();

  return json.elements
    .map(elementToFeedItem)
    .filter((item): item is FeedItem => item !== null)
    .slice(0, 40);
}
