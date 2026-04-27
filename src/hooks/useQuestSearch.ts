/**
 * useQuestSearch — the core search pipeline for SideQuests.
 *
 * Flow:
 *   1. thinking  — Ollama expands the user's description into keywords + constraints
 *   2. fetching  — all relevant APIs run in parallel based on category
 *   3. enriching — Ollama ranks results and writes 2-sentence descriptions
 *   4. done      — sorted results returned
 *
 * Every Ollama step degrades gracefully: if Ollama is unreachable the app
 * still returns raw API results with original descriptions.
 */

import { useCallback, useState } from "react";
import { fetchNearbyAbandonedPlaces } from "../services/abandonedOsm";
import { fetchYouTubeUrbexPlaces } from "../services/youtube";
import { fetchNearbyTrails } from "../services/alltrails";
import type { AISuggestion, CategoryKey, QueryParams } from "../services/ollama";
import { enrichResults, expandQuery, extractUrbexLocations, filterArcGISForUrbex, suggestPlaces } from "../services/ollama";
import { fetchArcGISUrbexPlaces } from "../services/arcgis";
import { fetchPosts, searchPosts } from "../services/reddit";
import { fetchWikipediaNearby } from "../services/wikipedia";
import { fetchWikidataAbandonedPlaces } from "../services/wikidata";
import type { ActivityType, FeedItem } from "../types/feed";
import { filterByRadius, haversineKm, partitionByRadius } from "../utils/distance";
import { geocodeResultCoords } from "../services/geocodeCache";
import { redditPostToFeedItem } from "../utils/feedConverters";
import { forwardGeocode, geocodeNamedPlace } from "../services/geocode";
import { getCitySubreddits } from "../utils/locationParser";
import { readJsonCache, writeJsonCache } from "../utils/feedCache";

export type { CategoryKey };

export interface SearchInput {
  category: CategoryKey;
  distanceKm: number;
  description: string;
  location: {
    cityName: string | null;
    regionName: string | null;
    countryName: string | null;
    coords: { latitude: number; longitude: number } | null;
  };
}

export interface QuestResult extends FeedItem {
  aiDescription: string;
  relevanceScore: number;
}

export type SearchPhase = "idle" | "thinking" | "fetching" | "enriching" | "done";

const PHASE_MESSAGES: Record<SearchPhase, string> = {
  idle: "",
  thinking: "Thinking about your search...",
  fetching: "Finding places near you...",
  enriching: "Writing descriptions...",
  done: "",
};

// Reddit subreddits per category
const CATEGORY_SUBREDDITS: Record<CategoryKey, string[]> = {
  hiking: ["hiking", "trails", "backpacking", "CampingandHiking", "PacificCrestTrail"],
  urbex: ["urbanexploration", "abandoned", "urbanexploring", "AbandonedPorn"],
  town: ["AskReddit", "food", "travel", "weekend"],
  other: ["travel", "adventures", "offthebeatenpath", "AskReddit"],
};


/**
 * Per-category source priority bonuses, added on top of the AI relevance score
 * (1–10) during the final sort. Higher = appears closer to the top.
 *
 * sourceName is matched by prefix so "Nat'l Register" catches both NRHP entries.
 */
const SOURCE_PRIORITY: Record<CategoryKey, Record<string, number>> = {
  hiking: {
    OpenStreetMap:  3,  // OSM trail data — most accurate for hikes
    Wikipedia:      1,
    Wikidata:       1,
  },
  urbex: {
    "Nat'l Register": 3,  // ArcGIS — NRHP historic sites
    "Haunted Places":  3,  // ArcGIS — haunted locations
    OpenStreetMap:     2,  // abandoned buildings, ruins
    Wikidata:          2,  // ghost towns, abandoned mines
    Wikipedia:         1,
  },
  town: {
    Wikipedia: 2,
  },
  other: {},
};

function sourceBonus(sourceName: string, category: CategoryKey): number {
  const weights = SOURCE_PRIORITY[category] ?? {};
  for (const [prefix, bonus] of Object.entries(weights)) {
    if (sourceName.startsWith(prefix)) return bonus;
  }
  return 0;
}

const CATEGORY_ACTIVITY_TYPE: Record<CategoryKey, ActivityType> = {
  hiking: "trails",
  urbex: "urbex",
  town: "social",
  other: "adventure",
};

// Geographic terms that signal a named place in user descriptions.
// Ordered longest-first so multi-word terms match before their substrings.
const GEO_TERMS = [
  "national park", "state park", "state forest", "national forest",
  "nature reserve", "wilderness area", "wildlife refuge", "recreation area",
  "wilderness", "reserve", "preserve",
  "forest", "mountain", "mountains", "lake", "river", "canyon", "gorge",
  "trail", "beach", "island", "ridge", "peak", "falls", "bay", "valley",
  "creek", "harbor", "peninsula", "butte", "plateau",
];

