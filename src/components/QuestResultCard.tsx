/**
 * QuestResultCard — a single search result card.
 *
 * Shows: rank number, image, title, AI description, source badge, distance.
 * Tapping highlights the map marker. External link opens the source.
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { QuestResult } from "../hooks/useQuestSearch";
import { haversineKm } from "../utils/distance";

const SOURCE_COLORS: Record<string, string> = {
  reddit: "#ff4500",
  trails: "#22c55e",
  ai: "#6366f1",
  arcgis: "#f59e0b",
  youtube: "#ef4444",
};

function sourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? "#64748b";
}

function openMaps(lat: number, lng: number, title: string) {
  const label = encodeURIComponent(title);
  const url =
    Platform.OS === "ios"
      ? `maps://maps.apple.com/?ll=${lat},${lng}&q=${label}`
      : `geo:${lat},${lng}?q=${label}`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=16`
    );
  });
}

interface Props {
  item: QuestResult;
  rank: number;
  selected: boolean;
  userCoords: { latitude: number; longitude: number } | null;
  onPress: () => void;
}

export function QuestResultCard({ item, rank, selected, userCoords, onPress }: Props) {
  const distanceKm =
    userCoords && item.locationCoords
      ? haversineKm(
          userCoords.latitude,
          userCoords.longitude,
          item.locationCoords.latitude,
          item.locationCoords.longitude
        )
      : null;

  const distanceText =
    distanceKm !== null
      ? distanceKm < 1
        ? `${Math.round(distanceKm * 1000)} m`
        : `${distanceKm.toFixed(1)} km`
      : null;

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Rank badge */}
      <View style={[styles.rank, selected && styles.rankSelected]}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>

      {/* Image */}
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons
            name={
              item.activityType === "urbex"
                ? "business-outline"
                : item.activityType === "trails"
                ? "trail-sign-outline"
                : "compass-outline"
            }
            size={26}
            color="#334155"
          />
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.description} numberOfLines={3}>
          {item.aiDescription}
        </Text>

        <View style={styles.meta}>
          <View style={[styles.sourceBadge, { borderColor: sourceColor(item.source) }]}>
            <Text style={[styles.sourceText, { color: sourceColor(item.source) }]}>
              {item.sourceName}
            </Text>
          </View>
          {distanceText && (
            <View style={styles.distanceBadge}>
              <Ionicons name="navigate-outline" size={11} color="#64748b" />
              <Text style={styles.distanceText}>{distanceText}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {item.locationCoords && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() =>
              openMaps(
                item.locationCoords!.latitude,
                item.locationCoords!.longitude,
                item.title
              )
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="navigate" size={16} color="#6366f1" />
          </TouchableOpacity>
        )}
        {item.source !== "ai" && !!item.externalUrl && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => Linking.openURL(item.externalUrl).catch(() => {})}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="open-outline" size={16} color="#475569" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 12,
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#1e293b",
  },
  cardSelected: {
    borderColor: "#6366f1",
    backgroundColor: "#1e2d4a",
  },

  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  rankSelected: { backgroundColor: "#6366f1" },
  rankText: { fontSize: 11, fontWeight: "800", color: "#fff" },

  image: {
    width: 72,
    height: 72,
    borderRadius: 10,
    flexShrink: 0,
  },
  imagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  content: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: "700", color: "#f1f5f9", lineHeight: 19 },
  description: { fontSize: 12, color: "#94a3b8", lineHeight: 18 },

  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sourceBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceText: { fontSize: 10, fontWeight: "700" },
  distanceBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  distanceText: { fontSize: 11, color: "#64748b" },

  actions: {
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
});
