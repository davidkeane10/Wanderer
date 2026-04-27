/**
 * YouTube Data API v3 — urbex location discovery.
 *
 * Strategy:
 *   1. Search for videos tagged with location + urbex keywords
 *   2. Fetch titles, descriptions, and channel info for each result
 *   3. Feed titles + descriptions into Ollama to extract location clues
 *   4. Fetch top comments (creators often drop location hints there)
 *   5. Feed comments into Ollama for a second extraction pass
 *
 * API key: EXPO_PUBLIC_YOUTUBE_API_KEY in .env
 * Quota: search = 100 units, video details = 1 unit, comments = 1 unit
 * Free tier: 10,000 units/day — enough for ~80 searches.
 *
 * Falls back silently to [] if API key is missing or quota exceeded.
 */

import type { FeedItem } from "../types/feed";
import { extractUrbexLocations } from "./ollama";
import { forwardGeocode } from "./geocode";

const API_KEY = process.env.EXPO_PUBLIC_YOUTUBE_API_KEY ?? "";
const BASE    = "https://www.googleapis.com/youtube/v3";

const ENABLED = API_KEY.length > 0;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface YTSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { medium?: { url: string } };
  };
}

interface YTVideoDetail {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    tags?: string[];
    thumbnails?: { medium?: { url: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string };
}

interface YTComment {
  snippet: {
    topLevelComment: {
      snippet: { textDisplay: string; likeCount: number };
    };
  };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function searchVideos(query: string, maxResults = 8): Promise<YTSearchItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults),
    relevanceLanguage: "en",
    safeSearch: "none",
    key: API_KEY,
  });
  try {
    const res = await fetchWithTimeout(`${BASE}/search?${params}`, 10_000);
    if (!res.ok) {
      if (__DEV__) console.warn(`[YouTube] search failed: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json() as { items?: YTSearchItem[] };
    return data.items ?? [];
  } catch (err) {
    if (__DEV__) console.warn(`[YouTube] search error:`, err);
    return [];
  }
}

async function fetchVideoDetails(videoIds: string[]): Promise<YTVideoDetail[]> {
  if (videoIds.length === 0) return [];
  const params = new URLSearchParams({
    part: "snippet,statistics",
    id: videoIds.join(","),
    key: API_KEY,
  });
  try {
    const res = await fetchWithTimeout(`${BASE}/videos?${params}`, 10_000);
    if (!res.ok) return [];
    const data = await res.json() as { items?: YTVideoDetail[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

async function fetchTopComments(videoId: string, maxResults = 30): Promise<string[]> {
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    order: "relevance",
    maxResults: String(maxResults),
    key: API_KEY,
  });
  try {
    const res = await fetchWithTimeout(`${BASE}/commentThreads?${params}`, 10_000);
    if (!res.ok) return [];
    const data = await res.json() as { items?: YTComment[] };
    return (data.items ?? [])
      .map(c => c.snippet?.topLevelComment?.snippet?.textDisplay ?? "")
      .filter(t => t.length > 20)
      .sort((a, b) => {
        // Sort longer comments first — they tend to have more location detail
        return b.length - a.length;
      })
      .slice(0, 15);
  } catch {
    return [];
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Search YouTube for urbex videos near a location, then use Ollama to extract
 * specific place names from video descriptions and top comments.
 *
 * Returns FeedItems with coords (where geocoding succeeded) or without
 * (caller's radius filter will keep coordless items that passed text checks).
 */
export async function fetchYouTubeUrbexPlaces(
  cityName: string | null,
  regionName: string | null,
  distanceKm: number,
  userCoords: { latitude: number; longitude: number } | null
): Promise<FeedItem[]> {
  if (!ENABLED) {
    if (__DEV__) console.log("[YouTube] Skipped — no API key (set EXPO_PUBLIC_YOUTUBE_API_KEY)");
    return [];
  }

  const locationStr = [cityName, regionName].filter(Boolean).join(" ") || "unknown";

  // Build two complementary search queries — cast a wide net
  const queries = [
    `${locationStr} urbex abandoned`,
    `${locationStr} abandoned building exploring`,
  ];

  if (__DEV__) console.log(`[YouTube] Searching: "${queries[0]}" + "${queries[1]}"`);

  // Run both searches in parallel
  const [r1, r2] = await Promise.allSettled(queries.map(q => searchVideos(q, 6)));
  const searchItems: YTSearchItem[] = [
    ...(r1.status === "fulfilled" ? r1.value : []),
    ...(r2.status === "fulfilled" ? r2.value : []),
  ];

  // De-dupe by videoId
  const seen = new Set<string>();
  const unique = searchItems.filter(item => {
    const id = item.id?.videoId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 10);

  if (unique.length === 0) {
    if (__DEV__) console.log("[YouTube] No videos found");
    return [];
  }

  const videoIds = unique.map(i => i.id.videoId);
  if (__DEV__) console.log(`[YouTube] Got ${unique.length} videos — fetching details + comments`);

  // Fetch full details + comments for top 5 videos in parallel
  const [details, ...commentBatches] = await Promise.allSettled([
    fetchVideoDetails(videoIds),
    ...videoIds.slice(0, 5).map(id => fetchTopComments(id, 30)),
  ]);

  const videoDetails: YTVideoDetail[] = details.status === "fulfilled" ? details.value : [];
  const commentsByVideo: string[][] = commentBatches.map(r =>
    r.status === "fulfilled" ? (r.value as string[]) : []
  );

  const detailMap = new Map(videoDetails.map(v => [v.id, v]));

  // For each video, build a combined text blob (description + comments) and
  // ask Ollama to extract location clues from it.
  const extractionPromises = unique.slice(0, 5).map(async (item, idx) => {
    const videoId = item.id.videoId;
    const detail  = detailMap.get(videoId);
    const title   = detail?.snippet.title ?? item.snippet.title;
    const desc    = detail?.snippet.description ?? item.snippet.description;
    const comments = commentsByVideo[idx] ?? [];

    // Combine description + top comments into one text block for AI
    const bodyText = [
      desc.slice(0, 800),
      comments.length > 0 ? "--- Top comments ---" : "",
      ...comments.slice(0, 10),
    ].filter(Boolean).join("\n");

    const locations = await extractUrbexLocations(title, bodyText, cityName, regionName);

    return { videoId, title, desc, item, detail, locations };
  });

  const extracted = await Promise.allSettled(extractionPromises);

  // Geocode all candidates and build FeedItems
  const feedItems: FeedItem[] = [];

  for (const result of extracted) {
    if (result.status !== "fulfilled") continue;
    const { videoId, title, desc, item, detail, locations } = result.value;

    const thumbnail =
      detail?.snippet.thumbnails?.medium?.url ??
      item.snippet.thumbnails?.medium?.url ??
      null;

    const channelTitle = detail?.snippet.channelTitle ?? item.snippet.channelTitle;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (locations.length === 0) {
      // No specific locations extracted — still surface the video itself as a
      // soft lead (no coords, will rely on text-based locality check)
      feedItems.push({
        id: `yt_${videoId}`,
        source: "ai",
        activityType: "urbex",
        title,
        description: desc.slice(0, 300) || "Urban exploration video",
        imageUrl: thumbnail,
        externalUrl: videoUrl,
        locationName: locationStr,
        locationCoords: null,
        score: null,
        commentCount: null,
        createdAt: null,
        sourceName: `YouTube · ${channelTitle}`,
        rating: null,
      });
      continue;
    }

    // Geocode extracted locations
    const geocodeResults = await Promise.allSettled(
      locations.map(loc => forwardGeocode(loc.searchQuery).catch(() => null))
    );

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const geo = geocodeResults[i];
      const geoResult = geo.status === "fulfilled" ? geo.value : null;

      if (!geoResult && loc.confidence < 0.85) continue;

      // Radius check — drop if we have coords and they're out of range
      if (geoResult && userCoords && distanceKm) {
        const dLat = geoResult.latitude  - userCoords.latitude;
        const dLon = geoResult.longitude - userCoords.longitude;
        const approxKm = Math.sqrt(dLat * dLat + dLon * dLon) * 111;
        if (approxKm > distanceKm * 1.2) continue; // 20% buffer
      }

      feedItems.push({
        id: `yt_loc_${videoId}_${i}`,
        source: "ai",
        activityType: "urbex",
        title: loc.name,
        description: `Found in YouTube video: "${title}" by ${channelTitle}`,
        imageUrl: thumbnail,
        externalUrl: videoUrl,
        locationName: loc.searchQuery,
        locationCoords: geoResult
          ? { latitude: geoResult.latitude, longitude: geoResult.longitude }
          : null,
        score: null,
        commentCount: null,
        createdAt: null,
        sourceName: `YouTube · AI`,
        rating: null,
      });
    }
  }

  if (__DEV__) console.log(`[YouTube] ✅ ${feedItems.length} urbex places extracted from ${unique.length} videos`);
  return feedItems;
}
