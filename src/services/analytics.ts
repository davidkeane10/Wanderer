/**
 * Analytics — thin wrapper around Firebase Analytics.
 *
 * All functions are no-ops when:
 *   - EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID is not set
 *   - Running in a non-browser environment (SSR / native build)
 *   - Firebase Analytics fails to initialise for any reason
 *
 * This means every call site is fire-and-forget with no try/catch needed.
 */

import { type Analytics, getAnalytics, logEvent } from "firebase/analytics";
import { app } from "./firebase";

let _analytics: Analytics | null = null;
let _initialised = false;

function getInstance(): Analytics | null {
  if (_initialised) return _analytics;
  _initialised = true;

  const measurementId = process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID;
  if (!measurementId || typeof window === "undefined") return null;

  try {
    _analytics = getAnalytics(app);
  } catch {
    _analytics = null;
  }
  return _analytics;
}

function track(name: string, params?: Record<string, string | number | boolean>) {
  const a = getInstance();
  if (!a) return;
  try {
    logEvent(a, name, params);
  } catch {
    // Never let analytics errors surface to the user
  }
}

// ---------------------------------------------------------------------------
// Screen tracking — call on every screen mount
// ---------------------------------------------------------------------------

export function trackScreen(screenName: string) {
  track("screen_view", { screen_name: screenName });
}

// ---------------------------------------------------------------------------
// Search events
// ---------------------------------------------------------------------------

export function trackSearch(params: {
  category: string;
  distanceKm: number;
  descriptionLength: number;
}) {
  track("quest_search", {
    category: params.category,
    distance_km: params.distanceKm,
    has_description: params.descriptionLength > 0,
    description_length: params.descriptionLength,
  });
}

export function trackSearchResultsReceived(params: {
  category: string;
  resultCount: number;
  hasMapPins: boolean;
}) {
  track("quest_search_results", {
    category: params.category,
    result_count: params.resultCount,
    has_map_pins: params.hasMapPins,
  });
}

// ---------------------------------------------------------------------------
// Result / Quest events
// ---------------------------------------------------------------------------

export function trackQuestViewed(params: {
  questId: string;
  title: string;
  source: string;
  activityType: string;
  hasCoords: boolean;
  rank?: number;
}) {
  track("quest_viewed", {
    quest_id: params.questId,
    source: params.source,
    activity_type: params.activityType,
    has_coords: params.hasCoords,
    rank: params.rank ?? -1,
  });
}

export function trackQuestExternalLink(params: {
  questId: string;
  source: string;
}) {
  track("quest_external_link", {
    quest_id: params.questId,
    source: params.source,
  });
}

// ---------------------------------------------------------------------------
// Discovery / feed events
// ---------------------------------------------------------------------------

export function trackCategorySelected(category: string) {
  track("category_selected", { category });
}

export function trackDistanceChanged(distanceKm: number) {
  track("distance_changed", { distance_km: distanceKm });
}

// ---------------------------------------------------------------------------
// Location events
// ---------------------------------------------------------------------------

export function trackLocationSet(method: "gps" | "manual") {
  track("location_set", { method });
}

// ---------------------------------------------------------------------------
// Groups events
// ---------------------------------------------------------------------------

export function trackGroupCreated() {
  track("group_created");
}

export function trackGroupJoined() {
  track("group_joined");
}

export function trackGroupQuestShared() {
  track("group_quest_shared");
}
