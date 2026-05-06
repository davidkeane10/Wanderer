import { useCallback, useEffect, useRef, useState } from "react";
import { haversineKm, filterByRadius } from "../utils/distance";
import { CATEGORIES, scorePostRelevance } from "../config/categories";
import { fetchNearbyTrails } from "../services/alltrails";
import { fetchNearbyAbandonedPlaces } from "../services/abandonedOsm";
import { fetchPosts, fetchLocalQuestionPosts, fetchPostComments, searchPosts } from "../services/reddit";
import { fetchWikipediaNearby } from "../services/wikipedia";
import { fetchWikidataAbandonedPlaces } from "../services/wikidata";
import { Platform } from "react-native";
import type { ActivityType, FeedItem } from "../types/feed";
import type { RedditPost } from "../types/reddit";
import { redditPostToFeedItem } from "../utils/feedConverters";
import { forwardGeocode, geocodeNamedPlace } from "../services/geocode";
import { extractUrbexLocations } from "../services/ollama";
import {
  getCitySubreddits,
  isPostLikelyLocal,
  postMentionsLocation,
  titleMentionsForeignLocation,
} from "../utils/locationParser";
import { extractTrailsFromText } from "../utils/trailExtractor";
import { readCache, writeCache } from "../utils/feedCache";

const MIN_RELEVANCE_SCORE = 10;
const REDDIT_PAGE_SIZE = 20;

interface Location {
  cityName: string | null;
  regionName: string | null;
  countryName: string | null;
  coords: { latitude: number; longitude: number } | null;
}

interface DiscoverFeedState {
  items: FeedItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  hasMore: boolean;
  // Reddit pagination cursors per activity type
  trailsAfter: string | null;
  backpackingAfter: string | null;
  urbexAfter: string | null;
  adventureAfter: string | null;
  socialAfter: string | null;
}

// Core categories pulled for the unified Discover feed
const TRAIL_CAT       = CATEGORIES.find((c) => c.key === "hiking")!;
const BACKPACKING_CAT = CATEGORIES.find((c) => c.key === "backpacking")!;
const URBEX_CAT       = CATEGORIES.find((c) => c.key === "urban")!;
const ADVENTURE_CAT   = CATEGORIES.find((c) => c.key === "adventure")!;
const SOCIAL_CAT      = CATEGORIES.find((c) => c.key === "social")!;


/**
/**
 * Runs AI location extraction over urbex Reddit post bodies, geocodes each
 * result with location bias, and returns new FeedItems with map coordinates.
 *
 * Runs in Phase 2 (background) so it never blocks the initial Reddit render.
 * Only text posts with >150 chars of selftext are processed (up to 5).
 */
async function mineUrbexSelftext(
  items: FeedItem[],
  location: Location,
  userCoords: { latitude: number; longitude: number },
  radiusKm: number
): Promise<FeedItem[]> {
  const postsToMine = items
    .filter((item) => (item.redditSelftext ?? "").length > 150)
    .slice(0, 5);

  if (postsToMine.length === 0) return [];

  const extractionResults = await Promise.allSettled(
    postsToMine.map((item) =>
      extractUrbexLocations(item.title, item.redditSelftext ?? "", location.cityName, location.regionName)
    )
  );

  const candidates: Array<{
    name: string;
    searchQuery: string;
    confidence: number;
    sourceItem: FeedItem;
  }> = [];

  for (let i = 0; i < postsToMine.length; i++) {
    const r = extractionResults[i];
    if (r.status !== "fulfilled") continue;
    for (const loc of r.value) {
      candidates.push({ ...loc, sourceItem: postsToMine[i] });
    }
  }

  if (candidates.length === 0) return [];

  const geocoded = await Promise.allSettled(
    candidates.map((c) =>
      geocodeNamedPlace(c.name, null, location.cityName, location.regionName, userCoords, radiusKm).catch(() => null)
    )
  );

  const feedItems: FeedItem[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const g = geocoded[i];
    const coords = g.status === "fulfilled" ? g.value : null;

    if (!coords && c.confidence < 0.85) continue;
    const nameKey = c.name.toLowerCase().trim();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    feedItems.push({
      id: `reddit_urbex_mined_${c.sourceItem.id}_${i}`,
      source: "reddit" as const,
      activityType: "urbex" as const,
      title: c.name,
      description: `Mentioned in: "${c.sourceItem.title}"`,
      imageUrl: c.sourceItem.imageUrl ?? null,
      externalUrl: c.sourceItem.externalUrl ?? "",
      locationName: c.searchQuery,
      locationCoords: coords,
      score: c.sourceItem.score,
      commentCount: c.sourceItem.commentCount,
      createdAt: c.sourceItem.createdAt,
      sourceName: c.sourceItem.sourceName ?? "Reddit",
      rating: null,
      redditPermalink: c.sourceItem.redditPermalink,
    });
  }

  return feedItems;
}

