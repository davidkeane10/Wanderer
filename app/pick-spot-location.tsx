import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocation } from "../src/context/LocationContext";
import { SpotPinMap } from "../src/components/SpotPinMap";
import { setPickedLocation } from "../src/utils/pickedLocation";

export default function PickSpotLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { location } = useLocation();
  const params = useLocalSearchParams<{ pinLat?: string; pinLng?: string }>();

  const initialLat = location.coords?.latitude ?? 53.3498;
  const initialLng = location.coords?.longitude ?? -6.2603;

  const prevPinLat = params.pinLat ? parseFloat(params.pinLat) : null;
  const prevPinLng = params.pinLng ? parseFloat(params.pinLng) : null;

  const [pickedCoords, setPickedCoords] = useState<{ latitude: number; longitude: number } | null>(
    prevPinLat != null && prevPinLng != null
      ? { latitude: prevPinLat, longitude: prevPinLng }
      : null
  );

  function handlePinDrop(lat: number, lng: number) {
    setPickedCoords({ latitude: lat, longitude: lng });
  }

  function handleConfirm() {
    setPickedLocation(pickedCoords);
    router.back();
  }

  function handleCancel() {
    router.back();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Set Spot Location</Text>

        <TouchableOpacity
          style={[styles.confirmBtn, !pickedCoords && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!pickedCoords}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark" size={16} color={pickedCoords ? "#0f172a" : "#475569"} />
          <Text style={[styles.confirmBtnText, !pickedCoords && styles.confirmBtnTextDisabled]}>
            Confirm
          </Text>
        </TouchableOpacity>
      </View>

      {/* Map — fills remaining space */}
      <View style={styles.mapWrap}>
        <SpotPinMap
          initialLat={initialLat}
          initialLng={initialLng}
          pinLat={prevPinLat}
          pinLng={prevPinLng}
          onPinDrop={handlePinDrop}
        />

        {/* Instruction overlay floating above the map */}
        <View style={styles.instructionOverlay} pointerEvents="none">
          {!pickedCoords ? (
            <View style={styles.instructionPill}>
              <Ionicons name="location-outline" size={16} color="#f59e0b" />
              <Text style={styles.instructionText}>Tap the map to place your spot</Text>
            </View>
          ) : (
            <View style={[styles.instructionPill, styles.instructionPillPinned]}>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              <View>
                <Text style={styles.instructionTextPinned}>Pinned · tap to adjust</Text>
                <Text style={styles.instructionCoords}>
                  {pickedCoords.latitude.toFixed(5)}, {pickedCoords.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
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
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#f1f5f9",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  confirmBtnDisabled: { backgroundColor: "#1e293b" },
  confirmBtnText: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  confirmBtnTextDisabled: { color: "#475569" },

  mapWrap: { flex: 1, position: "relative" },

  instructionOverlay: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  instructionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(15,23,42,0.9)",
    borderWidth: 1,
    borderColor: "#78350f",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  instructionPillPinned: { borderColor: "#14532d" },
  instructionText: { fontSize: 13, color: "#f59e0b", fontWeight: "600" },
  instructionTextPinned: { fontSize: 13, color: "#22c55e", fontWeight: "600" },
  instructionCoords: { fontSize: 11, color: "#64748b", marginTop: 2 },
});
