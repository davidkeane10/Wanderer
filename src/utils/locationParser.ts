/**
 * Cleans Reddit markdown/junk and returns the first real descriptive paragraph.
 * Good for showing a meaningful excerpt on cards.
 */
export function extractDescription(selftext: string): string {
  if (!selftext || selftext.length < 10) return "";

  return (
    selftext
      // Remove zero-width spaces Reddit uses as paragraph separators
      .replace(/&#x200B;/g, "")
      // Remove markdown links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove image/link markdown
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic markers
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
      // Remove blockquote markers
      .replace(/^>\s*/gm, "")
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      // Split into paragraphs and return the first non-empty one with real content
      .split(/\n\n+/)
      .map((p) => p.replace(/\n/g, " ").trim())
      .find((p) => p.length > 40) ?? ""
  );
}

/**
 * Extracts GPS coordinates from text like "40.7128, -74.0060" or "(40.7128° N, 74.0060° W)"
 */
export function extractCoordinates(
  text: string
): { latitude: number; longitude: number } | null {
  // Decimal degrees: "40.7128, -74.0060" or "40.7128,-74.0060"
  const decimalPattern =
    /(-?\d{1,3}\.\d{3,})[,\s]+(-?\d{1,3}\.\d{3,})/;
  const match = text.match(decimalPattern);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

/**
 * Extracts the most likely location mention from a post title + body.
 * Returns a short display string like "Blue Mountains, NSW" or "near Portland".
 */
export function extractPrimaryLocation(title: string, selftext: string): string | null {
  const text = `${title} ${selftext}`;

  // "City, ST" or "City, Country" patterns — most reliable
  const cityStatePattern = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?),\s*([A-Z][a-zA-Z]{1,20})\b/g;
  let match = cityStatePattern.exec(text);
  if (match) return `${match[1]}, ${match[2]}`;

  // "in [City]" / "near [City]" / "at [City]" — common in trip reports
  const nearPattern =
    /\b(?:in|near|around|outside|close to|just outside|visiting|explored?)\s+([A-Z][a-zA-Z]{2,}(?:\s[A-Z][a-zA-Z]{2,})?)\b/;
  const nearMatch = text.match(nearPattern);
  if (nearMatch) return nearMatch[1];

  // Parenthetical location hint e.g. "[OC] Blue Cave (Croatia)"
  const parenPattern = /\(([A-Z][a-zA-Z\s,]{3,30})\)/;
  const parenMatch = title.match(parenPattern);
  if (parenMatch && !/^\d/.test(parenMatch[1])) return parenMatch[1];

  // "X, [two-letter state/country code]" anywhere in title
  const shortCodePattern = /\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2,3})\b/;
  const shortMatch = title.match(shortCodePattern);
  if (shortMatch) return `${shortMatch[1]}, ${shortMatch[2]}`;

  return null;
}

/**
 * Returns true if the post title or body mentions the given city or region.
 */
export function postMentionsLocation(
  text: string,
  cityName: string | null,
  regionName: string | null
): boolean {
  if (!cityName && !regionName) return false;
  const lower = text.toLowerCase();
  if (cityName && lower.includes(cityName.toLowerCase())) return true;
  if (regionName && lower.includes(regionName.toLowerCase())) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Local / foreign detection
// ---------------------------------------------------------------------------

/** Maps lowercase country name → continent code */
const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // Asia
  taiwan: "asia", japan: "asia", china: "asia", "south korea": "asia", korea: "asia",
  thailand: "asia", vietnam: "asia", india: "asia", indonesia: "asia", philippines: "asia",
  malaysia: "asia", singapore: "asia", nepal: "asia", "hong kong": "asia", myanmar: "asia",
  cambodia: "asia", laos: "asia", bangladesh: "asia", "sri lanka": "asia", pakistan: "asia",
  // Europe
  "united kingdom": "europe", england: "europe", scotland: "europe", wales: "europe",
  ireland: "europe", france: "europe", germany: "europe", spain: "europe", italy: "europe",
  portugal: "europe", netherlands: "europe", belgium: "europe", switzerland: "europe",
  austria: "europe", sweden: "europe", norway: "europe", denmark: "europe", finland: "europe",
  poland: "europe", "czech republic": "europe", czechia: "europe", hungary: "europe",
  romania: "europe", greece: "europe", turkey: "europe", ukraine: "europe", russia: "europe",
  // North America (treated as the same region)
  "united states": "north_america", usa: "north_america", canada: "north_america",
  mexico: "north_america",
  // Central / South America
  brazil: "south_america", argentina: "south_america", chile: "south_america",
  colombia: "south_america", peru: "south_america", venezuela: "south_america",
  ecuador: "south_america", bolivia: "south_america",
  // Oceania
  australia: "oceania", "new zealand": "oceania",
  // Africa
  "south africa": "africa", nigeria: "africa", kenya: "africa", ethiopia: "africa",
  egypt: "africa", morocco: "africa", ghana: "africa", tanzania: "africa",
  // Middle East
  "saudi arabia": "middle_east", israel: "middle_east", uae: "middle_east",
  jordan: "middle_east", iran: "middle_east", qatar: "middle_east", kuwait: "middle_east",
};