const GENERIC_PREFIXES = new Set([
  "the", "a", "an", "any", "some", "old", "new", "little", "big", "great",
  "small", "local", "nearby", "another", "other", "this", "that",
]);

/**
 * Scans the user's description for a named geographic place
 * (e.g. "Tillamook Forest", "Quicksilver Park", "Crater Lake").
 * Returns the best match as a geocodeable string, or null if nothing found.
 */
function extractNamedPlaceFromDescription(description: string): string | null {
  const text = description.trim();
  for (const term of GEO_TERMS) {
    const escaped = term.replace(/\s+/g, "\\s+");
    const pattern = new RegExp(
      `\\b([A-Za-z]+(?:\\s+[A-Za-z]+){0,3})\\s+${escaped}\\b`,
      "gi"
    );
    for (const match of text.matchAll(pattern)) {
      const prefix = match[1].trim();
      const words = prefix.toLowerCase().split(/\s+/);
      // Skip purely generic prefixes ("the forest", "a big park", etc.)
      if (words.every((w) => GENERIC_PREFIXES.has(w))) continue;
      return `${prefix} ${term}`;
    }
  }
  return null;
}

async function resolveCoords(
  location: SearchInput["location"]
): Promise<{ latitude: number; longitude: number } | null> {
  if (location.coords) return location.coords;
  if (location.cityName) {
    const g = await forwardGeocode(location.cityName).catch(() => null);
    if (g) return { latitude: g.latitude, longitude: g.longitude };
  }
  return null;
}

async function redditSearch(
  subreddits: string[],
  citySubreddits: string[],
  keywords: string[],
  locationKeywords: string[],
  activityType: ActivityType
): Promise<FeedItem[]> {
  const searchTerms = [...keywords, ...locationKeywords].filter(Boolean);

  const [globalResult, cityResult, browseResult] = await Promise.allSettled([
    searchTerms.length > 0
      ? searchPosts(subreddits, searchTerms, { limit: 20, timeframe: "year" })
      : Promise.resolve({ posts: [], after: null }),
    citySubreddits.length > 0 && keywords.length > 0
      ? searchPosts(citySubreddits, keywords, { limit: 15, timeframe: "month" })
      : Promise.resolve({ posts: [], after: null }),
    fetchPosts(subreddits, "hot", { limit: 15 }),
  ]);

  const seen = new Set<string>();
  const items: FeedItem[] = [];

  for (const r of [globalResult, cityResult, browseResult]) {
    if (r.status !== "fulfilled") continue;
    for (const post of r.value.posts) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        items.push(redditPostToFeedItem(post, activityType));
      }
    }
  }

  return items;
}

/**
 * Score a FeedItem against the extracted query params.
 *
 * Scoring breakdown (max 10):
 *   - Each keyword found in title/description/locationName → +1 (up to 5)
 *   - Difficulty match (easy/moderate/hard in text)         → +2
 *   - Trail distance within ±40% of requested              → +2
 *   - Elevation preference match                            → +1
 *
 * Returns 0 if the item has zero keyword matches and keywords were specified
 * — the caller uses this to hard-drop irrelevant results.
 */
function scoreAgainstQuery(item: FeedItem, params: QueryParams): number {
  const text = `${item.title} ${item.description} ${item.locationName ?? ""}`.toLowerCase();

  // Keyword matches
  let kwHits = 0;
  for (const kw of params.keywords) {
    if (text.includes(kw.toLowerCase())) kwHits++;
  }
  // If keywords exist but NONE matched, this result is irrelevant
  if (params.keywords.length > 0 && kwHits === 0) return 0;

  let score = Math.min(5, kwHits); // up to 5 pts from keywords

  // Difficulty match
  if (params.difficulty) {
    const diffWords: Record<string, string[]> = {
      easy:     ["easy", "beginner", "gentle", "flat", "simple", "leisurely"],
      moderate: ["moderate", "intermediate", "rolling", "some elevation"],
      hard:     ["hard", "difficult", "challenging", "strenuous", "steep", "expert"],
    };
    if (diffWords[params.difficulty]?.some((w) => text.includes(w))) score += 2;
  }

  // Trail distance match (±40% tolerance)
  if (params.trailDistanceKm) {
    const lo = params.trailDistanceKm * 0.6;
    const hi = params.trailDistanceKm * 1.4;
    // Look for distance mentions in the text (e.g. "8km", "5 miles", "3.2 mi")
    const kmMatches   = [...text.matchAll(/(\d+(?:\.\d+)?)\s*km/g)].map((m) => parseFloat(m[1]));
    const mileMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*mi/g)].map((m) => parseFloat(m[1]) * 1.609);
    const found = [...kmMatches, ...mileMatches];
    if (found.some((d) => d >= lo && d <= hi)) score += 2;
  }

  // Elevation preference match
  if (params.elevationPreference !== "any") {
    const elevWords: Record<string, string[]> = {
      flat:     ["flat", "easy", "gentle", "paved", "no elevation"],
      moderate: ["moderate", "rolling", "some hills"],
      steep:    ["steep", "climb", "elevation gain", "strenuous", "summit"],
    };
    if (elevWords[params.elevationPreference]?.some((w) => text.includes(w))) score += 1;
  }

  return score;
}

