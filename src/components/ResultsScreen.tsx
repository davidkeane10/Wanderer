/**
 * ResultsScreen — map + ranked quest results.
 *
 * Layout:
 *   - Header: back button + search summary
 *   - LeafletMap: 40% of screen, pins numbered by rank
 *   - Result cards: scrollable list, tap to highlight map pin
 *   - Loading / error states handled inline
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MapMarker } from "./LeafletMap";
import { LeafletMap } from "./LeafletMap";
import { QuestResultCard } from "./QuestResultCard";
import type { QuestResult, SearchPhase } from "../hooks/useQuestSearch";

interface ResultsScreenProps {
  phase: SearchPhase;
  statusMessage: string;
  summary: string;
  results: QuestResult[];
  nearbyResults: QuestResult[];
  error: string | null;
  locationHint?: string | null;
  userCoords: { latitude: number; longitude: number } | null;
  distanceKm?: number | null;
  onBack: () => void;
  onRetry: () => void;
}

const PHASE_ICONS: Partial<Record<SearchPhase, string>> = {
  thinking: "bulb-outline",
  fetching: "search-outline",
  enriching: "create-outline",
};

const { height: SCREEN_H } = Dimensions.get("window");
const MAP_HEIGHT = Math.round(SCREEN_H * 0.38);

export function ResultsScreen({
  phase,
  statusMessage,
  summary,
  results,
  nearbyResults,
  error,
  locationHint,
  userCoords,
  distanceKm,
  onBack,
  onRetry,
}: ResultsScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const allWithCoords = [...results, ...nearbyResults].filter((r) => r.locationCoords != null);
  const markers: MapMarker[] = allWithCoords.map((r) => ({
    id: r.id,
    lat: r.locationCoords!.latitude,
    lng: r.locationCoords!.longitude,
    title: r.title,
    imageUrl: r.imageUrl,
    description: r.aiDescription || r.description,
  }));

  function handleMarkerTap(id: string) {
    setSelectedId(id);
    const idx = results.findIndex((r) => r.id === id);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewOffset: 10 });
    }
  }

  function handleCardPress(item: QuestResult) {
    setSelectedId(item.id);
    router.push({
      pathname: "/quest/[id]",
      params: { id: item.id, itemData: JSON.stringify(item) },
    });
  }

  const isLoading = phase !== "idle" && phase !== "done";
  // Show full-screen spinner only while list is still empty
  const showFullScreenLoader = isLoading && results.length === 0;
  // Show subtle inline indicator while more results are still loading in
  const showInlineLoader = isLoading && results.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {summary || "Search results"}
        </Text>
        {results.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{results.length}</Text>
          </View>
        )}
      </View>

      {/* Location hint banner — shown when a named place was detected */}
      {!!locationHint && (
        <View style={styles.locationHintBanner}>
          <Ionicons name="location-outline" size={15} color="#fbbf24" style={{ marginRight: 6, marginTop: 1 }} />
          <Text style={styles.locationHintText}>{locationHint}</Text>
        </View>
      )}

      {/* Map */}
      <View style={[styles.mapContainer, { height: MAP_HEIGHT }]}>
        <LeafletMap
          markers={markers}
          selectedId={selectedId}
          userLat={userCoords?.latitude}
          userLng={userCoords?.longitude}
          radiusKm={distanceKm}
          onMarkerTap={handleMarkerTap}
        />
        {showFullScreenLoader && (
          <View style={styles.mapOverlay}>
            <ActivityIndicator color="#6366f1" size="small" />
          </View>
        )}
      </View>

      {/* Full-screen spinner — only when list is still empty */}
      {showFullScreenLoader && (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#6366f1" size="large" style={styles.loadingSpinner} />
            {PHASE_ICONS[phase] && (
              <Ionicons
                name={PHASE_ICONS[phase] as any}
                size={22}
                color="#6366f1"
                style={styles.phaseIcon}
              />
            )}
            <Text style={styles.loadingTitle}>{statusMessage}</Text>
            <View style={styles.phaseSteps}>
              {(["thinking", "fetching", "enriching"] as SearchPhase[]).map((p, i) => (
                <View
                  key={p}
                  style={[
                    styles.phaseStep,
                    phase === p && styles.phaseStepActive,
                    (phase === "fetching" && i === 0) ||
                    (phase === "enriching" && i <= 1)
                      ? styles.phaseStepDone
                      : null,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={onBack}>
            <Text style={styles.backLinkText}>Change search</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results list — visible as soon as first batch arrives */}
      {!showFullScreenLoader && !error && (results.length > 0 || nearbyResults.length > 0) && (
        <FlatList
          ref={listRef}
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={() => {}}
          ListHeaderComponent={
            <View style={styles.listHeaderRow}>
              <Text style={styles.listHeader}>
                {results.length > 0
                  ? `${results.length} place${results.length !== 1 ? "s" : ""} found`
                  : "No results in range"}
              </Text>
              {showInlineLoader && (
                <View style={styles.inlineLoader}>
                  <ActivityIndicator color="#6366f1" size="small" />
                  <Text style={styles.inlineLoaderText}>{statusMessage}</Text>
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <QuestResultCard
              item={item}
              rank={index + 1}
              selected={selectedId === item.id}
              userCoords={userCoords}
              onPress={() => handleCardPress(item)}
            />
          )}
          ListFooterComponent={
            nearbyResults.length > 0 ? (
              <View>
                <View style={styles.nearbyDivider}>
                  <View style={styles.nearbyDividerLine} />
                  <View style={styles.nearbyDividerBadge}>
                    <Ionicons name="navigate-outline" size={13} color="#f59e0b" />
                    <Text style={styles.nearbyDividerText}>
                      {results.length === 0
                        ? "Nothing in your range — found slightly further away"
                        : "Also slightly further away"}
                    </Text>
                  </View>
                  <View style={styles.nearbyDividerLine} />
                </View>
                {nearbyResults.map((item, index) => (
                  <QuestResultCard
                    key={item.id}
                    item={item}
                    rank={results.length + index + 1}
                    selected={selectedId === item.id}
                    userCoords={userCoords}
                    onPress={() => handleCardPress(item)}
                  />
                ))}
              </View>
            ) : null
          }
        />
      )}

      {/* Empty state — nothing in range AND nothing nearby */}
      {!isLoading && !error && results.length === 0 && nearbyResults.length === 0 && (
        <View style={styles.emptyContainer}>
          <Ionicons name="telescope-outline" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>Nothing found</Text>
          <Text style={styles.emptySubtitle}>
            Try a wider distance or different description
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onBack}>
            <Text style={styles.retryText}>New Search</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: "#e2e8f0" },
  countBadge: {
    backgroundColor: "#312e81",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countText: { fontSize: 12, fontWeight: "800", color: "#a5b4fc" },

  mapContainer: { width: "100%", position: "relative" },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    gap: 12,
  },
  loadingSpinner: { marginBottom: 4 },
  phaseIcon: { position: "absolute", top: 28, right: 28 },
  loadingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#e2e8f0",
    textAlign: "center",
  },
  phaseSteps: { flexDirection: "row", gap: 8, marginTop: 8 },
  phaseStep: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#334155",
  },
  phaseStepActive: { backgroundColor: "#6366f1" },
  phaseStepDone: { backgroundColor: "#22c55e" },

  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 22,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#475569" },
  emptySubtitle: { fontSize: 14, color: "#334155", textAlign: "center" },

  retryBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  retryText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  backLink: { marginTop: 4 },
  backLinkText: { fontSize: 14, color: "#475569" },

  list: { paddingTop: 8 },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  listHeader: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inlineLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inlineLoaderText: {
    fontSize: 11,
    color: "#6366f1",
    fontWeight: "600",
  },

  nearbyDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 18,
    gap: 8,
  },
  nearbyDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#334155",
  },
  nearbyDividerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1c1408",
    borderWidth: 1,
    borderColor: "#78350f",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  nearbyDividerText: {
    fontSize: 11,
    color: "#f59e0b",
    fontWeight: "700",
  },
  locationHintBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1c1a0e",
    borderLeftWidth: 3,
    borderLeftColor: "#fbbf24",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  locationHintText: {
    flex: 1,
    fontSize: 12,
    color: "#fde68a",
    lineHeight: 17,
  },
});