/** Major city → continent shortcuts to catch e.g. "Tokyo", "Paris" in post titles */
const CITY_TO_CONTINENT: Record<string, string> = {
  // Asia
  taipei: "asia", tokyo: "asia", osaka: "asia", kyoto: "asia", seoul: "asia",
  beijing: "asia", shanghai: "asia", bangkok: "asia", "ho chi minh": "asia",
  hanoi: "asia", jakarta: "asia", manila: "asia", "kuala lumpur": "asia",
  mumbai: "asia", delhi: "asia", kathmandu: "asia", colombo: "asia",
  singapore: "asia", "hong kong": "asia", macau: "asia",
  // Europe
  paris: "europe", london: "europe", berlin: "europe", madrid: "europe",
  rome: "europe", amsterdam: "europe", lisbon: "europe", vienna: "europe",
  barcelona: "europe", munich: "europe", prague: "europe", budapest: "europe",
  warsaw: "europe", stockholm: "europe", oslo: "europe", copenhagen: "europe",
  zurich: "europe", brussels: "europe", athens: "europe",
  // Oceania
  sydney: "oceania", melbourne: "oceania", brisbane: "oceania", perth: "oceania",
  auckland: "oceania",
  // South America
  "rio de janeiro": "south_america", "sao paulo": "south_america",
  "buenos aires": "south_america", santiago: "south_america", bogota: "south_america",
  lima: "south_america",
  // Africa
  "cape town": "africa", nairobi: "africa", cairo: "africa", lagos: "africa",
  // Middle East
  dubai: "middle_east", "abu dhabi": "middle_east",
};

function textToContinent(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [name, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
    if (lower.includes(name)) return continent;
  }
  for (const [city, continent] of Object.entries(CITY_TO_CONTINENT)) {
    if (lower.includes(city)) return continent;
  }
  return null;
}

/**
 * Derives the user's continent from countryName, falling back to regionName
 * for cases where the geocoder returns a short code ("US") or empty string
 * instead of the full country name ("United States").
 */
function getUserContinent(
  countryName: string | null,
  regionName?: string | null
): string | null {
  if (countryName) {
    const c = textToContinent(countryName);
    if (c) return c;
  }
  // Fallback: a US state name in regionName means the user is in North America
  if (regionName) {
    const regionLower = regionName.toLowerCase().trim();
    if (US_STATE_TO_ABBR[regionLower]) return "north_america";
    // Also handle 2-letter abbreviations stored in regionName
    const abbrValues = new Set(Object.values(US_STATE_TO_ABBR));
    if (abbrValues.has(regionName.toUpperCase())) return "north_america";
  }
  return null;
}

// ---------------------------------------------------------------------------
// US state-level filtering
// ---------------------------------------------------------------------------

/** Full US state name (lowercase) → 2-letter abbreviation */
const US_STATE_TO_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

/** Well-known US cities (lowercase) → state abbreviation */
const US_CITY_TO_STATE: Record<string, string> = {
  // California
  "san francisco": "CA", "los angeles": "CA", "san diego": "CA", "san jose": "CA",
  sacramento: "CA", fresno: "CA", oakland: "CA", berkeley: "CA", "long beach": "CA",
  "santa barbara": "CA", "santa cruz": "CA", "palm springs": "CA", "palo alto": "CA",
  // New York
  "new york": "NY", "new york city": "NY", nyc: "NY", brooklyn: "NY", buffalo: "NY",
  // Texas
  houston: "TX", dallas: "TX", austin: "TX", "san antonio": "TX", "fort worth": "TX",
  // Florida
  miami: "FL", orlando: "FL", tampa: "FL", jacksonville: "FL",
  // Illinois
  chicago: "IL",
  // Nevada
  "las vegas": "NV", reno: "NV",
  // Arizona
  phoenix: "AZ", tucson: "AZ", scottsdale: "AZ",
  // Colorado
  denver: "CO", boulder: "CO", "colorado springs": "CO",
  // Washington (state)
  seattle: "WA", tacoma: "WA", spokane: "WA", bellevue: "WA",
  // Oregon (user's state — included so we can detect local content positively)
  portland: "OR", eugene: "OR", corvallis: "OR", bend: "OR", salem: "OR",
  medford: "OR", ashland: "OR", astoria: "OR",
  // Georgia
  atlanta: "GA",
  // Massachusetts
  boston: "MA",
  // Tennessee
  nashville: "TN", memphis: "TN",
  // Michigan
  detroit: "MI",
  // Minnesota
  minneapolis: "MN",
  // Pennsylvania
  philadelphia: "PA", pittsburgh: "PA",
  // Ohio
  columbus: "OH", cleveland: "OH", cincinnati: "OH",
  // Utah
  "salt lake city": "UT", provo: "UT",
  // Hawaii
  honolulu: "HI",
  // North Carolina
  charlotte: "NC", raleigh: "NC",
  // Virginia
  richmond: "VA",
  // Montana
  billings: "MT", missoula: "MT", bozeman: "MT",
  // Idaho
  boise: "ID",
};

