import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "../../src/context/SettingsContext";
import type { Units } from "../../src/context/SettingsContext";

const RADIUS_OPTIONS = [25, 50, 100, 200, 500];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, dispatch } = useSettings();

  const radiusLabel = (km: number) => {
    if (settings.units === "imperial") {
      const mi = Math.round(km * 0.621371);
      return `${mi} mi`;
    }
    return `${km} km`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Text style={styles.heading}>Settings</Text>

      {/* Units */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Units</Text>
        <View style={styles.segmentRow}>
          {(["metric", "imperial"] as Units[]).map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.segment, settings.units === u && styles.segmentActive]}
              onPress={() => dispatch({ type: "SET_UNITS", payload: u })}
            >
              <Ionicons
                name={u === "metric" ? "globe-outline" : "flag-outline"}
                size={16}
                color={settings.units === u ? "#fff" : "#64748b"}
              />
              <Text style={[styles.segmentText, settings.units === u && styles.segmentTextActive]}>
                {u === "metric" ? "Metric (km)" : "Imperial (mi)"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Radius */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Search radius</Text>
        <Text style={styles.sectionSub}>
          Only show activities within this distance from your location. Items without exact coordinates
          (Reddit posts) use text-based filtering instead.
        </Text>
        <View style={styles.radiusGrid}>
          {RADIUS_OPTIONS.map((km) => (
            <TouchableOpacity
              key={km}
              style={[styles.radiusChip, settings.radiusKm === km && styles.radiusChipActive]}
              onPress={() => dispatch({ type: "SET_RADIUS", payload: km })}
            >
              <Text style={[styles.radiusChipText, settings.radiusKm === km && styles.radiusChipTextActive]}>
                {radiusLabel(km)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Info box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={18} color="#6366f1" />
        <Text style={styles.infoText}>
          Location filtering works best when you have GPS or a precise manual location set. The radius
          applies to map pins (trails, OSM places, TripAdvisor). Reddit and social posts are filtered
          by city/region name mentioned in the text.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  content: {
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: "#f1f5f9",
    marginBottom: 28,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  sectionSub: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 19,
    marginBottom: 12,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  segmentActive: {
    backgroundColor: "#6366f1",
    borderColor: "#6366f1",
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  segmentTextActive: {
    color: "#fff",
  },
  radiusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  radiusChip: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  radiusChipActive: {
    backgroundColor: "#312e81",
    borderColor: "#6366f1",
  },
  radiusChipText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  radiusChipTextActive: {
    color: "#a5b4fc",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#312e81",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 20,
  },
});
