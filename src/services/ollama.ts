/**
 * AI client for SideQuests.
 *
 * Priority:
 *   1. Claude Haiku (Anthropic API) — production, fast (~1-3s), cloud-native.
 *      Requires EXPO_PUBLIC_ANTHROPIC_API_KEY to be set.
 *   2. Ollama (local) — dev fallback when the Anthropic key is absent.
 *      Requires EXPO_PUBLIC_OLLAMA_BASE_URL + EXPO_PUBLIC_OLLAMA_MODEL.
 *
 * All public exports are unchanged — callers don't need to know which
 * backend is active.
 */

export type CategoryKey = "hiking" | "urbex" | "town" | "other";

export interface QueryParams {
  keywords: string[];
  elevationPreference: "flat" | "moderate" | "steep" | "any";
  difficulty: "easy" | "moderate" | "hard" | null;
  estimatedDurationHours: number | null;
  trailDistanceKm: number | null;
  summary: string;
  isBackpacking?: boolean;
}

export interface EnrichedResult {
  id: string;
  description: string;
  relevanceScore: number;
}

export interface AISuggestion {
  title: string;
  description: string;
  locationName: string;
  tags: string[];
  estimatedDurationHours: number | null;
  difficulty: "easy" | "moderate" | "hard" | null;
}

// ── Config ─────────────────────────────────────────────────────────────────

// On web: AI calls go through the server-side /api/ai proxy (key never in bundle).
// On native: fall back to a local Ollama server (dev) or direct Claude if key present.
import { Platform } from "react-native";

const USE_WEB_PROXY = Platform.OS === "web";

// Native-only direct Claude (EXPO_PUBLIC key only used on native builds)
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const OLLAMA_BASE_URL = process.env.EXPO_PUBLIC_OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.EXPO_PUBLIC_OLLAMA_MODEL ?? "qwen2.5";

const USE_CLAUDE = !USE_WEB_PROXY && ANTHROPIC_KEY.length > 0;

// ── Category context ────────────────────────────────────────────────────────

const CATEGORY_CONTEXT: Record<
  CategoryKey,
  { label: string; description: string; exampleSearches: string[] }
> = {
  hiking: {
    label: "Hiking & outdoor trails",
    description:
      "Trails, peaks, waterfalls, national parks, forest walks, ridge paths, and outdoor nature adventures. " +
      "Relevant terms: trail, summit, waterfall, loop, forest, peak, ridge, park, scenic, trailhead.",
    exampleSearches: [
      "a waterfall trail, 2 hours, relatively flat",
      "a scenic mountain summit with good views",
      "a forest loop walk suitable for beginners",
    ],
  },
  urbex: {
    label: "Urban exploring & abandoned places",
    description:
      "Abandoned buildings, derelict factories, forgotten ruins, hidden tunnels, decay photography spots. " +
      "Relevant terms: abandoned, derelict, ruin, factory, hospital, asylum, warehouse, forgotten, urban decay.",
    exampleSearches: [
      "an abandoned factory with history, eerie atmosphere",
      "derelict hospital or asylum with interesting architecture",
      "hidden underground tunnels or forgotten bunkers",
    ],
  },
  town: {
    label: "City & town activities",
    description:
      "Restaurants, cafés, bars, markets, events, galleries, local hidden gems, and things to do in the city. " +
      "Relevant terms: restaurant, café, bar, market, gallery, event, local, neighbourhood, hidden gem.",
    exampleSearches: [
      "a cosy coffee shop perfect for a quiet afternoon",
      "a fun activity for a group of friends on the weekend",
      "a rooftop bar or unique dining experience",
    ],
  },
  other: {
    label: "Unique & off-the-beaten-path",
    description:
      "Unusual experiences, scenic viewpoints, secret spots, photography locations, and anything that doesn't fit a standard category. " +
      "Relevant terms: unique, scenic, hidden, secret, viewpoint, sunset, photography, unusual, quirky.",
    exampleSearches: [
      "a scenic spot to watch the sunset with friends",
      "a quirky or unusual local attraction",
      "a secret beach or hidden valley",
    ],
  },
};

