import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocation } from "../context/LocationContext";
import { useSettings } from "../context/SettingsContext";
import { useDiscoverFeed } from "../hooks/useDiscoverFeed";
import type { ActivityType, FeedItem } from "../types/feed";
import { haversineKm } from "../utils/distance";
import { ErrorState } from "./ErrorState";
import { LocationBanner } from "./LocationBanner";
import { QuestCard } from "./QuestCard";
import { QuestCardSkeleton } from "./QuestCardSkeleton";

type FilterPill = "all" | ActivityType;

interface PillConfig {
  key: FilterPill;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const PILLS: PillConfig[] = [
  { key: "all",         label: "All",         icon: "compass-outline",  color: "#6366f1" },
  { key: "trails",      label: "Hiking",      icon: "trail-sign",       color: "#22c55e" },
  { key: "backpacking", label: "Backpacking", icon: "walk-outline",     color: "#f97316" },
  { key: "urbex",       label: "Urbex",       icon: "business-outline", color: "#f59e0b" },
  { key: "adventure",   label: "Adventure",   icon: "rocket-outline",   color: "#818cf8" },
  { key: "social",      label: "Social",      icon: "people-outline",   color: "#ec4899" },
];

const RADIUS_VALUES: (number | null)[] = [null, 25, 50, 100, 200, 500];

function radiusLabel(km: number | null, units: "metric" | "imperial"): string {
  if (km === null) return "Any";
  if (units === "imperial") return `${Math.round(km * 0.621371)} mi`;
  return `${km} km`;
}

function filterItems(items: FeedItem[], filter: FilterPill): FeedItem[] {
  if (filter === "all") return items;
  return items.filter((i) => i.activityType === filter);
}

function filterByRadius(
  items: FeedItem[],
  radiusKm: number | null,
  userCoords: { latitude: number; longitude: number } | null
): FeedItem[] {
  if (!radiusKm || !userCoords) return items;
  return items.filter((item) => {
    if (!item.locationCoords) return true;
    const km = haversineKm(
      userCoords.latitude,
      userCoords.longitude,
      item.locationCoords.latitude,
      item.locationCoords.longitude
    );
    return km <= radiusKm;
  });
}

export function DiscoverFeedScreen() {
  const insets = useSafeAreaInsets();
  const { location } = useLocation();
  const { settings } = useSettings();
  const [activeFilter, setActiveFilter] = useState<FilterPill>("all");
  const [radiusKm, setRadiusKm] = useState<number | null>(settings.radiusKm);

  const { items, isLoading, isRefreshing, error, hasMore, load, loadMore, refresh } =
    useDiscoverFeed({
      location: {
        cityName: location.cityName,
        regionName: location.regionName,
        countryName: location.countryName,
        coords: location.coords,
      },
      radiusKm,
    });

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.cityName, location.coords?.latitude, location.coords?.longitude]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm]);

  const filteredItems = useMemo(
    () => filterByRadius(filterItems(items, activeFilter), radiusKm, location.coords),
    [items, activeFilter, radiusKm, location.coords]
  );

  const renderSkeleton = () => (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <DiscoverHeader locationCity={location.cityName} />
      <FilterPills active={activeFilter} onSelect={setActiveFilter} />
      <RadiusPills active={radiusKm} onSelect={setRadiusKm} units={settings.units} />
      {[...Array(4)].map((_, i) => <QuestCardSkeleton key={i} />)}
    </View>
  );

  if (isLoading && items.length === 0) return renderSkeleton();

  if (error && items.length === 0) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <DiscoverHeader locationCity={location.cityName} />
        <FilterPills active={activeFilter} onSelect={setActiveFilter} />
        <RadiusPills active={radiusKm} onSelect={setRadiusKm} units={settings.units} />
        <ErrorState message={error} onRetry={() => load(true)} />
      </View>
    );
  }

  return (
    <FlatList
      data={filteredItems}
      keyExtractor={(item: FeedItem) => item.id}
      renderItem={({ item }) => (
        <QuestCard
          item={item}
          cityName={location.cityName}
          regionName={location.regionName}
          userCoords={!location.isManual ? location.coords : null}
        />
      )}
      ListHeaderComponent={
        <>
          <DiscoverHeader locationCity={location.cityName} />
          <FilterPills active={activeFilter} onSelect={setActiveFilter} />
          <RadiusPills active={radiusKm} onSelect={setRadiusKm} units={settings.units} />
          <SourceDebugBanner items={items} />
          {activeFilter !== "all" && filteredItems.length > 0 && (
            <View style={styles.resultCount}>
              <Text style={styles.resultCountText}>{filteredItems.length} spots</Text>
            </View>
          )}
        </>
      }
      ListEmptyComponent={
        !isLoading ? <EmptyState filter={activeFilter} locationCity={location.cityName} /> : null
      }
      ListFooterComponent={
        filteredItems.length > 0 ? (
          hasMore && activeFilter === "all" ? (
            <View style={styles.footer}>
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : (
            <View style={styles.footer}>
              <Text style={styles.endText}>
                {activeFilter === "geocache" ? "Geocache coming soon" : "You've seen it all!"}
              </Text>
            </View>
          )
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refresh}
          tintColor="#6366f1"
          colors={["#6366f1"]}
        />
      }
      onEndReached={activeFilter === "all" ? loadMore : undefined}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      style={styles.container}
    />
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * DEV-only source breakdown panel.
 * Shows per-source item counts so you can instantly see whether Reddit,
 * OSM, Wikipedia etc. returned data.
 * Renders nothing in production builds (__DEV__ === false).
 */
function SourceDebugBanner({ items }: { items: FeedItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!__DEV__) return null;

  // Count items by source + activityType combo
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key =
      item.sourceName === "OpenStreetMap"
        ? "OpenStreetMap"
        : item.sourceName.startsWith("r/") || item.source === "reddit"
        ? `Reddit · r/${item.sourceName.replace(/^r\//, "")}`
        : item.sourceName;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.debugBanner}>
      <TouchableOpacity
        style={styles.debugHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
      >
        <View style={styles.debugTitleRow}>
          <View style={[styles.debugDot, { backgroundColor: items.length > 0 ? "#22c55e" : "#ef4444" }]} />
          <Text style={styles.debugTitle}>
            {`DEV · Sources · Total: ${items.length}`}
          </Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#64748b" />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.debugBody}>
          {rows.map(([source, count]) => (
            <View key={source} style={styles.debugRow}>
              <Text style={styles.debugSource} numberOfLines={1}>{source}</Text>
              <Text style={styles.debugCount}>{count}</Text>
            </View>
          ))}
          {rows.length === 0 && (
            <Text style={styles.debugEmpty}>No items yet — pull to refresh</Text>
          )}
        </View>
      )}
    </View>
  );
}

