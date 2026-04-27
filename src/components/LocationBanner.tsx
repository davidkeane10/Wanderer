import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocation } from "../context/LocationContext";

export function LocationBanner() {
  const { location } = useLocation();
  const router = useRouter();

  const handlePress = () => {
    router.push("/location-picker");
  };

  const getLocationText = () => {
    if (location.isLoading) return "Detecting location...";
    if (location.cityName) {
      const parts = [location.cityName, location.regionName].filter(Boolean);
      return parts.join(", ");
    }
    return "Set your location";
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.8}>
      <View style={styles.iconWrap}>
        {location.isLoading ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <Ionicons
            name={location.coords ? "location" : "location-outline"}
            size={18}
            color={location.coords ? "#6366f1" : "#64748b"}
          />
        )}
      </View>
      <Text
        style={[styles.text, !location.coords && styles.textMuted]}
        numberOfLines={1}
      >
        {getLocationText()}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#64748b" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  iconWrap: {
    width: 24,
    alignItems: "center",
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#f1f5f9",
  },
  textMuted: {
    color: "#64748b",
  },
});