/** States that share a border (or very close) — posts from these are considered nearby */
const ADJACENT_STATES: Record<string, string[]> = {
  OR: ["WA", "ID", "CA", "NV"],
  WA: ["OR", "ID"],
  ID: ["OR", "WA", "MT", "WY", "UT", "NV"],
  CA: ["OR", "NV", "AZ"],
  NV: ["CA", "OR", "ID", "UT", "AZ"],
  MT: ["ID", "WY", "ND", "SD"],
  WY: ["MT", "ID", "UT", "CO", "NE", "SD"],
  UT: ["NV", "ID", "WY", "CO", "AZ"],
  CO: ["UT", "WY", "NE", "KS", "OK", "NM", "AZ"],
  AZ: ["CA", "NV", "UT", "CO", "NM"],
  NM: ["AZ", "CO", "OK", "TX"],
  TX: ["NM", "OK", "AR", "LA"],
  OK: ["TX", "NM", "CO", "KS", "MO", "AR"],
  KS: ["CO", "OK", "MO", "NE"],
  NE: ["CO", "WY", "SD", "IA", "MO", "KS"],
  SD: ["WY", "MT", "ND", "MN", "IA", "NE"],
  ND: ["MT", "SD", "MN"],
  MN: ["ND", "SD", "IA", "WI"],
  IA: ["NE", "SD", "MN", "WI", "IL", "MO"],
  MO: ["KS", "OK", "AR", "TN", "KY", "IL", "IA", "NE"],
  AR: ["TX", "OK", "MO", "TN", "MS", "LA"],
  LA: ["TX", "AR", "MS"],
  MS: ["LA", "AR", "TN", "AL"],
  AL: ["MS", "TN", "GA", "FL"],
  TN: ["MO", "AR", "MS", "AL", "GA", "NC", "VA", "KY"],
  KY: ["MO", "TN", "VA", "WV", "OH", "IN", "IL"],
  IL: ["MO", "IA", "WI", "IN", "KY"],
  IN: ["IL", "KY", "OH", "MI"],
  MI: ["IN", "OH", "WI"],
  WI: ["MN", "IA", "IL", "MI"],
  OH: ["IN", "KY", "WV", "PA", "MI"],
  WV: ["KY", "VA", "MD", "PA", "OH"],
  VA: ["KY", "TN", "NC", "MD", "WV"],
  NC: ["VA", "TN", "GA", "SC"],
  SC: ["NC", "GA"],
  GA: ["NC", "SC", "AL", "FL", "TN"],
  FL: ["GA", "AL"],
  PA: ["OH", "WV", "MD", "NJ", "NY", "DE"],
  MD: ["PA", "WV", "VA", "DE"],
  DE: ["MD", "PA", "NJ"],
  NJ: ["DE", "PA", "NY"],
  NY: ["NJ", "PA", "CT", "MA", "VT"],
  CT: ["NY", "RI", "MA"],
  RI: ["CT", "MA"],
  MA: ["CT", "RI", "NY", "NH", "VT"],
  VT: ["NY", "MA", "NH"],
  NH: ["VT", "MA", "ME"],
  ME: ["NH"],
  AK: [],
  HI: [],
};

/**
 * Given a post title, returns the US state abbreviation if a known US state
 * name or major city is mentioned. Checks title only (body is too noisy).
 */
