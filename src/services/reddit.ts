import { Platform } from "react-native";
import type { RedditListing, RedditPost } from "../types/reddit";

const BASE_URL = "https://www.reddit.com";
const USER_AGENT = "SideQuests/1.0 (Expo App)";

/**
 * Platform-aware fetch for Reddit.
 * On web: routes through /api/reddit (server-side proxy) so the server sets
 *   the User-Agent and avoids browser rate-limiting.
 * On native: fetches directly with the custom User-Agent.
 */
async function redditFetch(url: string): Promise<Response> {
  if (Platform.OS === "web") {
    // Try the server-side proxy first (avoids browser rate-limiting + sets User-Agent)
    try {
      const proxyRes = await fetch("/api/reddit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(15_000),
      });
      // Fall through to direct fetch only if the route itself is missing (404/405)
      if (proxyRes.status !== 404 && proxyRes.status !== 405) return proxyRes;
    } catch {
      // Proxy unreachable — fall through to direct fetch
    }
    // Direct fetch fallback (browser UA, no custom header — Reddit still responds)
    return fetch(url, { signal: AbortSignal.timeout(12_000) });
  }
  return fetch(url, { headers: { "User-Agent": USER_AGENT } });
}

function buildUrl(
  subreddits: string[],
  sort: "hot" | "top" | "new",
  params: { limit?: number; after?: string | null; t?: string } = {}
): string {
  const subredditPath = subreddits.join("+");
  const { limit = 25, after, t = "week" } = params;

  const query = new URLSearchParams({ raw_json: "1", limit: String(limit) });
  if (after) query.set("after", after);
  if (sort === "top") query.set("t", t);

  return `${BASE_URL}/r/${subredditPath}/${sort}.json?${query.toString()}`;
}

// Question post detection — these are filtered from the main feed and mined
// separately via fetchPostComments + trailExtractor.
const QUESTION_STARTERS =
  /^(?:where|what|which|who|how|any(?:one|body)?(?:\s+know)?|does anyone|has anyone|is there|are there|can anyone|could anyone|looking for|need (?:help|suggestions?|recommendations?)|best (?:places?|spots?|trails?|hikes?|areas?)|recommend(?:ations)?|suggestions? for|advice(?:\s+on)?|help (?:finding|with)|what(?:'s| is) (?:good|great|worth|the best)|thoughts on|opinions on|anyone been|any recs|any good|worth (?:visiting|going|checking))/i;

// Anywhere in the title — catches mid-sentence question phrases
const QUESTION_ANYWHERE =
  /\b(?:looking for (?:suggestions?|recommendations?|spots?|places?|trails?)|anyone (?:know|been|tried)|any (?:recommendations?|suggestions?|good spots?|hidden gems?)|worth (?:visiting|going to)|where (?:to go|can i|should i)|what(?:'s| is) (?:the best|a good|worth))\b/i;

export function isQuestionPost(post: RedditPost): boolean {
  const t = post.title.trim();
  return t.endsWith("?") || QUESTION_STARTERS.test(t) || QUESTION_ANYWHERE.test(t);
}

function isValidPost(post: RedditPost): boolean {
  if (post.over_18) return false;
  if (post.selftext === "[deleted]" || post.selftext === "[removed]") return false;
  if (!post.title || post.title.trim().length === 0) return false;
  if (isQuestionPost(post)) return false; // mine separately via fetchPostComments
  return true;
}

export interface RedditCommentSnippet {
  id: string;
  body: string;
  score: number;
}

/**
 * Fetches the top-scored comments for a single Reddit post.
 * Used to extract trail/place mentions from Q&A posts.
 */
export async function fetchPostComments(
  permalink: string,
  limit = 20
): Promise<RedditCommentSnippet[]> {
  try {
    const url = `${BASE_URL}${permalink}.json?limit=${limit}&sort=top&raw_json=1`;
    const res = await redditFetch(url);
    if (!res.ok) return [];
    const json: unknown[] = await res.json();
    if (!Array.isArray(json) || json.length < 2) return [];

    // json[1] is the comment listing
    const commentListing = json[1] as {
      data?: { children?: Array<{ kind: string; data: { id: string; body: string; score: number } }> };
    };

    return (commentListing.data?.children ?? [])
      .filter(
        (c) =>
          c.kind === "t1" &&
          c.data?.body &&
          c.data.body !== "[deleted]" &&
          c.data.body !== "[removed]"
      )
      .map((c) => ({ id: c.data.id, body: c.data.body, score: c.data.score ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Searches subreddits for Q&A posts about local trails/activities, then
 * fetches their comments so the caller can extract structured place data.
 * Only question posts (ending in "?" or matching question starters) are returned.
 */
export async function fetchLocalQuestionPosts(
  subreddits: string[],
  locationKeywords: string[],
  limit = 10
): Promise<RedditPost[]> {
  if (subreddits.length === 0 || locationKeywords.length === 0) return [];
  try {
    const result = await searchPosts(subreddits, locationKeywords, {
      limit,
      timeframe: "year",
    });
    return result.posts
      .filter((p) => p.is_self) // text posts only — they have selftext & real comments
      .filter(isQuestionPost)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export interface FetchPostsResult {
  posts: RedditPost[];
  after: string | null;
}

export async function fetchPosts(
  subreddits: string[],
  sort: "hot" | "top" | "new",
  options: { limit?: number; after?: string | null; timeframe?: string } = {}
): Promise<FetchPostsResult> {
  const url = buildUrl(subreddits, sort, {
    limit: options.limit ?? 25,
    after: options.after,
    t: options.timeframe ?? "week",
  }); 

  const response = await redditFetch(url);

  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
  }

  const json: RedditListing = await response.json();
  const posts = json.data.children
    .map((child) => child.data)
    .filter(isValidPost);

  return {
    posts,
    after: json.data.after,
  };
}

export function getRedditUrl(permalink: string): string {
  return `${BASE_URL}${permalink}`;
}

/**
 * Search within specific subreddits using Reddit's search API.
 * Used when a location is set — we restrict to city/region subreddits and
 * search for category keywords, returning inherently local content.
 *
 * Example: r/vancouver+r/britishcolumbia searching "hiking trail trailhead"
 */
export async function searchPosts(
  subreddits: string[],
  keywords: string[],
  options: { limit?: number; after?: string | null; timeframe?: string } = {}
): Promise<FetchPostsResult> {
  if (subreddits.length === 0 || keywords.length === 0) {
    return { posts: [], after: null };
  }

  // Use the top keywords as a space-separated query (Reddit treats this as OR)
  const query = keywords.slice(0, 6).join(" ");
  const subredditPath = subreddits.join("+");
  const { limit = 25, after, timeframe = "month" } = options;

  const params = new URLSearchParams({
    q: query,
    restrict_sr: "true",
    sort: "relevance",
    t: timeframe,
    limit: String(limit),
    raw_json: "1",
  });
  if (after) params.set("after", after);

  const url = `${BASE_URL}/r/${subredditPath}/search.json?${params.toString()}`;

  const response = await redditFetch(url);

  if (!response.ok) {
    throw new Error(`Reddit search error: ${response.status} ${response.statusText}`);
  }

  const json: RedditListing = await response.json();
  const posts = json.data.children.map((child) => child.data).filter(isValidPost);

  return { posts, after: json.data.after };
}
