import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { geocodeWithCache } from "../services/geocodeCache";
import type { FeedItem, FeedSource } from "../types/feed";
import { formatScore, timeAgo } from "../utils/formatters";
import { formatDistance, haversineKm } from "../utils/distance";
import { postMentionsLocation } from "../utils/locationParser";

interface QuestCardProps {
  item: FeedItem;
  cityName?: string | null;
  regionName?: string | null;
  /** Only passed when user is on GPS (not manual) — enables distance display */
  userCoords?: { latitude: number; longitude: number } | null;
}

const SOURCE_COLORS: Record<FeedSource, string> = {
  reddit: "#818cf8",
  tripadvisor: "#34e0a1",
  trails: "#22c55e",
  ai: "#f472b6",
  arcgis: "#f59e0b",
  wikidata: "#339af0",
  wikipedia: "#94a3b8",
  youtube: "#ef4444",
};

const SOURCE_ICONS: Record<FeedSource, keyof typeof Ionicons.glyphMap> = {
  reddit: "logo-reddit",
  tripadvisor: "star",
  trails: "trail-sign",
  ai: "flash",
  arcgis: "business",
  wikidata: "globe-outline",
  wikipedia: "book-outline",
  youtube: "logo-youtube",
};

export function QuestCard({ item, cityName, regionName, userCoords }: QuestCardProps) {
  const router = useRouter();

  const fullText = `${item.title} ${item.description} ${item.locationName ?? ""}`;
  const isNearby = postMentionsLocation(fullText, cityName ?? null, regionName ?? null);
  const sourceColor = SOURCE_COLORS[item.source];

  const [distanceLabel, setDistanceLabel] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // If we already have exact coords (e.g. TripAdvisor), calculate directly
    if (userCoords && item.locationCoords) {
      const km = haversineKm(
        userCoords.latitude,
        userCoords.longitude,
        item.locationCoords.latitude,
        item.locationCoords.longitude
      );
      if (km <= 500) setDistanceLabel(formatDistance(km));
      return;
    }

    // For Reddit items: geocode the location name lazily
    if (!userCoords || !item.locationName) return;
    let cancelled = false;

    geocodeWithCache(item.locationName).then((coords) => {
      if (cancelled || !coords) return;
      const km = haversineKm(
        userCoords.latitude,
        userCoords.longitude,
        coords.latitude,
        coords.longitude
      );
      if (km <= 500) setDistanceLabel(formatDistance(km));
    });

    return () => {
      cancelled = true;
    };
  }, [userCoords, item.locationName, item.locationCoords]);

  const handlePress = () => {
    router.push({
      pathname: "/quest/[id]",
      params: { id: item.id, itemData: JSON.stringify(item) },
    });
  };

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.85}>
      {item.imageUrl && (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      )}
      <View style={styles.content}>
        {/* Top row: source label + nearby badge */}
        <View style={styles.headerRow}>
          <View style={styles.sourceTag}>
            <Ionicons name={SOURCE_ICONS[item.source]} size={11} color={sourceColor} />
            <Text style={[styles.sourceName, { color: sourceColor }]}>
              {item.sourceName}
            </Text>
          </View>
          <View style={styles.badgeRow}>
            {item.source === "ai" && (
              <View style={styles.aiBadge}>
                <Ionicons name="flash" size={10} color="#f472b6" />
                <Text style={styles.aiText}>AI Found</Text>
              </View>
            )}
            {isNearby && (
              <View style={styles.nearbyBadge}>
                <Ionicons name="location" size={10} color="#22c55e" />
                <Text style={styles.nearbyText}>Nearby</Text>
              </View>
            )}
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={3}>
          {item.title}
        </Text>

        {/* TripAdvisor star rating */}
        {item.rating != null && (
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={item.rating! >= star ? "star" : item.rating! >= star - 0.5 ? "star-half" : "star-outline"}
                size={13}
                color="#34e0a1"
              />
            ))}
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}

        {/* Location tag + distance */}
        {item.locationName && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="#6366f1" />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.locationName}
            </Text>
            {distanceLabel && (
              <View style={styles.distanceBadge}>
                <Ionicons name="navigate-outline" size={10} color="#f59e0b" />
                <Text style={styles.distanceText}>{distanceLabel}</Text>
              </View>
            )}
          </View>
        )}

        {/* Description excerpt */}
        {item.description.length > 0 && (
          <Text style={styles.excerpt} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        {/* Footer: score, comments, time + action buttons */}
        <View style={styles.footer}>
          {item.score != null && (
            <View style={styles.stat}>
              <Ionicons
                name={item.source === "tripadvisor" ? "people-outline" : "arrow-up"}
                size={14}
                color="#818cf8"
              />
              <Text style={styles.statText}>{formatScore(item.score)}</Text>
            </View>
          )}
          {item.commentCount != null && (
            <View style={styles.stat}>
              <Ionicons name="chatbubble-outline" size={13} color="#64748b" />
              <Text style={styles.statText}>{formatScore(item.commentCount)}</Text>
            </View>
          )}
          {item.createdAt != null && (
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation();
                setSaved((s) => !s);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={saved ? "bookmark" : "bookmark-outline"}
                size={16}
                color={saved ? "#6366f1" : "#475569"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={(e) => {
                e.stopPropagation();
                router.push({
                  pathname: "/group/send" as any,
                  params: { itemData: JSON.stringify(item) },
                });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="paper-plane-outline" size={16} color="#475569" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  image: {
    width: "100%",
    height: 180,
    backgroundColor: "#334155",
  },
  content: {
    padding: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sourceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sourceName: {
    fontSize: 12,
    fontWeight: "600",
  },
  nearbyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#14532d",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  nearbyText: {
    fontSize: 11,
    color: "#22c55e",
    fontWeight: "600",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#4a1942",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  aiText: {
    fontSize: 11,
    color: "#f472b6",
    fontWeight: "600",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f1f5f9",
    lineHeight: 22,
    marginBottom: 6,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 6,
  },
  ratingText: {
    fontSize: 12,
    color: "#34e0a1",
    fontWeight: "600",
    marginLeft: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  locationText: {
    fontSize: 12,
    color: "#6366f1",
    fontWeight: "600",
    flex: 1,
  },
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#451a03",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  distanceText: {
    fontSize: 11,
    color: "#f59e0b",
    fontWeight: "600",
  },
  excerpt: {
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 18,
    marginBottom: 10,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
  },
  time: {
    fontSize: 12,
    color: "#475569",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  actionBtn: {
    padding: 2,
  },
});