function extractUSStateFromTitle(title: string): string | null {
  const lower = title.toLowerCase();

  // City names first (more specific signal)
  for (const [city, state] of Object.entries(US_CITY_TO_STATE)) {
    if (lower.includes(city)) return state;
  }

  // Full state names — require word boundaries to avoid "New York" matching "New"
  for (const [stateName, abbr] of Object.entries(US_STATE_TO_ABBR)) {
    const re = new RegExp(`\\b${stateName.replace(/\s/g, "\\s")}\\b`);
    if (re.test(lower)) return abbr;
  }

  // State abbreviations in patterns like "[CA]", "(CA)", ", CA" in title
  const abbrRe = /(?:[\[,(]\s*([A-Z]{2})\s*[\]),]|,\s*([A-Z]{2})\b)/g;
  let m: RegExpExecArray | null;
  const abbrValues = new Set(Object.values(US_STATE_TO_ABBR));
  while ((m = abbrRe.exec(title)) !== null) {
    const candidate = m[1] ?? m[2];
    if (candidate && abbrValues.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Returns false when a post clearly mentions a place from a different continent
 * than the user. When the user is in a US state, also filters posts that clearly
 * mention a different, non-adjacent US state.
 *
 * Returns true if uncertain (no location detected, or same region).
 */
export function isPostLikelyLocal(
  title: string,
  selftext: string,
  userCountryName: string | null,
  userRegionName?: string | null
): boolean {
  const userContinent = getUserContinent(userCountryName, userRegionName);
  if (!userContinent) return true;

  const locationTag = extractPrimaryLocation(title, selftext);
  if (!locationTag) return true;

  const postContinent = textToContinent(`${locationTag} ${title}`);
  if (!postContinent) return true;

  if (postContinent !== userContinent) return false;

  // Same continent — do finer US state-level check
  if (userContinent === "north_america" && userRegionName) {
    const userState = US_STATE_TO_ABBR[userRegionName.toLowerCase()] ?? null;
    if (userState) {
      const postState = extractUSStateFromTitle(title);
      if (postState && postState !== userState) {
        const adjacent = ADJACENT_STATES[userState] ?? [];
        if (!adjacent.includes(postState)) return false;
      }
    }
  }

  return true;
}

/**
 * Fast check: returns true if the post TITLE (not body — too noisy) contains
 * any well-known city or country name from a different continent than the user.
 * This runs before the slower extractPrimaryLocation path.
 */
export function titleMentionsForeignLocation(
  title: string,
  userCountryName: string | null,
  userRegionName?: string | null
): boolean {
  const userContinent = getUserContinent(userCountryName, userRegionName);
  if (!userContinent) return false;

  const lower = title.toLowerCase();
  for (const [name, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
    if (continent !== userContinent && lower.includes(name)) return true;
  }
  for (const [city, continent] of Object.entries(CITY_TO_CONTINENT)) {
    if (continent !== userContinent && lower.includes(city)) return true;
  }
  return false;
}

/**
 * Given a city name, returns a list of likely Reddit city/regional subreddits to inject.
 * E.g. "Sydney" → ["sydney", "newsouthwales", "australia"]
 */
export function getCitySubreddits(cityName: string, regionName: string): string[] {
  const city = cityName.toLowerCase().replace(/\s+/g, "");
  const region = regionName.toLowerCase().replace(/\s+/g, "");
  const subs: string[] = [city];

  // Add region subreddit if meaningfully different from city
  if (region && region !== city && region.length > 2) {
    subs.push(region);
  }

  // Well-known city → extra local subreddits
  const extras: Record<string, string[]> = {
    // Pacific Northwest / Oregon
    corvallis: ["oregon", "pnw", "pacificnorthwest"],
    eugene: ["oregon", "pnw", "pacificnorthwest"],
    portland: ["oregon", "pnw", "pacificnorthwest"],
    salem: ["oregon", "pnw"],
    bend: ["oregon", "pnw"],
    medford: ["oregon"],
    astoria: ["oregon"],
    // Pacific Northwest / Washington
    seattle: ["washington", "pnw", "pacificnorthwest"],
    tacoma: ["washington", "pnw"],
    spokane: ["washington"],
    bellevue: ["washington", "pnw"],
    // US West
    losangeles: ["socal", "california"],
    sandiego: ["california"],
    sanfrancisco: ["bayarea", "california"],
    denver: ["colorado"],
    phoenix: ["arizona"],
    lasvegas: ["nevada"],
    saltlakecity: ["utah"],
    boise: ["idaho"],
    // US Other
    newyork: ["nyc", "newjersey"],
    chicago: ["illinois"],
    boston: ["massachusetts"],
    atlanta: ["georgia"],
    miami: ["florida"],
    // Canada
    toronto: ["ontario", "canada"],
    vancouver: ["britishcolumbia", "canada"],
    calgary: ["alberta", "canada"],
    montreal: ["quebec", "canada"],
    // Australia
    sydney: ["newsouthwales", "australia"],
    melbourne: ["victoria", "australia"],
    brisbane: ["queensland", "australia"],
    perth: ["westernaustralia", "australia"],
    // Europe
    london: ["unitedkingdom", "england"],
    manchester: ["unitedkingdom"],
    berlin: ["germany"],
    paris: ["france"],
    amsterdam: ["netherlands"],
    dublin: ["ireland"],
    // Other
    tokyo: ["japan"],
    auckland: ["newzealand"],
    capetown: ["southafrica"],
  };

  const extraSubs = extras[city] ?? [];
  return [...new Set([...subs, ...extraSubs])];
}
