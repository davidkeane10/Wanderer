/**
 * Trail data from OpenStreetMap via Overpass API.
 * Free, no API key required. Returns peaks, viewpoints, and hiking routes
 * near the user's location — comparable to what AllTrails surfaces.
 *
 * Uses a single combined query (no parallel requests) to avoid Overpass
 * rate-limiting. Falls back to a mirror endpoint if the primary times out.
 */

import type { FeedItem } from "../types/feed";

// Endpoints tried in order — first success wins
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

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
  remark?: string;
}

const SAC_SCALE_LABELS: Record<string, string> = {
  hiking: "Easy",
  mountain_hiking: "Moderate",
  demanding_mountain_hiking: "Challenging",
  alpine_hiking: "Hard",
  demanding_alpine_hiking: "Very Hard",
  difficult_alpine_hiking: "Expert",
};

const PLACE_TYPE_LABELS: Record<string, string> = {
  peak: "Mountain summit",
  viewpoint: "Scenic viewpoint",
  waterfall: "Waterfall",
  cave_entrance: "Cave entrance",
  beach: "Beach",
  hot_spring: "Hot spring",
};

const HISTORIC_LABELS: Record<string, string> = {
  ruins: "Historic ruins",
  monument: "Monument",
  archaeological_site: "Archaeological site",
};

const TOURISM_LABELS: Record<string, string> = {
  attraction: "Local attraction",
  museum: "Museum",
  camp_site: "Campground",
  picnic_site: "Picnic area",
};

function buildTrailDescription(tags: Record<string, string>): string {
  const parts: string[] = [];

  if (tags.natural && PLACE_TYPE_LABELS[tags.natural]) {
    parts.push(PLACE_TYPE_LABELS[tags.natural]);
  } else if (tags.historic && HISTORIC_LABELS[tags.historic]) {
    parts.push(HISTORIC_LABELS[tags.historic]);
  } else if (tags.tourism && TOURISM_LABELS[tags.tourism]) {
    parts.push(TOURISM_LABELS[tags.tourism]);
  } else if (
    tags.leisure === "nature_reserve" ||
    tags.boundary === "national_park" ||
    tags.boundary === "protected_area"
  ) {
    parts.push("Protected natural area");
  } else if (tags.leisure === "park") {
    parts.push("Public park");
  }

  if (tags.sac_scale) parts.push(`Difficulty: ${SAC_SCALE_LABELS[tags.sac_scale] ?? tags.sac_scale}`);
  if (tags.distance)  parts.push(`Distance: ${tags.distance}`);
  if (tags.ele)       parts.push(`Elevation: ${tags.ele}m`);
  if (tags.description) parts.push(tags.description);

  return parts.join(" · ");
}

function elementToFeedItem(el: OverpassElement): FeedItem | null {
  const tags = el.tags ?? {};
  const name = tags.name ?? tags["name:en"];
  if (!name) return null;

  let coords: { latitude: number; longitude: number } | null = null;

  if (el.type === "node") {
    const node = el as OverpassNode;
    // Nodes always carry lat/lon directly
    if (node.lat != null && node.lon != null) {
      coords = { latitude: node.lat, longitude: node.lon };
    }
  } else {
    // Ways and relations need the center computed by Overpass
    const wor = el as OverpassWayOrRelation;
    if (wor.center?.lat != null && wor.center?.lon != null) {
      coords = { latitude: wor.center.lat, longitude: wor.center.lon };
    }
  }

  // Skip elements with no usable coordinates — they can't appear on the map
  // and the radius filter can't validate them
  if (!coords) return null;

  const osmType =
    el.type === "node" ? "node" : el.type === "relation" ? "relation" : "way";

  // Classify activity type — keep everything as "trails" unless obviously not
  let activityType: FeedItem["activityType"] = "trails";
  if (tags.tourism === "museum") activityType = "arts";
  else if (tags.tourism === "camp_site") activityType = "backpacking";
  else if (tags.natural === "cave_entrance") activityType = "urbex";
  // Note: historic ruins stay as "trails" so they appear in hiking results

  // Trail distance: OSM `distance` tag is in km (e.g. "5.3")
  let trailDistanceKm: number | undefined;
  if (tags.distance) {
    const d = parseFloat(tags.distance);
    if (!isNaN(d)) trailDistanceKm = d;
  }

  // Elevation: `ascent` = total route gain (ways/relations); `ele` = altitude (peaks)
  let elevationGainM: number | undefined;
  if (tags.ascent) {
    const a = parseFloat(tags.ascent);
    if (!isNaN(a)) elevationGainM = a;
  } else if (el.type === "node" && tags.ele) {
    const e = parseFloat(tags.ele);
    if (!isNaN(e)) elevationGainM = e;
  }

  return {
    id: `osm_${el.id}`,
    source: "trails",
    activityType,
    title: name,
    description: buildTrailDescription(tags),
    imageUrl: null,
    externalUrl: `https://www.openstreetmap.org/${osmType}/${el.id}`,
    locationName: name,
    locationCoords: coords,
    score: null,
    commentCount: null,
    createdAt: null,
    sourceName: "OpenStreetMap",
    rating: null,
    trailDistanceKm,
    elevationGainM,
  };
}

