/**
 * Wikidata SPARQL — abandoned places near a coordinate.
 *
 * Queries the Wikidata SPARQL endpoint for ruins, abandoned buildings,
 * ghost towns, abandoned mines, and disused stations within a radius.
 *
 * No API key required. Free, public endpoint.
 * Docs: https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
 *
 * Wikidata item types used:
 *   Q102496  = ruins
 *   Q811430  = abandoned building
 *   Q2095040 = ghost town
 *   Q2811685 = abandoned mine
 *   Q2319498 = disused railway station
 *   Q1302406 = disused airport
 *   Q1785071 = abandoned mine shaft
 */

import type { FeedItem } from "../types/feed";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

const URBEX_TYPE_VALUES =
  "wd:Q102496 wd:Q811430 wd:Q2095040 wd:Q2811685 wd:Q2319498 wd:Q1302406 wd:Q1785071";

function buildQuery(lat: number, lon: number, radiusKm: number): string {
  return `
SELECT DISTINCT ?place ?placeLabel ?placeDescription ?coords ?image ?article WHERE {
  SERVICE wikibase:around {
    ?place wdt:P625 ?coords .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  VALUES ?type { ${URBEX_TYPE_VALUES} }
  ?place wdt:P31 ?type .
  OPTIONAL { ?place wdt:P18 ?image . }
  OPTIONAL {
    ?article schema:about ?place ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 40
`.trim();
}

interface SparqlValue {
  type: string;
  value: string;
}

interface SparqlBinding {
  place: SparqlValue;
  placeLabel?: SparqlValue;
  placeDescription?: SparqlValue;
  coords?: SparqlValue;
  image?: SparqlValue;
  article?: SparqlValue;
}

interface SparqlResponse {
  results: {
    bindings: SparqlBinding[];
  };
}

/** Parse a WKT literal like "Point(-0.1234 51.5678)" → { latitude, longitude } */
function parseWktPoint(wkt: string): { latitude: number; longitude: number } | null {
  const match = wkt.match(/Point\(([+-]?\d+\.?\d*)\s+([+-]?\d+\.?\d*)\)/i);
  if (!match) return null;
  return { longitude: parseFloat(match[1]), latitude: parseFloat(match[2]) };
}

/** Convert a Wikimedia Commons Special:FilePath URL to a 600px thumbnail. */
function wikimediaThumb(specialFilePath: string): string {
  return specialFilePath.includes("?")
    ? `${specialFilePath}&width=600`
    : `${specialFilePath}?width=600`;
}

function bindingToFeedItem(binding: SparqlBinding): FeedItem | null {
  const label = binding.placeLabel?.value;
  // Skip entries whose label is just the entity ID (no English label in Wikidata)
  if (!label || /^Q\d+$/.test(label)) return null;

  const coords = binding.coords?.value ? parseWktPoint(binding.coords.value) : null;
  if (!coords) return null;

  const entityId = binding.place.value.replace("http://www.wikidata.org/entity/", "");
  const description = binding.placeDescription?.value ?? "";
  const imageUrl = binding.image?.value ? wikimediaThumb(binding.image.value) : null;
  const externalUrl = binding.article?.value ?? `https://www.wikidata.org/wiki/${entityId}`;

  return {
    id: `wikidata_${entityId}`,
    source: "trails",
    activityType: "urbex",
    title: label,
    description: description.slice(0, 400),
    imageUrl,
    externalUrl,
    locationName: label,
    locationCoords: coords,
    score: null,
    commentCount: null,
    createdAt: null,
    sourceName: "Wikidata",
    rating: null,
  };
}

/**
 * Fetch abandoned/urbex places from Wikidata within radiusKm of the given coords.
 * Falls back silently to [] on any error.
 */
export async function fetchWikidataAbandonedPlaces(
  latitude: number,
  longitude: number,
  radiusKm = 25
): Promise<FeedItem[]> {
  const query = buildQuery(latitude, longitude, Math.min(radiusKm, 50));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(
      `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "SideQuestsApp/1.0",
        },
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timer));

    if (!res.ok) return [];

    const data: SparqlResponse = await res.json();
    const seen = new Set<string>();

    return data.results.bindings
      .map(bindingToFeedItem)
      .filter((item): item is FeedItem => {
        if (!item) return false;
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
  } catch {
    return [];
  }
}