function aiSuggestionsToQuestResults(
  suggestions: AISuggestion[],
  category: CategoryKey
): QuestResult[] {
  const activityType = CATEGORY_ACTIVITY_TYPE[category];
  return suggestions.map((s, i) => ({
    id: `ollama_${i}_${Date.now()}`,
    source: "ai" as const,
    sourceName: "AI Suggestion",
    activityType,
    title: s.title,
    description: [s.description, s.tags.length ? `Tags: ${s.tags.join(", ")}` : ""]
      .filter(Boolean)
      .join(" "),
    aiDescription: s.description,
    relevanceScore: 8, // AI suggestions are inherently relevant
    imageUrl: null,
    externalUrl: "",
    locationName: s.locationName,
    locationCoords: null,
    score: null,
    commentCount: null,
    createdAt: null,
    rating: null,
  }));
}

async function fetchForCategory(
  input: SearchInput,
  coords: { latitude: number; longitude: number } | null,
  queryParams: QueryParams,
  onBatch?: (currentItems: FeedItem[]) => void
): Promise<FeedItem[]> {
  const { category, distanceKm, location } = input;
  const radiusMeters = distanceKm * 1000;
  const activityType = CATEGORY_ACTIVITY_TYPE[category];

  const locationKeywords = [location.cityName, location.regionName]
    .filter((s): s is string => !!s);
  const citySubreddits = location.cityName
    ? getCitySubreddits(location.cityName, location.regionName ?? "")
    : [];

  let results: FeedItem[] = [];
  const seen = new Set<string>();

  // ── Helpers ────────────────────────────────────────────────────────────────

  function addItems(items: FeedItem[]) {
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }
  }

  /**
   * Returns true for Reddit posts that are questions or advice requests
   * rather than posts about a specific real place.
   * These add noise — "What's a good waterfall near Dublin?" has no location.
   */
  function isQuestionPost(title: string): boolean {
    const t = title.trim().toLowerCase();
    if (t.endsWith("?")) return true;
    return /^(what|which|where|when|how|why|has anyone|have anyone|looking for|any rec|recommendation|can anyone|does anyone|anyone know|anyone been|help me find|best .{0,30} for|suggest|thoughts on|opinion|advice|need help|help with|tips for|planning a|going to|about to|just got|new to|first time|weekly thread|monthly thread|daily thread|\[request\]|\[question\]|\[help\]|\[advice\])/.test(t);
  }

  /**
   * Social sources (Reddit) carry no coordinates.
   * Only keep a post whose text mentions the user's city/region — otherwise
   * a r/hiking post about Yosemite shows up when you're searching near Dublin.
   * Also filters out Reddit question/advice posts that name no specific place.
   */
  function addSocialItems(items: FeedItem[]) {
    const locTokens = locationKeywords.map((l) => l.toLowerCase());
    for (const item of items) {
      if (seen.has(item.id)) continue;

      // Drop Reddit question posts — they describe no actual place
      if (item.source === "reddit" && isQuestionPost(item.title)) continue;

      if (item.locationCoords) {
        seen.add(item.id);
        results.push(item);
        continue;
      }
      if (locTokens.length === 0) continue;
      const text = `${item.title} ${item.description} ${item.locationName ?? ""}`.toLowerCase();
      if (locTokens.some((tok) => text.includes(tok))) {
        seen.add(item.id);
        results.push(item);
      }
    }
  }

  // DEV-only terminal logging — prints a live running tally after each source resolves.
  const searchId = Date.now().toString(36).toUpperCase();
  const sourceLog: { name: string; n: number; ok: boolean }[] = [];

  function track(name: string, result: PromiseSettledResult<FeedItem[]>, beforeLen: number) {
    if (!__DEV__) return;
    const added = results.length - beforeLen;
    const ok = result.status === "fulfilled" && added > 0;
    sourceLog.push({ name, n: added, ok });
    const total = sourceLog.reduce((s, r) => s + r.n, 0);
    const row = sourceLog.map((r) => `${r.ok ? "✅" : r.n === 0 ? "⚪" : "❌"} ${r.name}(${r.n})`).join("  ");
    const icon = result.status === "rejected" ? "❌" : added > 0 ? "✅" : "⚪";
    console.log(`[SQ:${searchId}] ${icon} ${name.padEnd(16)} +${added}  │  total: ${total}\n             ${row}`);
  }

  function addTracked(name: string, r: PromiseSettledResult<FeedItem[]>, items: FeedItem[]) {
    const before = results.length;
    if (r.status === "fulfilled") addItems(items);
    track(name, r, before);
  }

  function addSocialTracked(name: string, r: PromiseSettledResult<FeedItem[]>, items: FeedItem[]) {
    const before = results.length;
    if (r.status === "fulfilled") addSocialItems(items);
    track(name, r, before);
  }

  // Flush current results to the caller after each source resolves
  function flush() {
    onBatch?.(filterByRadius(results, coords, distanceKm));
  }

  // ── Category pipelines ─────────────────────────────────────────────────────

  if (category === "hiking") {
    if (__DEV__) console.log(`[SQ:${searchId}] 🔍 Hiking search — ${location.cityName ?? "unknown"} — ${distanceKm}km`);

    // Launch all sources simultaneously — flush to UI as each one finishes.
    // Reddit is typically first (~1-2s), OSM/Wiki arrive later (~5-15s).
    const redditPromise = redditSearch(CATEGORY_SUBREDDITS.hiking, citySubreddits, queryParams.keywords, locationKeywords, activityType);
    const osmPromise    = coords ? fetchNearbyTrails(coords.latitude, coords.longitude, radiusMeters) : Promise.resolve([] as FeedItem[]);
    const wikiPromise   = coords ? fetchWikipediaNearby(coords.latitude, coords.longitude, radiusMeters, location.cityName, location.regionName) : Promise.resolve([] as FeedItem[]);
    // Reddit — fastest, show first
    const redditResult = await redditPromise.then(v => ({ status: "fulfilled" as const, value: v })).catch(e => ({ status: "rejected" as const, reason: e }));
    addSocialTracked("Reddit", redditResult, redditResult.status === "fulfilled" ? redditResult.value : []);
    flush();

    // OSM + Wiki in parallel — cross-reference once both arrive
    const [osm, wiki] = await Promise.allSettled([osmPromise, wikiPromise]);
    const osmItems  = osm.status  === "fulfilled" ? osm.value  : [];
    const wikiItems = wiki.status === "fulfilled" ? wiki.value : [];

    const wikiByTitle = new Map(wikiItems.map((w) => [w.title.toLowerCase().trim(), w]));
    const usedWikiIds = new Set<string>();
    const enrichedOsm = osmItems.map((trail) => {
      const match = wikiByTitle.get(trail.title.toLowerCase().trim());
      if (match && !usedWikiIds.has(match.id)) {
        usedWikiIds.add(match.id);
        return { ...trail, description: match.description || trail.description, imageUrl: match.imageUrl ?? trail.imageUrl, sourceName: "OpenStreetMap · Wikipedia" };
      }
      return trail;
    });
    const remainingWiki = wikiItems.filter((w) => !usedWikiIds.has(w.id));

    if (__DEV__) console.log(`[SQ:${searchId}] 🔗 OSM↔Wiki cross-ref: ${usedWikiIds.size} enriched, ${remainingWiki.length} standalone wiki`);

    addTracked("OpenStreetMap", osm, enrichedOsm);
    addTracked("Wikipedia", wiki, remainingWiki);
    flush();

  } else if (category === "urbex") {
    if (__DEV__) console.log(`[SQ:${searchId}] 🔍 Urbex search — ${location.cityName ?? "unknown"} — ${distanceKm}km`);

    const redditPromise  = redditSearch(CATEGORY_SUBREDDITS.urbex, citySubreddits, queryParams.keywords, locationKeywords, activityType);
    const osmPromise     = coords ? fetchNearbyAbandonedPlaces(coords.latitude, coords.longitude, radiusMeters) : Promise.resolve([] as FeedItem[]);
    const wikidataPromise = coords ? fetchWikidataAbandonedPlaces(coords.latitude, coords.longitude, distanceKm) : Promise.resolve([] as FeedItem[]);
    const wikiPromise    = coords ? fetchWikipediaNearby(coords.latitude, coords.longitude, radiusMeters, location.cityName, location.regionName) : Promise.resolve([] as FeedItem[]);
    const arcgisPromise  = coords ? fetchArcGISUrbexPlaces(coords.latitude, coords.longitude, radiusMeters) : Promise.resolve([] as FeedItem[]);

    // Reddit first
    const redditResult = await redditPromise.then(v => ({ status: "fulfilled" as const, value: v })).catch(e => ({ status: "rejected" as const, reason: e }));
    const redditPosts = redditResult.status === "fulfilled" ? redditResult.value : [];
    addSocialTracked("Reddit", redditResult, redditPosts.map(i => ({ ...i, activityType: "urbex" as ActivityType })));
    flush();

    // AI location extraction — run Ollama over each Reddit post body to pull out
    // specific place names, addresses, and geographic clues the authors dropped.
    // Run up to 5 posts in parallel, geocode extracted locations, add as FeedItems.
    if (redditPosts.length > 0) {
      const postsToMine = redditPosts
        .filter(p => (p.redditSelftext ?? "").length > 100)
        .slice(0, 5);

      if (postsToMine.length > 0) {
        if (__DEV__) console.log(`[SQ:${searchId}] 🤖 AI mining ${postsToMine.length} Reddit posts for location clues`);

        const extractionResults = await Promise.allSettled(
          postsToMine.map(p =>
            extractUrbexLocations(p.title, p.redditSelftext ?? "", location.cityName, location.regionName)
          )
        );

        const locationCandidates: Array<{ name: string; searchQuery: string; confidence: number; sourcePost: FeedItem }> = [];
        for (let i = 0; i < postsToMine.length; i++) {
          const r = extractionResults[i];
          if (r.status !== "fulfilled" || r.value.length === 0) continue;
          for (const loc of r.value) {
            locationCandidates.push({ ...loc, sourcePost: postsToMine[i] });
          }
        }

        if (locationCandidates.length > 0) {
          if (__DEV__) console.log(`[SQ:${searchId}] 🤖 AI extracted ${locationCandidates.length} location candidates — geocoding`);

          const geocoded = await Promise.allSettled(
            locationCandidates.map(c => forwardGeocode(c.searchQuery).catch(() => null))
          );

          const aiMined: FeedItem[] = [];
          for (let i = 0; i < locationCandidates.length; i++) {
            const g = geocoded[i];
            const candidate = locationCandidates[i];
            const geoResult = g.status === "fulfilled" ? g.value : null;

            // Only add if geocoding resolved coords (proves it's a real place)
            // OR confidence is very high (named building mentioned by author)
            if (!geoResult && candidate.confidence < 0.85) continue;

            aiMined.push({
              id: `ai_urbex_${candidate.sourcePost.id}_${i}`,
              source: "ai",
              activityType: "urbex",
              title: candidate.name,
              description: `Mentioned in: "${candidate.sourcePost.title}"`,
              imageUrl: null,
              externalUrl: candidate.sourcePost.externalUrl,
              locationName: candidate.searchQuery,
              locationCoords: geoResult ? { latitude: geoResult.latitude, longitude: geoResult.longitude } : null,
              score: candidate.sourcePost.score,
              commentCount: candidate.sourcePost.commentCount,
              createdAt: candidate.sourcePost.createdAt,
              sourceName: "Reddit · AI",
              rating: null,
            });
          }

          if (aiMined.length > 0) {
            if (__DEV__) console.log(`[SQ:${searchId}] ✅ AI mined ${aiMined.length} urbex locations from Reddit`);
            addItems(aiMined);
            flush();
          }
        }
      }
    }

    // OSM + Wikidata + Wiki in parallel
    const [osmAbandoned, wikidata, wiki] = await Promise.allSettled([osmPromise, wikidataPromise, wikiPromise]);
    addTracked("OSM Abandoned", osmAbandoned, osmAbandoned.status === "fulfilled" ? osmAbandoned.value.map(i => ({ ...i, activityType: "urbex" as ActivityType })) : []);
    addTracked("Wikidata",      wikidata,     wikidata.status     === "fulfilled" ? wikidata.value.map(i => ({ ...i, activityType: "urbex" as ActivityType }))     : []);
    addTracked("Wikipedia",     wiki,         wiki.status         === "fulfilled" ? wiki.value.filter(i => i.activityType === "urbex")                              : []);
    flush();

    // ArcGIS + YouTube last
    const youtubePromise = fetchYouTubeUrbexPlaces(location.cityName, location.regionName, distanceKm, coords);
    const [arcgisRaw, youtube] = await Promise.allSettled([arcgisPromise, youtubePromise]);
    addTracked("YouTube", youtube, youtube.status === "fulfilled" ? youtube.value : []);

    if (arcgisRaw.status === "fulfilled" && arcgisRaw.value.length > 0) {
      const arcgisItems = arcgisRaw.value;
      let filtered = arcgisItems;
      try {
        const scores = await filterArcGISForUrbex(
          arcgisItems.map((i) => ({ id: i.id, title: i.title, description: i.description, locationName: i.locationName ?? "" })),
          queryParams.summary || input.description
        );
        const scoreMap = new Map(scores.map((s) => [s.id, s.urbexScore]));
        filtered = arcgisItems.filter((i) => (scoreMap.get(i.id) ?? 5) >= 4);
        if (__DEV__) console.log(`[SQ:${searchId}] 🤖 ArcGIS Ollama filter: ${arcgisItems.length} → ${filtered.length} passed`);
      } catch {
        if (__DEV__) console.log(`[SQ:${searchId}] ⚠️  ArcGIS Ollama offline — using all ${arcgisItems.length} raw results`);
      }
      addTracked("ArcGIS", arcgisRaw, filtered.map(i => ({ ...i, activityType: "urbex" as ActivityType })));
    } else {
      if (__DEV__) console.log(`[SQ:${searchId}] ⚪ ArcGIS — no results`);
    }
    flush();

  } else {
    if (__DEV__) console.log(`[SQ:${searchId}] 🔍 ${category} search — ${location.cityName ?? "unknown"} — ${distanceKm}km`);

    const baseSubs = CATEGORY_SUBREDDITS[category] ?? CATEGORY_SUBREDDITS.town;
    const townSubs = citySubreddits.length > 0 ? [...citySubreddits, ...baseSubs] : baseSubs;

    const redditPromise = redditSearch(townSubs, [], queryParams.keywords, locationKeywords, activityType);
    const wikiPromise   = coords ? fetchWikipediaNearby(coords.latitude, coords.longitude, radiusMeters, location.cityName, location.regionName) : Promise.resolve([] as FeedItem[]);
    const redditResult = await redditPromise.then(v => ({ status: "fulfilled" as const, value: v })).catch(e => ({ status: "rejected" as const, reason: e }));
    addTracked("Reddit", redditResult, redditResult.status === "fulfilled" ? redditResult.value : []);
    flush();

    const [wiki] = await Promise.allSettled([wikiPromise]);
    addTracked("Wikipedia", wiki, wiki.status === "fulfilled" ? wiki.value : []);
    flush();
  }

  // Final deduplicated result — callers use this for the last flush/sort
  return filterByRadius(results, coords, distanceKm);
}