/**
 * Fetch one Reddit category's posts and tag them with an activityType.
 *
 * Three-tier strategy (all run in parallel):
 *
 *   Tier 1 — ALWAYS: browse global category subreddits hot/top.
 *     Guarantees content even when location searches return nothing.
 *
 *   Tier 2 — when city set: search global category subreddits for city name.
 *     e.g. r/urbanexploration searching "London" → finds local urbex posts.
 *
 *   Tier 3 — when city set: search city subreddits for category keywords.
 *     e.g. r/london searching "abandoned urbex" → community tips.
 *
 * Location-specific results (tiers 2+3) float to the top; tier 1 fills in
 * the rest so the feed is never empty.
 */
async function fetchCategoryReddit(
  category: (typeof CATEGORIES)[number],
  location: Location,
  after: string | null,
  activityType: ActivityType
): Promise<{ items: FeedItem[]; after: string | null }> {
  const cityName = location.cityName;

  // Build concurrent requests — tier 1 always runs
  const browsePromise = fetchPosts(category.subreddits, category.sort, {
    limit: REDDIT_PAGE_SIZE,
    after,
    timeframe: category.timeframe,
  });

  let searchGlobalPromise: Promise<{ posts: RedditPost[]; after: string | null }> =
    Promise.resolve({ posts: [], after: null });
  let searchCityPromise: Promise<{ posts: RedditPost[]; after: string | null }> =
    Promise.resolve({ posts: [], after: null });
  let questionPostsPromise: Promise<RedditPost[]> = Promise.resolve([]);

  if (cityName) {
    const citySubs = getCitySubreddits(cityName, location.regionName ?? "");
    const locationKeywords = [
      cityName,
      ...(location.regionName ? [location.regionName] : []),
      ...(location.countryName ? [location.countryName] : []),
    ];
    searchGlobalPromise = searchPosts(category.subreddits, locationKeywords, {
      limit: REDDIT_PAGE_SIZE,
      after,
      timeframe: "year",
    });
    searchCityPromise = searchPosts(citySubs, category.keywords, {
      limit: REDDIT_PAGE_SIZE,
      after,
      timeframe: "month",
    });
    // Fetch local Q&A posts to mine for place mentions (trails + urbex)
    if ((activityType === "trails" || activityType === "urbex") && !after) {
      questionPostsPromise = fetchLocalQuestionPosts(citySubs, locationKeywords, 8);
    }
  }

  const [browseResult, searchGlobalResult, searchCityResult, questionPostsResult] =
    await Promise.allSettled([
      browsePromise,
      searchGlobalPromise,
      searchCityPromise,
      questionPostsPromise,
    ]);

  const browsePosts = browseResult.status === "fulfilled" ? browseResult.value.posts : [];
  const searchGlobalPosts =
    searchGlobalResult.status === "fulfilled" ? searchGlobalResult.value.posts : [];
  const searchCityPosts =
    searchCityResult.status === "fulfilled" ? searchCityResult.value.posts : [];
  const questionPosts =
    questionPostsResult.status === "fulfilled" ? questionPostsResult.value : [];

  // When a city is set, only keep tier-1 browse posts that explicitly mention
  // the city or region — otherwise we get posts from far-away places.
  // Tier 2 + tier 3 (location-searched) always pass through.
  const filteredBrowsePosts = cityName
    ? browsePosts.filter((p) =>
        postMentionsLocation(
          `${p.title} ${p.selftext.slice(0, 300)}`,
          cityName,
          location.regionName
        )
      )
    : browsePosts;

  // Location-specific posts first (most relevant), filtered browse fills the rest
  const seen = new Set<string>();
  const posts: RedditPost[] = [];
  for (const post of [...searchGlobalPosts, ...searchCityPosts, ...filteredBrowsePosts]) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      posts.push(post);
    }
  }

  const nextAfter = browseResult.status === "fulfilled" ? browseResult.value.after : null;

  const regularItems = posts
    .filter((post) => {
      // Fast-reject: title directly mentions a well-known foreign city/country
      if (titleMentionsForeignLocation(post.title, location.countryName, location.regionName)) return false;
      if (!cityName) {
        const score = scorePostRelevance(post.title, post.selftext, post.subreddit, category);
        if (score < MIN_RELEVANCE_SCORE) return false;
      }
      return isPostLikelyLocal(post.title, post.selftext, location.countryName, location.regionName);
    })
    .map((post) => redditPostToFeedItem(post, activityType));

  // Mine Q&A posts: fetch top comments and extract mentioned trail names/stats
  const extractedItems: FeedItem[] = [];
  if (questionPosts.length > 0) {
    const commentBatches = await Promise.allSettled(
      questionPosts.slice(0, 4).map((p) => fetchPostComments(p.permalink, 20))
    );
    for (let i = 0; i < questionPosts.length && i < commentBatches.length; i++) {
      const qPost = questionPosts[i];
      const batch = commentBatches[i];
      if (batch.status !== "fulfilled" || batch.value.length === 0) continue;

      const allText = [qPost.selftext, ...batch.value.map((c) => c.body)].join("\n\n");
      const trails = extractTrailsFromText(allText);

      for (const trail of trails) {
        const stats: string[] = [];
        if (trail.distanceMi) stats.push(`${trail.distanceMi.toFixed(1)} mi`);
        if (trail.elevationFt)
          stats.push(`${trail.elevationFt.toLocaleString()} ft gain`);
        if (trail.difficulty)
          stats.push(
            trail.difficulty.charAt(0).toUpperCase() + trail.difficulty.slice(1)
          );

        const description = [
          stats.length > 0 ? stats.join(" · ") : null,
          trail.excerpt ? `"${trail.excerpt.slice(0, 140)}"` : null,
        ]
          .filter(Boolean)
          .join("\n");

        extractedItems.push({
          id: `extracted_${qPost.id}_${trail.name.replace(/\W/g, "_")}`,
          source: "reddit",
          activityType: "trails",
          title: trail.name,
          description,
          imageUrl: null,
          externalUrl: `https://www.reddit.com${qPost.permalink}`,
          locationName: cityName,
          locationCoords: null,
          score: qPost.score,
          commentCount: qPost.num_comments,
          createdAt: qPost.created_utc,
          sourceName: `r/${qPost.subreddit} tip`,
          rating: null,
          redditPermalink: qPost.permalink,
        });
      }
    }
  }

  return { items: [...extractedItems, ...regularItems], after: nextAfter };
}