// ── Shared timeout helper ───────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Claude Haiku backend ────────────────────────────────────────────────────

async function claudeChat(
  system: string,
  user: string,
  timeoutMs: number
): Promise<string> {
  if (__DEV__) console.log(`[AI/Claude] model=${ANTHROPIC_MODEL} timeout=${timeoutMs}ms`);

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    },
    timeoutMs
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text ?? "{}";
  if (__DEV__) console.log(`[AI/Claude] ✓ ${content.length} chars`);
  return content;
}

// ── Ollama backend ──────────────────────────────────────────────────────────

async function ollamaChat(
  system: string,
  user: string,
  timeoutMs: number
): Promise<string> {
  if (__DEV__) console.log(`[AI/Ollama] → ${OLLAMA_BASE_URL} model=${OLLAMA_MODEL}`);

  const res = await fetchWithTimeout(
    `${OLLAMA_BASE_URL}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
        format: "json",
        keep_alive: "10m",
        options: { temperature: 0.3 },
      }),
    },
    timeoutMs
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (__DEV__) console.log(`[AI/Ollama] ✓ ${(data.message?.content ?? "").length} chars`);
  return data.message?.content ?? "{}";
}

// ── Web proxy backend (production web / PWA) ───────────────────────────────

async function webProxyChat(
  system: string,
  user: string,
  timeoutMs: number
): Promise<string> {
  if (__DEV__) console.log(`[AI/WebProxy] → /api/ai timeout=${timeoutMs}ms`);

  const res = await fetchWithTimeout(
    "/api/ai",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user }),
    },
    timeoutMs
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI proxy HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (typeof data.text !== "string") throw new Error("Proxy returned no text");
  if (__DEV__) console.log(`[AI/WebProxy] ✓ ${data.text.length} chars`);
  return data.text;
}

// ── Serial queue (Ollama only — Claude handles concurrency natively) ────────

let _ollamaTail: Promise<unknown> = Promise.resolve();

/**
 * Route a chat request to Claude (if key present) or Ollama (dev fallback).
 * Ollama calls are serialised to prevent concurrency issues with large models.
 */
function aiChat(system: string, user: string, timeoutMs = 30_000): Promise<string> {
  if (USE_WEB_PROXY) {
    return webProxyChat(system, user, timeoutMs);
  }
  if (USE_CLAUDE) {
    return claudeChat(system, user, timeoutMs);
  }
  // Serialise Ollama requests — 32B model handles one at a time
  const result = (_ollamaTail as Promise<unknown>).then(
    () => ollamaChat(system, user, timeoutMs),
    () => ollamaChat(system, user, timeoutMs)
  ) as Promise<string>;
  _ollamaTail = result.then(() => {}, () => {});
  return result;
}

// ── Availability check ──────────────────────────────────────────────────────

let _availableCache: { result: boolean; at: number } | null = null;
let _availableInFlight: Promise<boolean> | null = null;

export async function isOllamaAvailable(): Promise<boolean> {
  // On web the proxy handles everything — always report as available
  if (USE_WEB_PROXY) return true;

  if (_availableCache && Date.now() - _availableCache.at < 30_000) {
    return _availableCache.result;
  }
  if (_availableInFlight) return _availableInFlight;

  _availableInFlight = (async () => {
    try {
      if (USE_CLAUDE) {
        // Quick ping to verify the key works
        await claudeChat("Reply with {}", "{}", 8_000);
        _availableCache = { result: true, at: Date.now() };
        return true;
      }
      const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/tags`, {}, 8_000);
      if (!res.ok) { _availableCache = { result: false, at: Date.now() }; return false; }
      const data = await res.json() as { models?: Array<{ name: string }> };
      const names = (data.models ?? []).map((m) => m.name);
      const available = names.some((n) => n === OLLAMA_MODEL || n.startsWith(OLLAMA_MODEL.split(":")[0]));
      _availableCache = { result: available, at: Date.now() };
      return available;
    } catch (err) {
      if (__DEV__) console.warn(`[AI] isOllamaAvailable failed:`, err);
      _availableCache = { result: false, at: Date.now() };
      return false;
    } finally {
      _availableInFlight = null;
    }
  })();

  return _availableInFlight;
}