function DiscoverHeader({ locationCity }: { locationCity: string | null }) {
  return (
    <View>
      <LocationBanner />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Discover</Text>
          <Text style={styles.headerDesc}>
            {locationCity
              ? `Trails, ruins & hidden spots near ${locationCity}`
              : "Trails, ruins, and hidden spots around you"}
          </Text>
        </View>
        <View style={styles.allTrailsBadge}>
          <Ionicons name="trail-sign" size={12} color="#22c55e" />
          <Text style={styles.allTrailsText}>AllTrails</Text>
        </View>
      </View>
    </View>
  );
}

function FilterPills({
  active,
  onSelect,
}: {
  active: FilterPill;
  onSelect: (f: FilterPill) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillsContainer}
      style={styles.pillsScroll}
    >
      {PILLS.map((pill) => {
        const isActive = active === pill.key;
        return (
          <TouchableOpacity
            key={pill.key}
            style={[styles.pill, isActive && { backgroundColor: pill.color + "22", borderColor: pill.color }]}
            onPress={() => onSelect(pill.key)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={pill.icon}
              size={13}
              color={isActive ? pill.color : "#475569"}
            />
            <Text style={[styles.pillText, isActive && { color: pill.color }]}>{pill.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function RadiusPills({
  active,
  onSelect,
  units,
}: {
  active: number | null;
  onSelect: (r: number | null) => void;
  units: "metric" | "imperial";
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillsContainer}
      style={styles.pillsScroll}
    >
      {RADIUS_VALUES.map((value) => {
        const isActive = active === value;
        return (
          <TouchableOpacity
            key={String(value)}
            style={[styles.pill, isActive && { backgroundColor: "#f59e0b22", borderColor: "#f59e0b" }]}
            onPress={() => onSelect(value)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={value ? "navigate-outline" : "globe-outline"}
              size={13}
              color={isActive ? "#f59e0b" : "#475569"}
            />
            <Text style={[styles.pillText, isActive && { color: "#f59e0b" }]}>
              {radiusLabel(value, units)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function EmptyState({ filter, locationCity }: { filter: FilterPill; locationCity: string | null }) {
  const pill = PILLS.find((p) => p.key === filter);

  if (filter === "geocache") {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🗺️</Text>
        <Text style={styles.emptyTitle}>Geocache coming soon</Text>
        <Text style={styles.emptyBody}>
          We're working on integrating Geocaching.com data. Check back soon!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🧭</Text>
      <Text style={styles.emptyTitle}>
        {filter === "all" ? "Not much here yet" : `No ${pill?.label ?? filter} spots yet`}
      </Text>
      <Text style={styles.emptyBody}>
        {locationCity
          ? `Nothing matched near ${locationCity}. Try pulling down to refresh or switching filters.`
          : "Set your location to find spots near you, or pull down to refresh."}
      </Text>
      <View style={styles.emptyHint}>
        <Ionicons name="refresh" size={14} color="#475569" />
        <Text style={styles.emptyHintText}>Pull down to refresh</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: -0.5,
  },
  headerDesc: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  allTrailsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#14532d33",
    borderWidth: 1,
    borderColor: "#22c55e44",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  allTrailsText: {
    fontSize: 11,
    color: "#22c55e",
    fontWeight: "600",
  },
  pillsScroll: {
    paddingBottom: 4,
  },
  pillsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 10,
    flexDirection: "row",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#1e293b",
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
  },
  resultCount: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  resultCountText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  footer: {
    padding: 24,
    alignItems: "center",
  },
  endText: {
    color: "#475569",
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 48,
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f1f5f9",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  emptyHintText: {
    fontSize: 13,
    color: "#475569",
  },
  // ── Debug banner (DEV only) ──────────────────────────────────────────────
  debugBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#0f1e12",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#166534",
    overflow: "hidden",
  },
  debugHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  debugTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flex: 1,
  },
  debugDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  debugTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4ade80",
    fontFamily: "monospace" as const,
  },
  debugBody: {
    borderTopWidth: 1,
    borderTopColor: "#166534",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  debugWarning: {
    fontSize: 11,
    color: "#fbbf24",
    marginBottom: 6,
    fontFamily: "monospace" as const,
  },
  debugRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  debugSource: {
    fontSize: 11,
    color: "#86efac",
    flex: 1,
    fontFamily: "monospace" as const,
  },
  debugCount: {
    fontSize: 11,
    color: "#4ade80",
    fontWeight: "700",
    fontFamily: "monospace" as const,
    marginLeft: 8,
  },
  debugEmpty: {
    fontSize: 11,
    color: "#475569",
    fontFamily: "monospace" as const,
  },
});