/**
 * Shuffle an array in place using Fisher-Yates and return it.
 * Used to interleave items from different sources naturally.
 */
function shuffleMerge(arrays: FeedItem[][]): FeedItem[] {
  // Round-robin interleave so no single source dominates
  const result: FeedItem[] = [];
  const iters = arrays.map((a) => a[Symbol.iterator]());
  let anyLeft = true;

  while (anyLeft) {
    anyLeft = false;
    for (const iter of iters) {
      const { value, done } = iter.next();
      if (!done) {
        result.push(value as FeedItem);
        anyLeft = true;
      }
    }
  }

  return result;
}

/** Normalise a title for fuzzy deduplication: lowercase, strip punctuation, collapse spaces. */
function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Deduplicates items by ID first, then by normalised title within the same
 * activityType. When two items share a title, the one with coordinates wins
 * and its sourceName is updated to note both sources.
 *
 * This handles the common case where the same place appears from multiple
 * sources — e.g. a Reddit mention (no coords) and an OSM result (with coords).
 */
function deduplicateAndMerge(existing: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const byId  = new Map<string, FeedItem>(existing.map((i) => [i.id, i]));
  // title+activityType key → id of the winning item
  const byTitle = new Map<string, string>();

  for (const item of existing) {
    const titleKey = `${item.activityType}:${normTitle(item.title)}`;
    if (!byTitle.has(titleKey)) byTitle.set(titleKey, item.id);
  }

  for (const item of incoming) {
    // Exact ID dedup — skip if already seen
    if (byId.has(item.id)) continue;

    const titleKey = `${item.activityType}:${normTitle(item.title)}`;
    const existingId = byTitle.get(titleKey);

    if (existingId) {
      // Same place from a different source — keep the version with coordinates,
      // merge sourceName so the user knows it appeared in multiple places.
      const existing = byId.get(existingId)!;
      if (!existing.locationCoords && item.locationCoords) {
        // Incoming has coords, existing doesn't — upgrade existing entry
        const merged: FeedItem = {
          ...existing,
          locationCoords: item.locationCoords,
          sourceName: existing.sourceName
            ? `${existing.sourceName} · ${item.sourceName ?? ""}`
            : item.sourceName,
        };
        byId.set(existingId, merged);
      } else if (existing.locationCoords && !item.locationCoords) {
        // Existing has coords, incoming doesn't — just note the extra source
        const merged: FeedItem = {
          ...existing,
          sourceName: existing.sourceName
            ? `${existing.sourceName} · ${item.sourceName ?? ""}`
            : item.sourceName,
        };
        byId.set(existingId, merged);
      }
      // Both have or both lack coords — keep first seen, ignore duplicate
      continue;
    }

    byId.set(item.id, item);
    byTitle.set(titleKey, item.id);
  }

  return Array.from(byId.values());
}