export function getModelName(): string {
  return USE_CLAUDE ? ANTHROPIC_MODEL : OLLAMA_MODEL;
}

// ── Public AI functions ─────────────────────────────────────────────────────

export async function expandQuery(
  category: CategoryKey,
  distanceKm: number,
  description: string
): Promise<QueryParams> {
  const descLower = description.toLowerCase();
  const fallbackDifficulty: QueryParams["difficulty"] =
    /\beasy\b/.test(descLower) ? "easy"
    : /\bhard\b|\bdifficult\b|\bchallenging\b/.test(descLower) ? "hard"
    : /\bmoderate\b/.test(descLower) ? "moderate"
    : null;

  let fallbackTrailDistanceKm: number | null = null;
  const milesMatch = descLower.match(/(\d+(?:\.\d+)?)\s*mi(?:le)?s?/);
  const kmMatch    = descLower.match(/(\d+(?:\.\d+)?)\s*km/);
  if (milesMatch) fallbackTrailDistanceKm = parseFloat(milesMatch[1]) * 1.609;
  else if (kmMatch) fallbackTrailDistanceKm = parseFloat(kmMatch[1]);

  const fallback: QueryParams = {
    keywords: descLower
      .match(/\b[a-z]{4,}\b/g)
      ?.filter((w) => !["with","that","and","the","for","not","are","this","want","looking","something"].includes(w))
      .slice(0, 6) ?? [],
    elevationPreference: descLower.includes("flat") ? "flat"
      : descLower.includes("steep") ? "steep"
      : "any",
    difficulty: fallbackDifficulty,
    estimatedDurationHours: null,
    trailDistanceKm: fallbackTrailDistanceKm,
    summary: description,
  };

  const ctx = CATEGORY_CONTEXT[category];

  try {
    const raw = await aiChat(
      `You are a search assistant for SideQuests, an outdoor adventure and place discovery app.
Your job is to extract structured search parameters from the user's request.
Return ONLY valid JSON, no explanation, no markdown fences.`,
      `Category: ${ctx.label}
Category description: ${ctx.description}
Example searches: ${ctx.exampleSearches.join(" | ")}
Max distance: ${distanceKm} km
User says: "${description}"

Return this JSON:
{
  "keywords": ["waterfall", "easy", "short"],
  "elevationPreference": "flat",
  "difficulty": "easy",
  "estimatedDurationHours": 2,
  "trailDistanceKm": 5,
  "summary": "one sentence summary"
}

Rules:
- keywords: 3–8 specific nouns/adjectives (waterfall, ruins, easy, short, eerie, scenic)
- elevationPreference: "flat", "moderate", "steep", or "any"
- difficulty: "easy", "moderate", "hard", or null — only if explicitly stated
- estimatedDurationHours: number or null
- trailDistanceKm: km or null
- summary: concise one-sentence rewrite`,
      USE_CLAUDE ? 15_000 : 180_000
    );

    const p = JSON.parse(raw);
    return {
      keywords: Array.isArray(p.keywords) ? p.keywords.slice(0, 8).map(String) : fallback.keywords,
      elevationPreference: ["flat","moderate","steep","any"].includes(p.elevationPreference)
        ? p.elevationPreference : fallback.elevationPreference,
      difficulty: ["easy","moderate","hard"].includes(p.difficulty) ? p.difficulty : fallback.difficulty,
      estimatedDurationHours: typeof p.estimatedDurationHours === "number" ? p.estimatedDurationHours : null,
      trailDistanceKm: typeof p.trailDistanceKm === "number" ? p.trailDistanceKm : fallback.trailDistanceKm,
      summary: typeof p.summary === "string" && p.summary.length > 0 ? p.summary : description,
    };
  } catch (err) {
    if (__DEV__) console.warn(`[AI] expandQuery failed:`, err);
    return fallback;
  }
}

