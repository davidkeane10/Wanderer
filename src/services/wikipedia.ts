/**
 * Wikipedia Nearby — places of interest near a coordinate.
 *
 * Uses two Wikipedia APIs:
 *   1. Geosearch  — finds Wikipedia articles within a radius
 *   2. Query/prop — fetches intro text + thumbnail for each article
 *
 * Both endpoints return Access-Control-Allow-Origin: * so they work
 * from the browser without a proxy. No API key required.
 */

import type { ActivityType, FeedItem } from "../types/feed";

const WIKI_API = "https://en.wikipedia.org/w/api.php";

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}


interface GeoSearchPage {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist: number;
}

interface WikiPage {
  pageid: number;
  title: string;
  extract?: string;
  thumbnail?: { source: string };
  coordinates?: Array<{ lat: number; lon: number; primary: string }>;
}

// Strong positive signals — must be present in title OR extract for the page to be included
const OUTDOOR_TITLE_SIGNALS =
  /\b(trail|trails|trailhead|hike|hikes|hiking|peak|summit|mountain|waterfall|falls|viewpoint|vista|overlook|gorge|canyon|ridge|wilderness|national park|state park|nature reserve|wildlife refuge|forest|beach|lake|river|creek|cave|hot spring|campground|camp site|campsite|lava|butte|dunes|cliff|bluff|tide pool)\b/i;

const CULTURAL_TITLE_SIGNALS =
  /\b(museum|art gallery|art center|theater|theatre|opera house|historic site|archaeological site|brewery|winery|distillery|restaurant|farmers market|botanical garden|aquarium|zoo)\b/i;

const ADVENTURE_TITLE_SIGNALS =
  /\b(climbing area|climbing crag|bouldering|kayaking|whitewater|rapids|via ferrata|mountain bike trail|bike park|ski area|ski resort)\b/i;

// Eerie/explorable places — checked BEFORE generic exclusions so "Abandoned State Hospital"
// or "Riverside Asylum" aren't silently dropped by the exclusion list.
const URBEX_TITLE_SIGNALS =
  /\b(abandoned|derelict|disused|ruined|decommissioned|defunct|former)\b.{0,40}\b(hospital|factory|mill|prison|jail|station|warehouse|school|church|mine|power plant|fort|fortress|building|facility|complex)\b|\b(ghost town|asylum|sanatorium|sanitarium|penitentiary|reformatory|almshouse|workhouse|poorhouse|silo|silos|grain elevator|ruins|ruin|urbex)\b/i;

// Anything matching these in the TITLE is excluded — checked AFTER urbex signals
const TITLE_EXCLUSIONS =
  /\b(hall of fame|dormitory|residence|library|tower|courthouse|city hall|state house|office|headquarters|stadium|arena|coliseum|gymnasium|auditorium|department|faculty|college|university|institute|laboratory|lab|clinic|bridge|dam|pipeline|railroad|railway|road|highway|street|avenue|boulevard|county|district|ward|precinct|senator|congressman|governor|president|mayor|general|colonel|regiment|battalion|company|corporation|inc\b|llc\b|band|album|song|film|movie|tv|television|podcast|novel|book|ship|vessel|aircraft|satellite)\b/i;

function isVisitablePage(title: string, extract: string): boolean {
  // Urbex signal takes priority — let through before generic exclusions
  if (URBEX_TITLE_SIGNALS.test(title)) return true;

  // Hard exclude on title
  if (TITLE_EXCLUSIONS.test(title)) return false;

  // Must have a strong positive signal in the title OR a strong outdoor signal in the extract
  if (OUTDOOR_TITLE_SIGNALS.test(title)) return true;
  if (CULTURAL_TITLE_SIGNALS.test(title)) return true;
  if (ADVENTURE_TITLE_SIGNALS.test(title)) return true;

  // Extract-based: only accept if extract strongly describes an outdoor/activity place
  const ext = extract.toLowerCase();
  return (
    OUTDOOR_TITLE_SIGNALS.test(ext) &&
    !/\b(was born|is a politician|served as|elected|appointed|graduated|founded the company)\b/.test(ext)
  );
}

function classifyPage(title: string, extract: string): ActivityType {
  const t = `${title} ${extract}`.toLowerCase();
  if (ADVENTURE_TITLE_SIGNALS.test(title)) return "adventure";
  // Urbex — eerie/abandoned/explorable places
  if (URBEX_TITLE_SIGNALS.test(title)) return "urbex";
  if (/\b(abandoned|derelict|disused|ghost town|wreck|decayed|decaying|crumbling)\b/.test(t)) return "urbex";
  if (CULTURAL_TITLE_SIGNALS.test(title)) {
    if (/\b(brewery|winery|distillery|restaurant|farmers market|market)\b/i.test(title)) return "food";
    return "arts";
  }
  if (/\b(camp|campground|campsite|backcountry)\b/.test(t)) return "backpacking";
  return "trails";
}

