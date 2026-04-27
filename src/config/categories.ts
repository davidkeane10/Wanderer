import { Ionicons } from "@expo/vector-icons";
//import {cityName } from "@/context/LocationContext";

export interface Category {
  key: string;
  label: string;
  emoji: string;
  icon: keyof typeof Ionicons.glyphMap;
  subreddits: string[];
  sort: "hot" | "top" | "new";
  timeframe: "day" | "week" | "month" | "year";
  color: string;
  description: string;
  /** Words that strongly indicate a post is relevant to this category */
  keywords: string[];
  /** Minimum keyword matches needed to pass the filter (default 1) */
  minMatches?: number;
  /** TripAdvisor location category — enables TripAdvisor results when set */
  tripAdvisorCategory?: "restaurants" | "attractions" | "hotels" | "geos" | null;
}

export const CATEGORIES: Category[] = [
  {
    key: "hiking",
    label: "Hiking",
    emoji: "🥾",
    icon: "trail-sign",
    subreddits: ["hiking", "trailrunning", "CampingandHiking", "NationalPark", "trails", "dayhiking"],
    sort: "hot",
    timeframe: "week",
    color: "#22c55e",
    description: "Trails, parks, and outdoor adventures",
    keywords: [
      "trail", "hike", "hiking", "trek", "trekking", "summit", "mountain",
      "camp", "camping", "backpack", "waterfall", "peak", "wilderness",
      "national park", "forest", "ridge", "path", "walk", "scenic",
      "elevation", "miles", "km", "trailhead", "loop", "out and back",
    ],
  },
  {
    key: "backpacking",
    label: "Backpacking",
    emoji: "🎒",
    icon: "walk",
    subreddits: ["BackCountry", "WildernessBackpacking", "backpacking", "thruhiking", "ultralight", "Bushcraft"],
    sort: "hot",
    timeframe: "week",
    color: "#f97316",
    description: "Multi-day wilderness trips, overnight routes, and backcountry adventures",
    keywords: [
      "backpacking", "backcountry", "overnight", "multi-day", "thru-hike", "thru hike",
      "basecamp", "wilderness", "campsite", "tent", "hammock", "shelter",
      "ultralight", "resupply", "permit", "bear canister", "water filter",
      "PCT", "AT", "CDT", "route", "pass", "miles per day", "night", "camp",
    ],
  },
  {
    key: "urban",
    label: "Urban Exploring",
    emoji: "🏚️",
    icon: "business",
    subreddits: ["urbanexploration", "urbex", "AbandonedPorn", "AbandonedPlaces", "hiddencity", "UrbanExploring"],
    sort: "top",
    timeframe: "week",
    color: "#f59e0b",
    description: "Hidden spots, abandoned places, and city secrets",
    keywords: [
      "abandoned", "urbex", "explore", "urban exploration", "derelict",
      "ruin", "ruins", "hidden", "forgotten", "decay", "decayed",
      "factory", "building", "tunnel", "underground", "asylum",
      "hospital", "warehouse", "secret", "trespass",
    ],
  },
  {
    key: "social",
    label: "Social",
    emoji: "🤝",
    icon: "people",
    subreddits: ["MeetPeople", "activitypartners", "ClubSports", "TeamSports", "Nightlife"],
    sort: "hot",
    timeframe: "day",
    color: "#ec4899",
    description: "Meet people and make connections",
    keywords: [
      "meet", "friend", "friends", "hangout", "hang out", "partner",
      "activity partner", "lonely", "connection", "chat", "group",
      "social", "people", "looking for", "anyone want", "anyone down",
      "join me", "company", "together",
    ],
    tripAdvisorCategory: "attractions",
  },
  {
    key: "food",
    label: "Food & Drink",
    emoji: "🍜",
    icon: "restaurant",
    subreddits: ["DiningOut", "foodtrucks", "streetfood", "cocktails", "CoffeeShops", "beer", "wine"],
    sort: "hot",
    timeframe: "week",
    color: "#ef4444",
    description: "Restaurants, bars, and culinary experiences",
    keywords: [
      "restaurant", "food", "eat", "eating", "drink", "bar", "pub",
      "coffee", "cafe", "meal", "taste", "cuisine", "menu", "chef",
      "recipe", "dinner", "lunch", "brunch", "breakfast", "cocktail",
      "beer", "wine", "tasting", "street food", "market", "foodie",
    ],
    tripAdvisorCategory: "restaurants",
  },
  {
    key: "adventure",
    label: "Adventure",
    emoji: "🧗",
    icon: "rocket",
    subreddits: ["climbing", "surfing", "mountainbiking", "kayaking", "whitewater", "Paragliding", "skydiving", "canyoneering"],
    sort: "hot",
    timeframe: "week",
    color: "#6366f1",
    description: "Thrilling experiences and extreme sports",
    keywords: [
      "climb", "climbing", "surf", "surfing", "kayak", "kayaking",
      "mountain bike", "mtb", "skydive", "paraglide", "paragliding",
      "whitewater", "rafting", "bouldering", "crag", "route", "send",
      "wave", "paddle", "descent", "adrenaline", "extreme", "sport",
    ],
  },
  {
    key: "arts",
    label: "Arts & Culture",
    emoji: "🎭",
    icon: "color-palette",
    subreddits: ["streetart", "museum", "concertgoers", "livemusicsharing", "photography", "artgalleries"],
    sort: "hot",
    timeframe: "week",
    color: "#8b5cf6",
    description: "Museums, galleries, concerts, and creative spaces",
    keywords: [
      "art", "gallery", "museum", "concert", "music", "exhibit",
      "exhibition", "show", "performance", "theatre", "theater",
      "culture", "mural", "street art", "graffiti", "gig", "festival",
      "photography", "photo", "sculpture", "installation", "opening",
    ],
  },
];

export const getCategoryByKey = (key: string): Category | undefined =>
  CATEGORIES.find((c) => c.key === key);

/**
 * Returns a relevance score 0–100 for a post against a category.
 * Checks post title + selftext + subreddit name.
 */
export function scorePostRelevance(
  title: string,
  selftext: string,
  subreddit: string,
  category: Category
): number {
  const text = `${title} ${selftext} ${subreddit}`.toLowerCase();
  let matches = 0;
  for (const kw of category.keywords) {
    if (text.includes(kw.toLowerCase())) matches++;
  }
  // Score = % of keywords matched, capped at 100
  return Math.min(100, Math.round((matches / category.keywords.length) * 100 * 3));
}