export async function enrichResults(
  items: Array<{ id: string; title: string; description: string; locationName: string | null }>,
  userQuery: string
): Promise<EnrichedResult[]> {
  if (items.length === 0) return [];

  const batch = items.slice(0, 15).map((i) => ({
    id: i.id,
    title: i.title,
    existing: i.description.slice(0, 180),
    location: i.locationName ?? "",
  }));

  try {
    const raw = await aiChat(
      `You write content for SideQuests, an adventure discovery app.
Write short, exciting 2-sentence descriptions for places based on what the user wants.
Return ONLY a valid JSON array, no explanation, no markdown fences.`,
      `User is looking for: "${userQuery}"

Places:
${JSON.stringify(batch)}

Return:
[{ "id": "...", "description": "Two engaging sentences.", "relevanceScore": 8 }]

relevanceScore: 1–10. Write as if excited to tell a friend.`,
      USE_CLAUDE ? 20_000 : 180_000
    );

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.id === "string" && typeof r.description === "string" && typeof r.relevanceScore === "number")
      .map((r) => ({
        id: r.id,
        description: r.description.slice(0, 500),
        relevanceScore: Math.min(10, Math.max(1, Math.round(r.relevanceScore))),
      }));
  } catch (err) {
    if (__DEV__) console.warn(`[AI] enrichResults failed:`, err);
    return [];
  }
}

export interface ArcGISFilterResult {
  id: string;
  urbexScore: number;
}

export async function filterArcGISForUrbex(
  items: Array<{ id: string; title: string; description: string; locationName: string }>,
  userDescription: string
): Promise<ArcGISFilterResult[]> {
  if (items.length === 0) return [];

  const fallback: ArcGISFilterResult[] = items.map((i) => ({ id: i.id, urbexScore: 5 }));
  const batch = items.slice(0, 30).map((i) => ({
    id: i.id,
    title: i.title,
    info: i.description.slice(0, 200),
    location: i.locationName,
  }));

  try {
    const raw = await aiChat(
      `You filter historic and haunted places for urban exploration potential.
HIGH (7–10): Ruins, abandoned buildings, derelict factories, ghost towns, asylums, old mines.
MEDIUM (4–6): Historic forts, old battlefields, remote cemeteries, disused industrial sites.
LOW (1–3): Active museums, functioning courthouses, churches, monuments, plaques.
Return ONLY a valid JSON array, no explanation, no markdown fences.`,
      `User wants: "${userDescription}"

Places:
${JSON.stringify(batch)}

Return: [{ "id": "...", "urbexScore": 7 }]`,
      USE_CLAUDE ? 20_000 : 180_000
    );

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    return parsed
      .filter((r) => r && typeof r.id === "string" && typeof r.urbexScore === "number")
      .map((r) => ({ id: r.id, urbexScore: Math.min(10, Math.max(1, Math.round(r.urbexScore))) }));
  } catch (err) {
    if (__DEV__) console.warn(`[AI] filterArcGISForUrbex failed:`, err);
    return fallback;
  }
}