/** Fetch page IDs from Wikipedia's text search for outdoor/activity places in a region. */
async function fetchRegionalWikipediaIds(
  cityName: string | null,
  regionName: string | null
): Promise<number[]> {
  const location = [cityName, regionName].filter(Boolean).join(" ");
  if (!location) return [];
  const query = `(trail OR waterfall OR peak OR "state park" OR "national park" OR lake OR forest OR wilderness OR campground OR cave OR beach OR "nature reserve") ${location}`;
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "30",
    srnamespace: "0",
    format: "json",
    origin: "*",
  });
  try {
    const res = await fetchWithTimeout(`${WIKI_API}?${params}`, 10_000);
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { search?: Array<{ pageid: number }> } };
    return (data.query?.search ?? []).map((p) => p.pageid);
  } catch {
    return [];
  }
}

export async function fetchWikipediaNearby(
  latitude: number,
  longitude: number,
  radiusMeters = 50_000,
  cityName: string | null = null,
  regionName: string | null = null,
): Promise<FeedItem[]> {
  const clampedRadius = Math.min(radiusMeters, 10_000);

  // Run geosearch (hyper-local) + regional keyword search in parallel
  const geoParams = new URLSearchParams({
    action: "query",
    list: "geosearch",
    gscoord: `${latitude}|${longitude}`,
    gsradius: String(clampedRadius),
    gslimit: "30",
    format: "json",
    origin: "*",
  });

  const [geoRes, regionalIds] = await Promise.allSettled([
    fetchWithTimeout(`${WIKI_API}?${geoParams}`, 10_000)
      .then((r) => r.json())
      .then((d: { query?: { geosearch?: GeoSearchPage[] } }) => d.query?.geosearch ?? [])
      .catch((): GeoSearchPage[] => []),
    fetchRegionalWikipediaIds(cityName, regionName),
  ]);

  const geoPages: GeoSearchPage[] = geoRes.status === "fulfilled" ? geoRes.value : [];
  const extraIds: number[] = regionalIds.status === "fulfilled" ? regionalIds.value : [];

  // Merge all unique page IDs (geo results first)
  const geoIds = geoPages.map((p) => p.pageid);
  const allIds = [...new Set([...geoIds, ...extraIds])].slice(0, 40);
  if (allIds.length === 0) return [];

  // Fetch article details in one batch
  const propParams = new URLSearchParams({
    action: "query",
    prop: "extracts|pageimages|coordinates",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    piprop: "thumbnail",
    pithumbsize: "600",
    pageids: allIds.join("|"),
    format: "json",
    origin: "*",
  });

  let pagesData: Record<string, WikiPage> = {};
  try {
    const res = await fetchWithTimeout(`${WIKI_API}?${propParams}`, 10_000);
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
    pagesData = data.query?.pages ?? {};
  } catch {
    return [];
  }

  // Build a coord lookup from geosearch results (for articles without Wikipedia coords)
  const geoCoordMap = new Map(geoPages.map((p) => [p.pageid, { lat: p.lat, lon: p.lon }]));

  const items: FeedItem[] = [];
  for (const id of allIds) {
    const page = pagesData[String(id)];
    if (!page) continue;

    const extract = (page.extract ?? "").trim();
    if (extract.length < 40) continue;
    if (extract.toLowerCase().includes("may refer to:")) continue;
    if (!isVisitablePage(page.title, extract)) continue;

    const wikiCoords = page.coordinates?.[0];
    const geoCoords = geoCoordMap.get(id);
    const coords = wikiCoords
      ? { latitude: wikiCoords.lat, longitude: wikiCoords.lon }
      : geoCoords
      ? { latitude: geoCoords.lat, longitude: geoCoords.lon }
      : null;

    items.push({
      id: `wiki_${id}`,
      source: "trails",
      activityType: classifyPage(page.title, extract),
      title: page.title,
      description: extract.slice(0, 400),
      imageUrl: page.thumbnail?.source ?? null,
      externalUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
      locationName: page.title,
      locationCoords: coords,
      score: null,
      commentCount: null,
      createdAt: null,
      sourceName: "Wikipedia",
      rating: null,
    });
  }

  return items;
}
