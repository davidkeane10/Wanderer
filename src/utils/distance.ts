/**
 * Haversine formula — returns distance in kilometres between two coordinates.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns a human-readable distance string.
 * Respects the units preference (metric = km/m, imperial = mi/ft).
 */
export function formatDistance(km: number, units: "metric" | "imperial" = "metric"): string {
  if (units === "imperial") {
    const miles = km * 0.621371;
    if (miles < 0.1) return `${Math.round(miles * 5280)} ft away`;
    if (miles < 10) return `${miles.toFixed(1)} mi away`;
    return `${Math.round(miles)} mi away`;
  }
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

/**
 * Drops FeedItems whose known locationCoords are beyond radiusKm from the user.
 * Items without coords are always kept — they rely on text-based filtering upstream.
 */
export function filterByRadius<T extends { locationCoords: { latitude: number; longitude: number } | null }>(
  items: T[],
  userCoords: { latitude: number; longitude: number } | null,
  radiusKm: number
): T[] {
  if (!userCoords) return items;
  return items.filter((item) => {
    if (!item.locationCoords) return true; // no coords — can't reject
    const dist = haversineKm(
      userCoords.latitude,
      userCoords.longitude,
      item.locationCoords.latitude,
      item.locationCoords.longitude
    );
    return dist <= radiusKm;
  });
}

/**
 * Splits items into two buckets and stamps distanceFromUserKm on each:
 *   inRange  — within radiusKm (or no coords)
 *   nearby   — between radiusKm and radiusKm * nearbyMultiplier (default 1.5×)
 *
 * Items beyond the nearby band are dropped entirely.
 * Use this instead of filterByRadius when you want to show an "also nearby" section.
 */
export function partitionByRadius<
  T extends {
    locationCoords: { latitude: number; longitude: number } | null;
    distanceFromUserKm?: number;
  }
>(
  items: T[],
  userCoords: { latitude: number; longitude: number } | null,
  radiusKm: number,
  nearbyMultiplier = 1.5
): { inRange: T[]; nearby: T[] } {
  if (!userCoords) return { inRange: items, nearby: [] };

  const inRange: T[] = [];
  const nearby: T[] = [];

  for (const item of items) {
    if (!item.locationCoords) {
      inRange.push(item); // no coords — keep in main results
      continue;
    }
    const dist = haversineKm(
      userCoords.latitude,
      userCoords.longitude,
      item.locationCoords.latitude,
      item.locationCoords.longitude
    );
    const stamped = { ...item, distanceFromUserKm: Math.round(dist * 10) / 10 };
    if (dist <= radiusKm) {
      inRange.push(stamped);
    } else if (dist <= radiusKm * nearbyMultiplier) {
      nearby.push(stamped);
    }
    // Beyond nearby band — dropped
  }

  return { inRange, nearby };
}