export async function suggestPlaces(
  category: CategoryKey,
  distanceKm: number,
  description: string,
  location: { cityName: string | null; regionName: string | null; countryName: string | null }
): Promise<AISuggestion[]> {
  const ctx = CATEGORY_CONTEXT[category];
  const locationStr = [location.cityName, location.regionName, location.countryName]
    .filter(Boolean).join(", ") || "the user's current location";

  try {
    const raw = await aiChat(
      `You are a local adventure and place discovery expert for SideQuests.
You know real, specific places in cities and regions around the world.
Return ONLY a valid JSON array, no explanation, no markdown fences.`,
      `User is near ${locationStr} and wants ${ctx.label} within ${distanceKm} km.
Category: ${ctx.description}
User description: "${description}"

Suggest 5 specific, real places.

Return:
[{
  "title": "Exact place name",
  "description": "2-3 exciting sentences. Be specific — mention features and atmosphere.",
  "locationName": "Specific area or landmark",
  "tags": ["tag1", "tag2"],
  "estimatedDurationHours": 2,
  "difficulty": "moderate"
}]

Rules:
- Only suggest places that realistically exist near ${locationStr}
- difficulty: "easy", "moderate", "hard", or null
- estimatedDurationHours: number or null
- tags: 2–4 short tags`,
      USE_CLAUDE ? 20_000 : 180_000
    );

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.title === "string" && typeof s.description === "string" && typeof s.locationName === "string")
      .slice(0, 5)
      .map((s) => ({
        title: String(s.title).slice(0, 120),
        description: String(s.description).slice(0, 600),
        locationName: String(s.locationName).slice(0, 120),
        tags: Array.isArray(s.tags) ? s.tags.slice(0, 4).map(String) : [],
        estimatedDurationHours: typeof s.estimatedDurationHours === "number" ? s.estimatedDurationHours : null,
        difficulty: ["easy","moderate","hard"].includes(s.difficulty) ? s.difficulty : null,
      }));
  } catch (err) {
    if (__DEV__) console.warn(`[AI] suggestPlaces failed:`, err);
    return [];
  }
}

// ── Activity Insights ──────────────────────────────────────────────────────

export interface ActivityInsights {
  overview: string;
  // Hiking / trails / backpacking
  difficulty?: "easy" | "moderate" | "hard";
  durationHours?: number;
  distanceKm?: number;
  elevationGainM?: number;
  trailType?: "loop" | "out-and-back" | "point-to-point";
  bestSeason?: string;
  highlights?: string[];
  whatToBring?: string[];
  tips?: string[];
  accessInfo?: string;
  // Urbex / adventure
  history?: string;
  era?: string;
  safetyNotes?: string[];
  photographyTips?: string[];
  // Town / food / social / arts
  knownFor?: string;
  priceRange?: string;
  bestTime?: string;
  bookingRequired?: boolean;
  nearbyAttractions?: string[];
  // Adventure
  skillLevel?: string;
  gearNeeded?: string[];
  conditions?: string;
}

