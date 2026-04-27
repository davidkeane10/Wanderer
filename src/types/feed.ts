export type FeedSource = "reddit" | "tripadvisor" | "trails" | "ai" | "arcgis" | "wikidata" | "wikipedia" | "youtube";

export type ActivityType = "trails" | "backpacking" | "urbex" | "adventure" | "geocache" | "social" | "food" | "arts";

export interface FeedItem {
  id: string;
  source: FeedSource;
  activityType: ActivityType | null;
  title: string;
  description: string;
  imageUrl: string | null;
  externalUrl: string;
  locationName: string | null;
  locationCoords: { latitude: number; longitude: number } | null;
  score: number | null;
  commentCount: number | null;
  createdAt: number | null;
  sourceName: string;
  rating: number | null; // 1–5 stars (TripAdvisor)
  // Trail / hike stats (populated from OSM / AllTrails data)
  trailDistanceKm?: number;  // total trail length in km
  elevationGainM?: number;   // total ascent in metres (routes) or peak altitude (nodes)
  // Distance from the user — populated during radius filtering
  distanceFromUserKm?: number;
  // Reddit-specific fields preserved for the detail screen
  redditPermalink?: string;
  redditSelftext?: string;
  redditAuthor?: string;
  redditIsLink?: boolean;
  redditUrl?: string;
}