/**
 * Sort feed items closest-first.
 *
 * Tier 1 — exact coords known: sorted by real haversine distance.
 * Tier 2 — no coords but text mentions the user's city: treated as ~0 km bucket.
 * Tier 3 — text mentions the user's region/state: treated as ~nearby bucket.
 * Tier 4 — no location signal at all: pushed to the bottom.
 *
 * Within tiers 2-4 (no exact coords), items are left in their existing order
 * so the category/source shuffle is preserved as a secondary sort.
 */
function sortByProximity(
  items: FeedItem[],
  userCoords: { latitude: number; longitude: number } | null,
  cityName: string | null,
  regionName: string | null
): FeedItem[] {
  if (!userCoords && !cityName && !regionName) return items;

  type Scored = { item: FeedItem; dist: number };

  const TIER_CITY   = 5;      // text mentions city  → treat as 5 km proxy
  const TIER_REGION = 200;    // text mentions region → treat as 200 km proxy
  const TIER_UNKNOWN = 99999; // no signal

  const scored: Scored[] = items.map((item) => {
    // Tier 1: we have exact coords for this item
    if (item.locationCoords && userCoords) {
      const dist = haversineKm(
        userCoords.latitude,
        userCoords.longitude,
        item.locationCoords.latitude,
        item.locationCoords.longitude
      );
      return { item, dist };
    }

    // Tiers 2-4: text-based proximity estimate
    const text = `${item.title} ${item.description} ${item.locationName ?? ""}`;
    if (cityName && text.toLowerCase().includes(cityName.toLowerCase())) {
      return { item, dist: TIER_CITY };
    }
    if (postMentionsLocation(text, cityName, regionName)) {
      return { item, dist: TIER_REGION };
    }
    return { item, dist: TIER_UNKNOWN };
  });

  // Stable sort: items with the same dist keep their original relative order
  scored.sort((a, b) => a.dist - b.dist);
  return scored.map((s) => s.item);
}