const INSIGHTS_SCHEMA_BY_TYPE: Record<string, string> = {
  trails: `{
  "overview": "2-sentence description of what makes this trail special",
  "difficulty": "easy|moderate|hard",
  "durationHours": 3.5,
  "distanceKm": 8.5,
  "elevationGainM": 320,
  "trailType": "loop|out-and-back|point-to-point",
  "bestSeason": "Spring to Autumn",
  "highlights": ["viewpoint at summit", "waterfall at km 4"],
  "whatToBring": ["water", "sunscreen", "trail shoes"],
  "tips": ["start early to avoid crowds", "parking fills by 9am"],
  "accessInfo": "Free parking at trailhead on Forest Road 12"
}`,
  backpacking: `{
  "overview": "2-sentence description",
  "difficulty": "moderate",
  "durationHours": null,
  "distanceKm": 40,
  "elevationGainM": 1200,
  "bestSeason": "July to September",
  "highlights": ["alpine lakes", "ridge camping"],
  "whatToBring": ["bear canister", "water filter", "permit"],
  "tips": ["book permits 6 months ahead", "water sources dry up by late summer"],
  "accessInfo": "Permit required from ranger station"
}`,
  urbex: `{
  "overview": "2-sentence atmospheric description",
  "history": "Brief history of the building or site",
  "era": "1920s industrial",
  "safetyNotes": ["wear sturdy boots", "test floors before stepping", "bring backup torch"],
  "photographyTips": ["golden hour through east windows", "bring wide-angle lens"],
  "tips": ["best visited on weekday mornings", "security patrols on weekends"],
  "highlights": ["grand ballroom on second floor", "original machinery intact"]
}`,
  adventure: `{
  "overview": "2-sentence description",
  "skillLevel": "intermediate",
  "difficulty": "hard",
  "gearNeeded": ["harness", "helmet", "chalk bag"],
  "bestSeason": "April to October",
  "conditions": "Check weather and wind before visiting",
  "highlights": ["exposed ridgeline", "panoramic views"],
  "tips": ["hire a guide if new", "conditions can change quickly"],
  "safetyNotes": ["never go alone", "have emergency contact aware of your plan"]
}`,
  food: `{
  "overview": "2-sentence description of what makes this place worth visiting",
  "knownFor": "wood-fired pizza and natural wine list",
  "priceRange": "€€–€€€",
  "bestTime": "Tuesday to Thursday evenings are quieter",
  "bookingRequired": true,
  "highlights": ["tasting menu", "hidden rooftop terrace"],
  "tips": ["ask for the off-menu specials", "bar seats available walk-in"],
  "nearbyAttractions": ["night market on Friday", "cocktail bar next door"]
}`,
  social: `{
  "overview": "2-sentence summary of the activity or venue",
  "bestTime": "Friday evenings, 7pm onwards",
  "bookingRequired": false,
  "highlights": ["friendly crowd", "beginner-friendly sessions"],
  "tips": ["bring ID", "show up 15 minutes early for introductions"],
  "whatToBring": ["comfortable shoes", "a friend or go solo — both welcome"],
  "nearbyAttractions": ["good bar nearby for after"]
}`,
  arts: `{
  "overview": "2-sentence description of what's on or what makes it notable",
  "knownFor": "contemporary local artists and monthly openings",
  "bestTime": "Opening night events are free and social",
  "bookingRequired": false,
  "highlights": ["permanent collection", "rotating exhibitions"],
  "tips": ["check website for current shows", "guided tours on weekends"],
  "nearbyAttractions": ["café on ground floor", "sculpture garden"]
}`,
  geocache: `{
  "overview": "2-sentence description of the cache or area",
  "difficulty": "easy",
  "highlights": ["scenic walk to cache", "multi-stage puzzle"],
  "whatToBring": ["pen for logbook", "small trinket to swap"],
  "tips": ["best on a dry day", "cache is well-hidden — read hint carefully"],
  "accessInfo": "Roadside parking 100m from GZ"
}`,
};

