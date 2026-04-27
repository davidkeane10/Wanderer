import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocation } from "../src/context/LocationContext";
import { useDeviceLocation } from "../src/hooks/useDeviceLocation";
import { searchLocationSuggestions, forwardGeocode } from "../src/services/geocode";
import type { LocationSuggestion } from "../src/services/geocode";

const DEBOUNCE_MS = 400;

export default function LocationPickerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { location, dispatch } = useLocation();
  const { requestLocation } = useDeviceLocation();

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Fetch suggestions whenever query changes (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsFetchingSuggestions(true);
      const results = await searchLocationSuggestions(query.trim());
      setSuggestions(results);
      setIsFetchingSuggestions(false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleUseGPS = async () => {
    await requestLocation();
    router.back();
  };

  const handleSelectSuggestion = useCallback(
    (suggestion: LocationSuggestion) => {
      setSuggestions([]);
      setQuery("");
      dispatch({
        type: "SET_MANUAL_LOCATION",
        payload: {
          coords: { latitude: suggestion.latitude, longitude: suggestion.longitude },
          cityName: suggestion.cityName,
          regionName: suggestion.regionName,
          countryName: suggestion.countryName,
        },
      });
      router.back();
    },
    [dispatch, router]
  );

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSuggestions([]);
    try {
      const result = await forwardGeocode(query.trim());
      if (!result) {
        Alert.alert("Location not found", "Try a different city or region name.");
        return;
      }
      dispatch({
        type: "SET_MANUAL_LOCATION",
        payload: {
          coords: { latitude: result.latitude, longitude: result.longitude },
          cityName: result.cityName,
          regionName: result.regionName,
          countryName: result.countryName,
        },
      });
      router.back();
    } catch {
      Alert.alert("Error", "Could not search for that location.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleClear = () => {
    dispatch({ type: "CLEAR_LOCATION" });
    router.back();
  };

  const showSuggestions = suggestions.length > 0 && !isSearching;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Set Location</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Show quests near you by setting your location.
      </Text>

      {/* Current location display */}
      {location.cityName ? (
        <View style={styles.currentBox}>
          <Ionicons name="location" size={16} color="#6366f1" />
          <Text style={styles.currentText}>
            {[location.cityName, location.regionName].filter(Boolean).join(", ")}
          </Text>
          {location.isManual && (
            <Text style={styles.manualBadge}>Manual</Text>
          )}
        </View>
      ) : null}

      {/* GPS Button */}
      <TouchableOpacity
        style={styles.gpsBtn}
        onPress={handleUseGPS}
        disabled={location.isLoading}
      >
        {location.isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="navigate" size={20} color="#fff" />
        )}
        <Text style={styles.gpsBtnText}>Use My Current Location</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>or search</Text>
        <View style={styles.divider} />
      </View>

      {/* Search input */}
      <View style={styles.searchRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="City, suburb, or region..."
          placeholderTextColor="#475569"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="words"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.searchBtn, !query.trim() && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={!query.trim() || isSearching}
        >
          {isSearching ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="search" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Suggestion loading indicator */}
      {isFetchingSuggestions && query.trim().length >= 2 && !showSuggestions && (
        <View style={styles.suggestionsLoading}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.suggestionsLoadingText}>Searching...</Text>
        </View>
      )}

      {/* Autocomplete suggestions */}
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.displayName}
            keyboardShouldPersistTaps="always"
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.suggestionItem,
                  index === suggestions.length - 1 && styles.suggestionItemLast,
                ]}
                onPress={() => handleSelectSuggestion(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="location-outline" size={16} color="#6366f1" style={styles.suggestionIcon} />
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionPrimary} numberOfLines={1}>
                    {item.cityName || item.displayName.split(",")[0]}
                  </Text>
                  {(item.regionName || item.countryName) ? (
                    <Text style={styles.suggestionSecondary} numberOfLines={1}>
                      {[item.regionName, item.countryName].filter(Boolean).join(", ")}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color="#334155" />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Clear location */}
      {location.coords && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
          <Text style={styles.clearText}>Clear location filter</Text>
        </TouchableOpacity>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f1f5f9",
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 20,
    lineHeight: 20,
  },
  currentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  currentText: {
    flex: 1,
    fontSize: 14,
    color: "#f1f5f9",
    fontWeight: "600",
  },
  manualBadge: {
    fontSize: 11,
    color: "#6366f1",
    backgroundColor: "#312e81",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    fontWeight: "700",
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    padding: 16,
    borderRadius: 14,
    marginBottom: 24,
  },
  gpsBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#1e293b",
  },
  dividerText: {
    fontSize: 13,
    color: "#475569",
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    backgroundColor: "#1e293b",
    color: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnDisabled: {
    backgroundColor: "#334155",
  },
  suggestionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  suggestionsLoadingText: {
    fontSize: 13,
    color: "#475569",
  },
  suggestionsContainer: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginTop: 6,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  suggestionText: {
    flex: 1,
    gap: 2,
  },
  suggestionPrimary: {
    fontSize: 15,
    color: "#f1f5f9",
    fontWeight: "600",
  },
  suggestionSecondary: {
    fontSize: 12,
    color: "#64748b",
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    marginTop: 8,
  },
  clearText: {
    fontSize: 14,
    color: "#ef4444",
    fontWeight: "600",
  },
});