/** Manual timeout wrapper — more compatible with RN/Hermes than AbortSignal.timeout */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run the Overpass query against the primary endpoint; if it fails or times out,
 * retry once against the mirror.
 */
async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  };

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, init, 65_000);
      if (!res.ok) {
        if (__DEV__) console.warn(`[AllTrails] ${endpoint} → HTTP ${res.status}`);
        continue;
      }
      const json: OverpassResponse = await res.json();
      if (__DEV__ && json.remark) {
        console.warn(`[AllTrails] Overpass remark:`, json.remark);
      }
      const elements = json.elements ?? [];
      if (elements.length > 0) return elements;
      // Empty response — try mirror in case primary returned nothing due to load
    } catch (err) {
      if (__DEV__) console.warn(`[AllTrails] ${endpoint} failed:`, err);
    }
  }

  return [];
}

/**
 * Fetch hiking trails, peaks, and viewpoints within radiusMeters of the given
 * coordinates using the OpenStreetMap Overpass API.
 *
 * Single query covering nodes (peaks, viewpoints, waterfalls), named ways
 * (paths, footways), and route relations. Falls back to a mirror endpoint
 * if the primary Overpass server is busy or rate-limits the request.
 */
export async function fetchNearbyTrails(
  latitude: number,
  longitude: number,
  radiusMeters = 50_000
): Promise<FeedItem[]> {
  // Overpass times out on large bounding boxes — cap at 25 km.
  // OSM trail data is dense; 25 km is plenty for a useful results set.
  const clampedRadius = Math.min(radiusMeters, 25_000);

  // Bounding box is much faster than `around:` on Overpass — the server can use
  // its spatial index directly instead of computing per-element circle membership.
  const latDelta = clampedRadius / 111_111;
  const lonDelta = clampedRadius / (111_111 * Math.cos((latitude * Math.PI) / 180));
  const s = (latitude  - latDelta).toFixed(6);
  const n = (latitude  + latDelta).toFixed(6);
  const w = (longitude - lonDelta).toFixed(6);
  const e = (longitude + lonDelta).toFixed(6);
  const bbox = `${s},${w},${n},${e}`;

  // Single query — no parallel requests to avoid Overpass rate-limiting.
  // node entries always carry lat/lon; way/relation entries use `out center`
  // so Overpass computes a centroid for them.
  const query = `
[out:json][timeout:55];
(
  node["natural"="peak"]["name"](${bbox});
  node["natural"="viewpoint"]["name"](${bbox});
  node["natural"="waterfall"]["name"](${bbox});
  node["natural"="beach"]["name"](${bbox});
  node["natural"="cave_entrance"]["name"](${bbox});
  node["natural"="hot_spring"]["name"](${bbox});
  node["tourism"="attraction"]["name"](${bbox});
  node["tourism"="camp_site"]["name"](${bbox});
  node["historic"="ruins"]["name"](${bbox});
  node["leisure"="nature_reserve"]["name"](${bbox});
  way["highway"="path"]["name"](${bbox});
  way["highway"="footway"]["name"](${bbox});
  way["highway"="track"]["name"]["sac_scale"](${bbox});
  way["leisure"="nature_reserve"]["name"](${bbox});
  way["boundary"="national_park"]["name"](${bbox});
  relation["route"="hiking"]["name"](${bbox});
  relation["route"="foot"]["name"](${bbox});
  relation["boundary"="national_park"]["name"](${bbox});
);
out center tags 60;
`.trim();

  const elements = await runOverpassQuery(query);

  if (__DEV__) {
    console.log(`[AllTrails] Raw elements from Overpass: ${elements.length}`);
  }

  const seen = new Set<number>();
  const items = elements
    .filter((el) => {
      if (seen.has(el.id)) return false;
      seen.add(el.id);
      return true;
    })
    .map(elementToFeedItem)
    .filter((item): item is FeedItem => item !== null);

  if (__DEV__) {
    console.log(`[AllTrails] Items after name+coord filter: ${items.length}`);
  }

  return items.slice(0, 60);
}
