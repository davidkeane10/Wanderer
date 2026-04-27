/**
 * ArcGIS public feature services — US urban exploration data.
 *
 * No API key required. Both services are open public layers hosted on ArcGIS Online.
 *
 * Sources:
 *   1. National Register of Historic Places (NRHP)
 *      — registered historic buildings, ruins, sites, and structures across the US.
 *        Includes mines, asylums, forts, factories, depots, ghost towns and more.
 *      — Published by the National Park Service / Esri.
 *
 *   2. Haunted Places in the United States
 *      — community-sourced dataset of reported haunted locations.
 *        Includes asylums, cemeteries, former hospitals, old prisons, historic homes.
 *
 * Results are pre-filtered by keyword before hitting Ollama so only plausibly
 * urbex-relevant entries (ruins, derelict buildings, abandoned sites, haunted
 * locations) make it through. The Ollama step (filterArcGISForUrbex) then scores
 * survivors 1–10 and drops anything below 4.
 */

import type { FeedItem } from "../types/feed";

// ─── Endpoints ───────────────────────────────────────────────────────────────

const NRHP_ENDPOINT =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services" +
  "/National_Register_of_Historic_Places/FeatureServer/0/query";

// Public haunted places layer — ArcGIS Online community dataset
const HAUNTED_ENDPOINT =
  "https://services2.arcgis.com/FiaFA92sALzRP1N5/arcgis/rest/services" +
  "/Haunted_Places_in_the_United_States/FeatureServer/0/query";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ArcGISFeature {
  attributes: Record<string, string | number | null>;
  geometry?: { x: number; y: number };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  error?: { code: number; message: string };
}

// ─── Keyword filter ───────────────────────────────────────────────────────────

/**
 * NRHP includes many active, functional historic buildings (courthouses, post
 * offices, churches). These keywords identify entries that are likely to be
 * derelict, abandoned, or genuinely interesting for urban exploration.
 */
const URBEX_KEYWORDS = [
  "ruin", "ruins", "ruined", "ruinous",
  "abandon", "abandoned", "derelict", "disused", "disused",
  "mill", "grist mill", "windmill", "sawmill",
  "mine", "mining", "colliery", "shaft", "quarry",
  "factory", "industrial", "manufactor", "foundry", "furnace", "smelter",
  "asylum", "sanitarium", "sanatorium", "hospital", "poorhouse", "almshouse",
  "prison", "jail", "penitentiary",
  "fort", "fortification", "fortress", "bunker", "battery",
  "ghost town", "ghost", "haunt",
  "cemetery", "graveyard", "burial",
  "tunnel", "aqueduct", "canal", "lock",
  "depot", "station", "powerhouse", "pump house",
  "barn", "farmstead",
  "shipwreck", "wreck",
  "castle", "tower",
];

function hasUrbexKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return URBEX_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read the first non-empty value from a list of candidate field names. */
function getAttr(
  attrs: Record<string, string | number | null>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const val = attrs[key];
    if (val !== null && val !== undefined && String(val).trim()) {
      return String(val).trim();
    }
  }
  return "";
}

// ─── ArcGIS REST query ────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function queryArcGIS(
  endpoint: string,
  latitude: number,
  longitude: number,
  radiusMeters: number,
  extraParams: Record<string, string> = {}
): Promise<ArcGISFeature[]> {
  const params = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusMeters),
    units: "esriSRUnit_Meter",
    inSR: "4326",
    outSR: "4326",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: "60",
    f: "json",
    ...extraParams,
  });

  const res = await fetchWithTimeout(`${endpoint}?${params.toString()}`, {
    headers: { "User-Agent": "SideQuestsApp/1.0" },
  }, 15_000);

  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const data: ArcGISResponse = await res.json();
  if (data.error) throw new Error(`ArcGIS: ${data.error.message}`);
  return data.features ?? [];
}

// ─── NRHP converter ──────────────────────────────────────────────────────────