export function useDiscoverFeed({
  location,
  radiusKm,
}: {
  location: Location;
  radiusKm: number | null;
}) {
  const cacheKey = `discover_feed_${location.cityName ?? "global"}`;

  const [state, setState] = useState<DiscoverFeedState>({
    items: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
    hasMore: true,
    trailsAfter: null,
    backpackingAfter: null,
    urbexAfter: null,
    adventureAfter: null,
    socialAfter: null,
  });

  const isFetchingRef = useRef(false);
  const supplementalRef = useRef<FeedItem[]>([]);
  const lastItemsRef = useRef<FeedItem[]>([]);

  // On mount (or when city changes), load cached items instantly so the
  // feed is never blank — then the normal load() call fetches fresh data.
  useEffect(() => {
    readCache(cacheKey).then((cached) => {
      if (cached.length > 0) {
        lastItemsRef.current = cached;
        setState((prev) =>
          prev.items.length === 0
            ? { ...prev, items: cached, isLoading: true }
            : prev
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const load = useCallback(
    async (refresh = false) => {
      if (isFetchingRef.current) return;
      if (!refresh && !state.hasMore && state.items.length > 0) return;

      isFetchingRef.current = true;
      setState((prev) => ({
        ...prev,
        isLoading: !refresh,
        isRefreshing: refresh,
        error: null,
      }));

      try {
        // ── Phase 1: Reddit (fast, ~1-2s) ─────────────────────────────────
        // All five adventure categories fetched in parallel.
        const [trailsResult, backpackingResult, urbexResult, adventureResult, socialResult] =
          await Promise.allSettled([
            fetchCategoryReddit(TRAIL_CAT, location, refresh ? null : state.trailsAfter, "trails"),
            fetchCategoryReddit(BACKPACKING_CAT, location, refresh ? null : state.backpackingAfter, "backpacking"),
            fetchCategoryReddit(URBEX_CAT, location, refresh ? null : state.urbexAfter, "urbex"),
            fetchCategoryReddit(ADVENTURE_CAT, location, refresh ? null : state.adventureAfter, "adventure"),
            fetchCategoryReddit(SOCIAL_CAT, location, refresh ? null : state.socialAfter, "social"),
          ]);

        const trailItems       = trailsResult.status === "fulfilled" ? trailsResult.value.items : [];
        const backpackingItems = backpackingResult.status === "fulfilled" ? backpackingResult.value.items : [];
        const urbexItems       = urbexResult.status === "fulfilled" ? urbexResult.value.items : [];
        const adventureItems   = adventureResult.status === "fulfilled" ? adventureResult.value.items : [];
        const socialItems      = socialResult.status === "fulfilled" ? socialResult.value.items : [];

        const trailsAfter      = trailsResult.status === "fulfilled" ? trailsResult.value.after : state.trailsAfter;
        const backpackingAfter = backpackingResult.status === "fulfilled" ? backpackingResult.value.after : state.backpackingAfter;
        const urbexAfter       = urbexResult.status === "fulfilled" ? urbexResult.value.after : state.urbexAfter;
        const adventureAfter   = adventureResult.status === "fulfilled" ? adventureResult.value.after : state.adventureAfter;
        const socialAfter      = socialResult.status === "fulfilled" ? socialResult.value.after : state.socialAfter;

        const redditMerged = shuffleMerge([trailItems, backpackingItems, urbexItems, adventureItems, socialItems]);

        // Show Reddit results immediately — don't wait for supplemental
        const phase1Items = refresh
          ? redditMerged
          : deduplicateAndMerge(state.items, redditMerged);

        const phase1Sorted = sortByProximity(phase1Items, location.coords, location.cityName, location.regionName);
        const hasMore = !!(trailsAfter || backpackingAfter || urbexAfter || adventureAfter || socialAfter);

        if (phase1Sorted.length > 0) {
          lastItemsRef.current = phase1Sorted;
          writeCache(cacheKey, phase1Sorted);
        }
        setState({
          items: phase1Sorted.length > 0 ? phase1Sorted : lastItemsRef.current,
          isLoading: false,
          isRefreshing: false,
          error: null,
          hasMore,
          trailsAfter,
          backpackingAfter,
          urbexAfter,
          adventureAfter,
          socialAfter,
        });

        // ── Phase 2: Supplemental (background, only on refresh) ───────────
        // Kick off geocoding + OSM concurrently.
        // When they arrive, weave them into the already-visible feed.
        if (refresh) {
          // On web, ExpoLocation.geocodeAsync is unavailable — use Photon directly.
          // On native, the existing forwardGeocode (expo-location) is fine.
          const coordsPromise: Promise<{ latitude: number; longitude: number } | null> =
            location.coords
              ? Promise.resolve(location.coords)
              : location.cityName
              ? (Platform.OS === "web"
                  ? fetch(
                      `https://photon.komoot.io/api/?q=${encodeURIComponent(location.cityName)}&limit=1&lang=en`,
                      { signal: AbortSignal.timeout(8_000) }
                    )
                      .then((r) => r.json())
                      .then((j) => {
                        const coords = j?.features?.[0]?.geometry?.coordinates;
                        return coords ? { latitude: coords[1] as number, longitude: coords[0] as number } : null;
                      })
                      .catch(() => null)
                  : forwardGeocode(location.cityName)
                      .then((g) => (g ? { latitude: g.latitude, longitude: g.longitude } : null))
                      .catch(() => null))
              : Promise.resolve(null);

          const coordsResult = await coordsPromise.catch(() => null);
          const trailCoords = coordsResult;

          // Run Overpass queries sequentially — Overpass rate-limits concurrent
          // connections per IP, so running them in parallel causes one to silently fail.
          // Mapbox runs after Overpass (different server, no shared rate limit).
          const osmRadius = (radiusKm ?? 25) * 1000;
          let osm: FeedItem[] = [];
          let osmAbandoned: FeedItem[] = [];
          if (trailCoords) {
            try { osm = await fetchNearbyTrails(trailCoords.latitude, trailCoords.longitude, osmRadius); } catch { osm = []; }
            try { osmAbandoned = await fetchNearbyAbandonedPlaces(trailCoords.latitude, trailCoords.longitude, osmRadius); } catch { osmAbandoned = []; }
          }

          // Geocode Phase 1 Q&A-extracted items that have no coords yet.
          // These come from extractTrailsFromText / fetchLocalQuestionPosts and
          // are identifiable by their "extracted_" id prefix.
          const q2aItemsToGeocode = phase1Sorted
            .filter((item) => !item.locationCoords && item.id.startsWith("extracted_"))
            .slice(0, 10);

          // Wikipedia, Wikidata, Reddit urbex mining, and Q&A geocoding run in parallel
          const [wikipediaResult, wikidataResult, urbexMinedResult, q2aGeocodeResult] = await Promise.allSettled([
            trailCoords
              ? fetchWikipediaNearby(
                  trailCoords.latitude,
                  trailCoords.longitude,
                  osmRadius,
                  location.cityName,
                  location.regionName,
                )
              : Promise.resolve([] as FeedItem[]),
            trailCoords
              ? fetchWikidataAbandonedPlaces(
                  trailCoords.latitude,
                  trailCoords.longitude,
                  radiusKm ?? 25,
                )
              : Promise.resolve([] as FeedItem[]),
            // AI-mine urbex Reddit posts for specific named locations
            trailCoords && urbexItems.length > 0
              ? mineUrbexSelftext(urbexItems, location, trailCoords, radiusKm ?? 25)
              : Promise.resolve([] as FeedItem[]),
            // Resolve coordinates for Q&A-extracted trail/urbex items from Phase 1
            trailCoords && q2aItemsToGeocode.length > 0
              ? Promise.allSettled(
                  q2aItemsToGeocode.map((item) =>
                    geocodeNamedPlace(
                      item.title, item.locationName ?? null,
                      location.cityName, location.regionName,
                      trailCoords, radiusKm ?? 25
                    ).catch(() => null)
                  )
                )
              : Promise.resolve([]),
          ]);

          const wikiItems     = wikipediaResult.status === "fulfilled" ? wikipediaResult.value : [];
          const wikidataItems = wikidataResult.status === "fulfilled"  ? wikidataResult.value  : [];
          const urbexMined    = urbexMinedResult.status === "fulfilled" ? urbexMinedResult.value : [];

          // Build a coords map from Q&A geocoding results so we can patch Phase 1 items
          const q2aCoordsMap = new Map<string, { latitude: number; longitude: number }>();
          if (q2aGeocodeResult.status === "fulfilled" && Array.isArray(q2aGeocodeResult.value)) {
            const geocodedCoords = q2aGeocodeResult.value as PromiseSettledResult<{ latitude: number; longitude: number } | null>[];
            for (let i = 0; i < q2aItemsToGeocode.length; i++) {
              const r = geocodedCoords[i];
              if (r?.status === "fulfilled" && r.value) {
                q2aCoordsMap.set(q2aItemsToGeocode[i].id, r.value);
              }
            }
          }

          const newSupplemental = [...osm, ...osmAbandoned, ...wikidataItems, ...wikiItems, ...urbexMined];
          if (newSupplemental.length > 0) {
            supplementalRef.current = newSupplemental;
          }

          if (supplementalRef.current.length > 0) {
            // Hard radius filter — drop items whose coords exceed the user's range
            const radiusFiltered = filterByRadius(
              supplementalRef.current,
              location.coords,
              (radiusKm ?? 100)
            );

            const filteredSupplemental = radiusFiltered;

            // Merge filtered supplemental into the Phase 1 results (which are
            // already visible). OSM trail items float to the top.
            const [osmTrails, otherSupplemental] = filteredSupplemental.reduce<[FeedItem[], FeedItem[]]>(
              ([t, o], item) => (item.source === "trails" ? [[...t, item], o] : [t, [...o, item]]),
              [[], []]
            );
            // Patch Q&A items in phase1 with resolved coordinates before merging
            const phase1WithCoords = q2aCoordsMap.size > 0
              ? phase1Sorted.map((item) =>
                  q2aCoordsMap.has(item.id) ? { ...item, locationCoords: q2aCoordsMap.get(item.id)! } : item
                )
              : phase1Sorted;
            const combined = [...osmTrails, ...shuffleMerge([phase1WithCoords, otherSupplemental])];
            const deduped = deduplicateAndMerge([], combined);
            const sorted = sortByProximity(deduped, location.coords, location.cityName, location.regionName);
            if (sorted.length > 0) {
              lastItemsRef.current = sorted;
              writeCache(cacheKey, sorted);
            }
            setState((prev) => ({ ...prev, items: sorted.length > 0 ? sorted : prev.items }));
          }
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          items: prev.items.length > 0 ? prev.items : lastItemsRef.current,
          isLoading: false,
          isRefreshing: false,
          error: err instanceof Error ? err.message : "Failed to load quests",
        }));
      } finally {
        isFetchingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      location.cityName,
      location.regionName,
      location.countryName,
      location.coords?.latitude,
      location.coords?.longitude,
      radiusKm,
      state.trailsAfter,
      state.backpackingAfter,
      state.urbexAfter,
      state.adventureAfter,
      state.socialAfter,
      state.hasMore,
      state.items.length,
    ]
  );

  const loadMore = useCallback(() => {
    if (!state.isLoading && !state.isRefreshing && state.hasMore) {
      load(false);
    }
  }, [load, state.isLoading, state.isRefreshing, state.hasMore]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { ...state, load, loadMore, refresh };
}