export async function getActivityInsights(
  title: string,
  locationName: string | null,
  activityType: string | null,
  description: string
): Promise<ActivityInsights | null> {
  const type = activityType ?? "other";
  const schema = INSIGHTS_SCHEMA_BY_TYPE[type] ?? INSIGHTS_SCHEMA_BY_TYPE["trails"];
  const locationStr = locationName ? ` at ${locationName}` : "";

  try {
    const raw = await aiChat(
      `You are an expert local guide for SideQuests, an adventure discovery app.
Generate practical, specific insights about this activity or place.
Only include fields you are confident about — omit fields you don't know.
Return ONLY valid JSON matching the schema, no explanation, no markdown fences.`,
      `Activity type: ${type}
Place: ${title}${locationStr}
Description: ${description.slice(0, 600)}

Return JSON like this (omit fields you're unsure about):
${schema}`,
      USE_CLAUDE ? 15_000 : 180_000
    );

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.overview !== "string") return null;

    // Sanitise the response — coerce types, trim strings
    const ins: ActivityInsights = {
      overview: String(parsed.overview).slice(0, 400),
    };
    if (typeof parsed.difficulty === "string" && ["easy","moderate","hard"].includes(parsed.difficulty)) ins.difficulty = parsed.difficulty;
    if (typeof parsed.durationHours === "number") ins.durationHours = parsed.durationHours;
    if (typeof parsed.distanceKm === "number") ins.distanceKm = parsed.distanceKm;
    if (typeof parsed.elevationGainM === "number") ins.elevationGainM = parsed.elevationGainM;
    if (typeof parsed.trailType === "string" && ["loop","out-and-back","point-to-point"].includes(parsed.trailType)) ins.trailType = parsed.trailType;
    if (typeof parsed.bestSeason === "string") ins.bestSeason = parsed.bestSeason.slice(0, 80);
    if (Array.isArray(parsed.highlights)) ins.highlights = parsed.highlights.slice(0, 5).map((s: unknown) => String(s).slice(0, 120));
    if (Array.isArray(parsed.whatToBring)) ins.whatToBring = parsed.whatToBring.slice(0, 8).map((s: unknown) => String(s).slice(0, 80));
    if (Array.isArray(parsed.tips)) ins.tips = parsed.tips.slice(0, 5).map((s: unknown) => String(s).slice(0, 150));
    if (typeof parsed.accessInfo === "string") ins.accessInfo = parsed.accessInfo.slice(0, 200);
    if (typeof parsed.history === "string") ins.history = parsed.history.slice(0, 400);
    if (typeof parsed.era === "string") ins.era = parsed.era.slice(0, 80);
    if (Array.isArray(parsed.safetyNotes)) ins.safetyNotes = parsed.safetyNotes.slice(0, 5).map((s: unknown) => String(s).slice(0, 150));
    if (Array.isArray(parsed.photographyTips)) ins.photographyTips = parsed.photographyTips.slice(0, 4).map((s: unknown) => String(s).slice(0, 120));
    if (typeof parsed.knownFor === "string") ins.knownFor = parsed.knownFor.slice(0, 120);
    if (typeof parsed.priceRange === "string") ins.priceRange = parsed.priceRange.slice(0, 40);
    if (typeof parsed.bestTime === "string") ins.bestTime = parsed.bestTime.slice(0, 120);
    if (typeof parsed.bookingRequired === "boolean") ins.bookingRequired = parsed.bookingRequired;
    if (Array.isArray(parsed.nearbyAttractions)) ins.nearbyAttractions = parsed.nearbyAttractions.slice(0, 4).map((s: unknown) => String(s).slice(0, 100));
    if (typeof parsed.skillLevel === "string") ins.skillLevel = parsed.skillLevel.slice(0, 60);
    if (Array.isArray(parsed.gearNeeded)) ins.gearNeeded = parsed.gearNeeded.slice(0, 8).map((s: unknown) => String(s).slice(0, 60));
    if (typeof parsed.conditions === "string") ins.conditions = parsed.conditions.slice(0, 200);

    return ins;
  } catch (err) {
    if (__DEV__) console.warn(`[AI] getActivityInsights failed:`, err);
    return null;
  }
}

export interface ExtractedLocation {
  name: string;
  searchQuery: string;
  confidence: number;
}

export async function extractUrbexLocations(
  postTitle: string,
  postBody: string,
  cityName: string | null,
  regionName: string | null
): Promise<ExtractedLocation[]> {
  if (!postTitle && !postBody) return [];

  const context = [cityName, regionName].filter(Boolean).join(", ") || "unknown area";
  const text = `Title: ${postTitle}\n\nBody: ${postBody.slice(0, 1500)}`;

  try {
    const raw = await aiChat(
      `You extract specific location names from urban exploration Reddit posts.
Extract only concrete references — building names, addresses, road junctions, landmarks, districts.
Skip vague references like "a place I found" or "somewhere nearby".
Return ONLY valid JSON, no explanation, no markdown.`,
      `Poster is near: ${context}

${text}

Return a JSON array (empty if nothing found):
[{
  "name": "Exact name the author used",
  "searchQuery": "Geocodable search string, e.g. 'Old Salem Mill, Salem, Oregon'",
  "confidence": 0.9
}]

confidence: 0.9–1.0 = named building/address, 0.6–0.8 = road + context, 0.3–0.5 = vague area.
Only include confidence >= 0.4.`,
      USE_CLAUDE ? 15_000 : 180_000
    );

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.name === "string" && typeof r.searchQuery === "string" && typeof r.confidence === "number" && r.confidence >= 0.4)
      .slice(0, 5)
      .map((r) => ({
        name: String(r.name).slice(0, 120),
        searchQuery: String(r.searchQuery).slice(0, 200),
        confidence: Math.min(1, Math.max(0, r.confidence)),
      }));
  } catch (err) {
    if (__DEV__) console.warn(`[AI] extractUrbexLocations failed:`, err);
    return [];
  }
}