// Search results are cached for 6 hours — AI descriptions included.
// Key is derived from the inputs so different searches get separate entries.
const SEARCH_CACHE_TTL = 24 * 60 * 60 * 1000;

interface SearchCachePayload {
  results: QuestResult[];
  nearbyResults: QuestResult[];
  summary: string;
}

function makeSearchCacheKey(input: SearchInput): string {
  const city = (input.location.cityName ?? "").toLowerCase().trim();
  const desc = input.description.toLowerCase().trim().slice(0, 100);
  return `sq_search_${input.category}_${city}_${input.distanceKm}_${desc}`;
}

export function useQuestSearch() {
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [results, setResults] = useState<QuestResult[]>([]);
  const [nearbyResults, setNearbyResults] = useState<QuestResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [locationHint, setLocationHint] = useState<string | null>(null);

  const search = useCallback(async (input: SearchInput) => {
    setPhase("thinking");
    setResults([]);
    setNearbyResults([]);
    setError(null);
    setSummary(input.description);
    setLocationHint(null);

    try {
      // Return cached results immediately if still fresh
      const cacheKey = makeSearchCacheKey(input);
      const cached = await readJsonCache<SearchCachePayload>(cacheKey, SEARCH_CACHE_TTL);
      if (cached && cached.results.length > 0) {
        if (__DEV__) console.log(`[SQ] Cache hit: ${cached.results.length} results`);
        setResults(cached.results);
        setNearbyResults(cached.nearbyResults ?? []);
        setSummary(cached.summary || input.description);
        setPhase("done");
        return;
      }
      // Build fallback query params instantly from regex — no AI needed.
      // Fetching starts immediately with these; AI-expanded params arrive
      // in parallel and trigger a re-score once ready.
      function buildFallbackParams(): QueryParams {
        const dl = input.description.toLowerCase();
        const milesMatch = dl.match(/(\d+(?:\.\d+)?)\s*mi(?:le)?s?/);
        const kmMatch    = dl.match(/(\d+(?:\.\d+)?)\s*km/);
        return {
          keywords: dl.match(/\b[a-z]{4,}\b/g)
            ?.filter((w) => !["with","that","and","the","for","not","are","this","want","looking","something"].includes(w))
            .slice(0, 6) ?? [],
          elevationPreference: dl.includes("flat") ? "flat" : dl.includes("steep") ? "steep" : "any",
          difficulty: /\beasy\b/.test(dl) ? "easy" : /\bhard\b|\bdifficult\b|\bchallenging\b/.test(dl) ? "hard" : /\bmoderate\b/.test(dl) ? "moderate" : null,
          estimatedDurationHours: null,
          trailDistanceKm: milesMatch ? parseFloat(milesMatch[1]) * 1.609 : kmMatch ? parseFloat(kmMatch[1]) : null,
          summary: input.description,
        };
      }

      // Phase 1: coords + AI query expansion run concurrently.
      // We don't wait for AI — fetching starts immediately with fallback params.
      const coordsPromise = resolveCoords(input.location).catch(() => null);
      const aiQueryPromise = expandQuery(input.category, input.distanceKm, input.description)
        .catch((): QueryParams => buildFallbackParams());

      // Start fetching as soon as coords resolve (don't wait for AI)
      let coords = await coordsPromise;
      let queryParams: QueryParams = buildFallbackParams();

      // Detect named geographic place in the description (e.g. "Tillamook Forest",
      // "Quicksilver Park"). If found and in range, shift the search centre to it.
      // If out of range, surface a hint so the UI can inform the user.
      const namedPlace = extractNamedPlaceFromDescription(input.description);
      if (namedPlace && coords) {
        try {
          const geo = await geocodeNamedPlace(namedPlace, null, input.location.cityName ?? null, input.location.regionName ?? null);
          if (geo) {
            const dist = haversineKm(coords.latitude, coords.longitude, geo.latitude, geo.longitude);
            if (dist <= input.distanceKm) {
              coords = { latitude: geo.latitude, longitude: geo.longitude };
              setLocationHint(`Searching around ${namedPlace}`);
            } else {
              const distStr = dist < 200
                ? `${Math.round(dist)} km (${Math.round(dist / 1.609)} mi)`
                : `${Math.round(dist / 1.609)} miles`;
              setLocationHint(
                `${namedPlace} is ${distStr} away — outside your ${input.distanceKm} km search range. Showing results near your current location instead. Try expanding your range to explore there.`
              );
            }
          }
        } catch {
          // Geocoding failed silently — proceed with original coords
        }
      }

      setPhase("fetching");

      // Helper: score + sort a raw item list into QuestResults for immediate display
      function toQuestResults(raw: FeedItem[], params: QueryParams): QuestResult[] {
        const scored = raw.map((item) => ({ item, score: scoreAgainstQuery(item, params) }));
        const hasKeywords = params.keywords.length > 0;
        const passed = hasKeywords
          ? scored.filter((s) => s.score > 0 || s.item.locationCoords !== null).map((s) => s.item)
          : raw;

        const scoredMap = new Map(scored.map((s) => [s.item.id, s.score]));
        const qr: QuestResult[] = passed.map((item) => ({
          ...item,
          aiDescription: item.description || item.title,
          relevanceScore: scoredMap.get(item.id) ?? 5,
        }));

        qr.sort((a, b) => {
          const sc = (i: QuestResult) => i.relevanceScore + sourceBonus(i.sourceName, input.category) + (i.locationCoords ? 0 : -1);
          return sc(b) - sc(a);
        });
        return qr;
      }

      // Merge new batch into existing visible results (de-dupe by id, re-sort)
      function mergeInto(existing: QuestResult[], incoming: QuestResult[]): QuestResult[] {
        const seen = new Set(existing.map((r) => r.id));
        const merged = [...existing];
        for (const r of incoming) {
          if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        merged.sort((a, b) => {
          const sc = (i: QuestResult) => i.relevanceScore + sourceBonus(i.sourceName, input.category) + (i.locationCoords ? 0 : -1);
          return sc(b) - sc(a);
        });
        return merged;
      }

      // Phase 2: Fetch all sources — onBatch fires after each wave so the UI
      // updates progressively (Reddit first ~1-2s, OSM/Wiki ~5-15s later)
      let currentResults: QuestResult[] = [];

      const rawItems = await fetchForCategory(input, coords, queryParams, (batchRaw) => {
        const batchQR = toQuestResults(batchRaw, queryParams);
        currentResults = mergeInto(currentResults, batchQR);
        if (currentResults.length > 0) {
          setResults([...currentResults]);
          setPhase("fetching");
        }
      });

      // Final pass with complete raw items (still using fallback/current params)
      const finalQR = toQuestResults(rawItems, queryParams);
      currentResults = mergeInto(currentResults, finalQR);

      if (__DEV__) console.log(`[SQ] Keyword filter passed: ${currentResults.length} items`);

      // Apply AI-expanded params if they're ready (likely for Claude, may still
      // be pending for Ollama — either way we re-score without blocking display)
      const aiParams = await aiQueryPromise;
      if (aiParams.keywords.join() !== queryParams.keywords.join()) {
        queryParams = aiParams;
        const reScored = toQuestResults(rawItems, queryParams);
        currentResults = mergeInto([], reScored); // full re-score from raw
        if (__DEV__) console.log(`[SQ] AI re-score applied: summary="${aiParams.summary}"`);
      }
      setSummary(queryParams.summary || input.description);

      // Phase 3: AI suggestions (Ollama) — kick off in background, merge when done
      const aiPromise = suggestPlaces(input.category, input.distanceKm, input.description, input.location)
        .then((s) => aiSuggestionsToQuestResults(s, input.category))
        .catch(() => [] as QuestResult[]);

      if (currentResults.length === 0) {
        // Nothing yet — wait for AI suggestions before showing empty state
        const aiItems = await aiPromise;
        if (aiItems.length === 0) {
          setPhase("done");
          setError(`Nothing found within ${input.distanceKm} km. Try searching farther away or rephrasing your description.`);
          return;
        }
        currentResults = aiItems;
      }

      // Show what we have, mark done — Ollama enrichment patches in the background
      setResults([...currentResults]);
      setPhase("done");

      // Phase 4: Ollama enrichment — runs silently after results are visible.
      // Patches aiDescription + relevanceScore, then re-renders the list.
      setPhase("enriching");
      try {
        const [enriched, aiItems] = await Promise.all([
          enrichResults(
            currentResults.slice(0, 15).map((i) => ({ id: i.id, title: i.title, description: i.description, locationName: i.locationName })),
            queryParams.summary || input.description
          ),
          aiPromise,
        ]);

        if (enriched.length > 0) {
          const enrichedMap = new Map(enriched.map((e) => [e.id, e]));
          currentResults = currentResults.map((r) => {
            const e = enrichedMap.get(r.id);
            return e
              ? { ...r, aiDescription: e.description, relevanceScore: Math.round((e.relevanceScore + r.relevanceScore) / 2) }
              : r;
          });
        }

        // Merge AI-generated suggestions (de-dupe by title)
        const seenTitles = new Set(currentResults.map((r) => r.title.toLowerCase()));
        for (const ai of aiItems) {
          if (!seenTitles.has(ai.title.toLowerCase())) {
            seenTitles.add(ai.title.toLowerCase());
            currentResults.push(ai);
          }
        }

        currentResults.sort((a, b) => {
          const sc = (i: QuestResult) => i.relevanceScore + sourceBonus(i.sourceName, input.category) + (i.locationCoords ? 0 : -1);
          return sc(b) - sc(a);
        });
      } catch {
        // Ollama unavailable — keep raw results
      }

      // Geocode pass: fill in missing map coords for results that only have a
      // title/locationName. Runs after enrichment so results are already visible —
      // map pins appear progressively as each lookup resolves.
      // Cap at 25 items to keep total latency reasonable (~2-4s for a full batch).
      const needsGeocode = currentResults.filter((r) => !r.locationCoords && (r.title || r.locationName));
      if (needsGeocode.length > 0) {
        const cityHint   = input.location.cityName ?? null;
        const regionHint = input.location.regionName ?? null;
        const toGeocode  = needsGeocode.slice(0, 25);

        const geocoded = await Promise.allSettled(
          toGeocode.map((r) => geocodeResultCoords(r, cityHint, regionHint))
        );

        const coordsMap = new Map<string, { latitude: number; longitude: number }>();
        for (let i = 0; i < toGeocode.length; i++) {
          const r = geocoded[i];
          if (r.status === "fulfilled" && r.value.locationCoords) {
            coordsMap.set(toGeocode[i].id, r.value.locationCoords);
          }
        }

        if (coordsMap.size > 0) {
          currentResults = currentResults.map((r) =>
            coordsMap.has(r.id) ? { ...r, locationCoords: coordsMap.get(r.id)! } : r
          );
          setResults([...currentResults]);
          if (__DEV__) console.log(`[SQ] Geocoded ${coordsMap.size}/${toGeocode.length} results → map pins added`);
        }
      }

      // Partition into in-range and nearby (up to 1.5× the requested distance)
      let finalNearby: QuestResult[] = [];
      if (coords) {
        const { inRange, nearby } = partitionByRadius(currentResults, coords, input.distanceKm);
        currentResults = inRange as QuestResult[];
        finalNearby = nearby as QuestResult[];
      }

      // Persist to cache so the next identical search is instant
      writeJsonCache<SearchCachePayload>(cacheKey, {
        results: currentResults,
        nearbyResults: finalNearby,
        summary: queryParams.summary || input.description,
      });

      setResults([...currentResults]);
      setNearbyResults([...finalNearby]);
      setPhase("done");

    } catch (err) {
      setPhase("done");
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    }
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setResults([]);
    setNearbyResults([]);
    setError(null);
    setSummary("");
    setLocationHint(null);
  }, []);

  return {
    phase,
    statusMessage: PHASE_MESSAGES[phase],
    results,
    nearbyResults,
    error,
    summary,
    locationHint,
    search,
    reset,
    isLoading: phase !== "idle" && phase !== "done",
  };
}
