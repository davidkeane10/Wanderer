/**
 * Parses unstructured text (Reddit comments, posts) for trail names, distances,
 * and elevation stats. Used to extract structured trail data from Q&A posts.
 */

export interface ExtractedTrail {
  name: string;
  distanceMi: number | null;
  elevationFt: number | null;
  difficulty: string | null;
  excerpt: string;
}

const TRAIL_SUFFIXES =
  "Trail|Trails|Peak|Falls|Lake|Lakes|Mountain|Mt|Creek|Ridge|Loop|Path|Summit|Wilderness|Forest|Park|Pass|Canyon|Gorge|Butte|Lookout|Point|Pond|River|Valley|Crater|Lava|Meadow|Beach|Dunes|Headlands";

// Match "Mary's Peak Trail", "Silver Falls State Park", "Dimple Hill", etc.
// Requires at least one capital word + a recognised outdoor suffix.
const TRAIL_NAME_RE = new RegExp(
  `\\b([A-Z][a-zA-Z'éèà]+(?:\\s+(?:the\\s+)?[A-Z][a-zA-Z'éèà]+){0,3})\\s+(${TRAIL_SUFFIXES})\\b`,
  "g"
);

const DISTANCE_RE = /(\d+(?:\.\d+)?)\s*(?:miles?|mi(?!\w)|km\b)/gi;
const ELEVATION_RE = /(\d[\d,]*)\s*(?:ft|feet)\s*(?:(?:of\s+)?elevation(?:\s+gain)?|gain)?/gi;
const DIFFICULTY_RE =
  /\b(easy|moderate|hard|difficult|challenging|strenuous|beginner|intermediate|advanced)\b/gi;

export function extractTrailsFromText(text: string): ExtractedTrail[] {
  if (!text || text.length < 20) return [];

  const results: ExtractedTrail[] = [];
  const seenNames = new Set<string>();

  TRAIL_NAME_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TRAIL_NAME_RE.exec(text)) !== null) {
    const fullName = match[0].trim();
    const key = fullName.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    // Context window: 150 chars before + 250 chars after the match
    const ctxStart = Math.max(0, match.index - 150);
    const ctxEnd = Math.min(text.length, match.index + fullName.length + 250);
    const ctx = text.slice(ctxStart, ctxEnd);

    // Distance
    DISTANCE_RE.lastIndex = 0;
    const distMatch = DISTANCE_RE.exec(ctx);
    let distanceMi: number | null = null;
    if (distMatch) {
      const val = parseFloat(distMatch[1]);
      distanceMi = distMatch[0].toLowerCase().includes("km")
        ? Math.round(val * 0.621371 * 10) / 10
        : val;
    }

    // Elevation
    ELEVATION_RE.lastIndex = 0;
    const elevMatch = ELEVATION_RE.exec(ctx);
    let elevationFt: number | null = null;
    if (elevMatch) {
      elevationFt = parseInt(elevMatch[1].replace(/,/g, ""), 10);
    }

    // Difficulty
    DIFFICULTY_RE.lastIndex = 0;
    const diffMatch = DIFFICULTY_RE.exec(ctx);
    const difficulty = diffMatch ? diffMatch[1].toLowerCase() : null;

    // Short excerpt — first sentence containing the trail name
    const afterIdx = text.indexOf(fullName, Math.max(0, match.index - 5));
    const afterText = text.slice(afterIdx, Math.min(text.length, afterIdx + 300));
    const sentenceEnd = afterText.search(/[.!?\n]/);
    const excerpt = (sentenceEnd > 0 ? afterText.slice(0, sentenceEnd) : afterText.slice(0, 200))
      .replace(/\s+/g, " ")
      .trim();

    results.push({ name: fullName, distanceMi, elevationFt, difficulty, excerpt });
  }

  return results.slice(0, 8);
}