function nrhpToFeedItem(feature: ArcGISFeature): FeedItem | null {
  const attrs = feature.attributes;
  const geo = feature.geometry;
  if (!geo) return null;

  const name = getAttr(attrs, "RESNAME", "PropertyName", "name");
  if (!name) return null;

  const category = getAttr(attrs, "CATEGORY");
  const resType = getAttr(attrs, "RESTYPE", "ResourceType", "NRResource");

  // Skip purely ephemeral record types
  if (category === "Object") return null;

  // For Buildings and Districts, only include ones that pass the keyword filter
  if (
    (category === "Building" || category === "District") &&
    !hasUrbexKeyword(name) &&
    !hasUrbexKeyword(resType)
  ) {
    return null;
  }

  const city   = getAttr(attrs, "CITY");
  const state  = getAttr(attrs, "STATE_ABBR", "STATE", "STATEABBR", "State");
  const county = getAttr(attrs, "COUNTY", "County");
  const certDate = getAttr(attrs, "CERTDATE", "CertDate", "DateListed");

  const locationName =
    [city, state].filter(Boolean).join(", ") || county || name;

  const descParts: string[] = [];
  if (category) descParts.push(`${category} — National Register of Historic Places`);
  if (resType)  descParts.push(resType);
  if (county)   descParts.push(`${county} County`);
  if (certDate) descParts.push(`Listed ${certDate}`);

  const objectId =
    attrs["OBJECTID"] ?? attrs["FID"] ?? attrs["objectid"] ?? name.replace(/\W+/g, "_");

  return {
    id: `arcgis_nrhp_${objectId}`,
    source: "arcgis",
    sourceName: "Nat'l Register",
    activityType: "urbex",
    title: name,
    description: descParts.join(" · "),
    imageUrl: null,
    externalUrl: `https://www.nps.gov/subjects/nationalregister/index.htm`,
    locationName,
    locationCoords: { latitude: geo.y, longitude: geo.x },
    score: null,
    commentCount: null,
    createdAt: null,
    rating: null,
  };
}

// ─── Haunted places converter ─────────────────────────────────────────────────

function hauntedToFeedItem(feature: ArcGISFeature): FeedItem | null {
  const attrs = feature.attributes;
  const geo = feature.geometry;
  if (!geo) return null;

  const name = getAttr(
    attrs,
    "location", "LOCATION", "name", "NAME", "place", "PLACE", "Site_Name"
  );
  if (!name) return null;

  const city        = getAttr(attrs, "city", "CITY", "City");
  const state       = getAttr(attrs, "state", "STATE", "State");
  const description = getAttr(attrs, "description", "DESCRIPTION", "desc", "DESC", "Details");
  const type        = getAttr(attrs, "type", "TYPE", "category", "CATEGORY", "PlaceType");

  const locationName =
    [city, state].filter(Boolean).join(", ") || name;

  const descParts: string[] = [];
  if (type)        descParts.push(type);
  if (description) descParts.push(description.slice(0, 400));
  if (descParts.length === 0) descParts.push("Reported haunted location");

  const objectId =
    attrs["OBJECTID"] ?? attrs["FID"] ?? attrs["objectid"] ?? name.replace(/\W+/g, "_");

  return {
    id: `arcgis_haunted_${objectId}`,
    source: "arcgis",
    sourceName: "Haunted Places",
    activityType: "urbex",
    title: name,
    description: descParts.join(" · "),
    imageUrl: null,
    externalUrl: "",
    locationName,
    locationCoords: { latitude: geo.y, longitude: geo.x },
    score: null,
    commentCount: null,
    createdAt: null,
    rating: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch US urbex-relevant places from ArcGIS:
 *   - National Register of Historic Places (ruins, forts, mines, asylums, etc.)
 *   - Haunted Places in the United States
 *
 * Both sources are queried in parallel. Results are de-duped by id.
 * The NRHP results are pre-filtered by keyword to remove clearly non-urbex
 * entries before they reach the Ollama scoring step.
 *
 * @param latitude      User/search latitude
 * @param longitude     User/search longitude
 * @param radiusMeters  Search radius in metres (default 40 km)
 */
export async function fetchArcGISUrbexPlaces(
  latitude: number,
  longitude: number,
  radiusMeters = 40_000
): Promise<FeedItem[]> {
  const [nrhpResult, hauntedResult] = await Promise.allSettled([
    queryArcGIS(NRHP_ENDPOINT, latitude, longitude, radiusMeters),
    queryArcGIS(HAUNTED_ENDPOINT, latitude, longitude, radiusMeters),
  ]);

  const items: FeedItem[] = [];
  const seen = new Set<string>();

  function add(item: FeedItem | null) {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  if (nrhpResult.status === "fulfilled") {
    for (const f of nrhpResult.value) add(nrhpToFeedItem(f));
  }

  if (hauntedResult.status === "fulfilled") {
    for (const f of hauntedResult.value) add(hauntedToFeedItem(f));
  }

  return items;
}
