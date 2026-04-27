import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { forwardGeocode } from "../services/geocode";
import { extractCoordinates, extractPrimaryLocation } from "../utils/locationParser";

interface Coords {
  latitude: number;
  longitude: number;
}

interface MapPreviewProps {
  title: string;
  selftext: string;
}

function buildStaticMapUrl(lat: number, lon: number): string {
  // OpenStreetMap static map — no API key required
  const zoom = 13;
  const width = 600;
  const height = 280;
  return (
    `https://staticmap.openstreetmap.de/staticmap.php` +
    `?center=${lat},${lon}&zoom=${zoom}&size=${width}x${height}` +
    `&markers=${lat},${lon},red-pushpin`
  );
}

function openInMaps(lat: number, lon: number, label: string) {
  const encoded = encodeURIComponent(label);
  const url =
    Platform.OS === "ios"
      ? `maps://?ll=${lat},${lon}&q=${encoded}`
      : `geo:${lat},${lon}?q=${lat},${lon}(${encoded})`;
  Linking.openURL(url);
}

export function MapPreview({ title, selftext }: MapPreviewProps) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "none">("loading");

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const text = `${title} ${selftext}`;

      // 1. Try to find raw coordinates in the text first
      const direct = extractCoordinates(text);
      if (direct) {
        if (!cancelled) {
          setCoords(direct);
          setLocationLabel(extractPrimaryLocation(title, selftext) ?? title);
          setStatus("found");
        }
        return;
      }

      // 2. Extract a location name and geocode it
      const locationName = extractPrimaryLocation(title, selftext);
      if (!locationName) {
        if (!cancelled) setStatus("none");
        return;
      }

      const geocoded = await forwardGeocode(locationName);
      if (!cancelled) {
        if (geocoded) {
          setCoords({ latitude: geocoded.latitude, longitude: geocoded.longitude });
          setLocationLabel(locationName);
          setStatus("found");
        } else {
          setStatus("none");
        }
      }
    }

    resolve();
    return () => { cancelled = true; };
  }, [title, selftext]);

  if (status === "loading") {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#6366f1" />
        <Text style={styles.loadingText}>Looking for location…</Text>
      </View>
    );
  }

  if (status === "none" || !coords) return null;

  const mapUrl = buildStaticMapUrl(coords.latitude, coords.longitude);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Ionicons name="location" size={14} color="#6366f1" />
        <Text style={styles.label} numberOfLines={1}>
          {locationLabel}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openInMaps(coords.latitude, coords.longitude, locationLabel ?? title)}
      >
        <Image
          source={{ uri: mapUrl }}
          style={styles.mapImage}
          contentFit="cover"
          transition={300}
        />
        <View style={styles.openOverlay}>
          <Ionicons name="navigate" size={14} color="#fff" />
          <Text style={styles.openText}>Open in Maps</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#1e293b",
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748b",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#6366f1",
  },
  mapImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#334155",
  },
  openOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0f172acc",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  openText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
});
