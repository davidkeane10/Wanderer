import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { submitCommunitySpot } from "../src/services/communitySpots";
import { getPickedLocation, clearPickedLocation } from "../src/utils/pickedLocation";
import { CATEGORIES } from "../src/config/categories";

export default function SubmitSpotScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up coords placed in the singleton when returning from the map screen
  useFocusEffect(
    useCallback(() => {
      const picked = getPickedLocation();
      if (picked) {
        setLocationCoords(picked);
        clearPickedLocation();
      }
    }, [])
  );

  const canSubmit =
    name.trim().length >= 2 &&
    category !== null &&
    locationCoords !== null &&
    description.trim().length >= 10;

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  }

  function handleOpenMap() {
    const params = locationCoords
      ? `?pinLat=${locationCoords.latitude}&pinLng=${locationCoords.longitude}`
      : "";
    router.push(`/pick-spot-location${params}` as any);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    let saved = false;
    try {
      await submitCommunitySpot({
        name,
        category: category!,
        locationName: locationLabel.trim() || `${locationCoords!.latitude.toFixed(4)}, ${locationCoords!.longitude.toFixed(4)}`,
        locationCoords,
        description,
        imageUri,
      });
      saved = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (__DEV__) console.warn("[SubmitSpot] Firebase error:", msg);
      Alert.alert("Submission failed", `Could not save your spot: ${msg}`);
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
    if (saved) router.replace("/" as any);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add a Spot</Text>
        <View style={styles.headerBadge}>
          <Ionicons name="people-outline" size={13} color="#f59e0b" />
          <Text style={styles.headerBadgeText}>Community</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>
            Know a spot that's not showing up? Add it here and we'll review it.
          </Text>

          {/* Spot Name */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Spot Name</Text>
              <View style={styles.requiredPill}>
                <Text style={styles.requiredText}>Required</Text>
              </View>
            </View>
            <TextInput
              style={[styles.input, name.trim().length >= 2 && styles.inputFilled]}
              placeholder="e.g. The Old Mill Factory"
              placeholderTextColor="#475569"
              value={name}
              onChangeText={setName}
              maxLength={80}
              returnKeyType="next"
            />
          </View>

          {/* Category */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.requiredPill}>
                <Text style={styles.requiredText}>Required</Text>
              </View>
            </View>
            <Text style={styles.fieldHint}>Pick the type that best fits this spot</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const selected = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categoryCard,
                      { borderColor: selected ? cat.color : "#334155" },
                      selected && { backgroundColor: cat.color + "18" },
                    ]}
                    onPress={() => setCategory(cat.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    <Text
                      style={[styles.categoryLabel, { color: selected ? cat.color : "#94a3b8" }]}
                      numberOfLines={2}
                    >
                      {cat.label}
                    </Text>
                    {selected && (
                      <View style={[styles.categoryCheck, { backgroundColor: cat.color }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Location — map pin */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Location</Text>
              <View style={styles.requiredPill}>
                <Text style={styles.requiredText}>Required</Text>
              </View>
            </View>
            <Text style={styles.fieldHint}>Drop a pin on the map to mark where the spot is</Text>

            <TouchableOpacity
              style={[styles.mapPinBtn, locationCoords && styles.mapPinBtnPinned]}
              onPress={handleOpenMap}
              activeOpacity={0.85}
            >
              <View style={[styles.mapPinIcon, locationCoords && styles.mapPinIconPinned]}>
                <Ionicons
                  name={locationCoords ? "location" : "location-outline"}
                  size={22}
                  color={locationCoords ? "#22c55e" : "#f59e0b"}
                />
              </View>
              <View style={styles.mapPinContent}>
                {locationCoords ? (
                  <>
                    <Text style={styles.mapPinTitle}>Location pinned ✓</Text>
                    <Text style={styles.mapPinCoords}>
                      {locationCoords.latitude.toFixed(5)}, {locationCoords.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.mapPinHint}>Tap to adjust</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.mapPinTitle}>Set on Map</Text>
                    <Text style={styles.mapPinHint}>Tap to open the map and drop a pin</Text>
                  </>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={locationCoords ? "#22c55e44" : "#f59e0b44"} />
            </TouchableOpacity>

            {/* Optional human-readable label */}
            {locationCoords && (
              <TextInput
                style={styles.inputSmall}
                placeholder="Add a location label (optional) — e.g. Near Cork Docks"
                placeholderTextColor="#334155"
                value={locationLabel}
                onChangeText={setLocationLabel}
                maxLength={100}
                returnKeyType="next"
              />
            )}
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Description</Text>
              <View style={styles.requiredPill}>
                <Text style={styles.requiredText}>Required</Text>
              </View>
            </View>
            <Text style={styles.fieldHint}>
              What is it? What makes it worth visiting? Any access info?
            </Text>
            <TextInput
              style={[styles.textArea, description.trim().length >= 10 && styles.inputFilled]}
              placeholder="e.g. Large abandoned textile mill from the 1800s. The main building is accessible from the east side. Roof is partially intact. Incredible decay photography potential."
              placeholderTextColor="#475569"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              maxLength={600}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{description.length}/600</Text>
          </View>

          {/* Photo */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Photo</Text>
              <Text style={styles.optionalText}>Optional</Text>
            </View>
            <Text style={styles.fieldHint}>Add a photo to help us identify the spot</Text>

            {imageUri ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUri }} style={styles.imagePreview} contentFit="cover" />
                <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImageUri(null)}>
                  <Ionicons name="close-circle" size={26} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addPhotoBtn} onPress={handlePickImage} activeOpacity={0.8}>
                <Ionicons name="camera-outline" size={24} color="#64748b" />
                <Text style={styles.addPhotoBtnText}>Add a Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Required fields reminder */}
          {!canSubmit && (name.length > 0 || locationCoords !== null || description.length > 0) && (
            <Text style={styles.validationNote}>
              Name, a map pin, and description are all required before you can submit.
            </Text>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#0f172a" size="small" />
            ) : (
              <>
                <Ionicons name="send-outline" size={20} color="#0f172a" />
                <Text style={styles.submitBtnText}>Submit Spot</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#0f172a" },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },

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
    fontSize: 20,
    fontWeight: "800",
    color: "#f1f5f9",
  },
  headerBadge: {
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
  headerBadgeText: {
    fontSize: 11,
    color: "#f59e0b",
    fontWeight: "700",
  },

  intro: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 21,
    marginBottom: 24,
    marginTop: 4,
  },

  fieldGroup: { marginBottom: 24 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  label: { fontSize: 15, fontWeight: "700", color: "#e2e8f0" },
  requiredPill: {
    backgroundColor: "#1c1408",
    borderWidth: 1,
    borderColor: "#92400e",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  requiredText: { fontSize: 10, color: "#f59e0b", fontWeight: "700" },
  optionalText: { fontSize: 12, color: "#475569", fontWeight: "600" },
  fieldHint: { fontSize: 12, color: "#475569", lineHeight: 18, marginBottom: 10 },

  input: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#334155",
    color: "#f1f5f9",
    fontSize: 15,
    padding: 14,
  },
  inputSmall: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
    color: "#94a3b8",
    fontSize: 13,
    padding: 12,
    marginTop: 10,
  },
  textArea: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#334155",
    color: "#f1f5f9",
    fontSize: 15,
    padding: 14,
    minHeight: 120,
    textAlignVertical: "top",
  },
  inputFilled: {
    borderColor: "#f59e0b44",
    backgroundColor: "#1a160a",
  },
  charCount: {
    fontSize: 11,
    color: "#334155",
    textAlign: "right",
    marginTop: 5,
  },

  // Map pin button
  mapPinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#334155",
    borderStyle: "dashed",
    padding: 16,
  },
  mapPinBtnPinned: {
    borderColor: "#14532d",
    borderStyle: "solid",
    backgroundColor: "#052e16",
  },
  mapPinIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#1c1408",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mapPinIconPinned: {
    backgroundColor: "#052e16",
  },
  mapPinContent: { flex: 1, gap: 2 },
  mapPinTitle: { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  mapPinCoords: { fontSize: 12, color: "#22c55e", fontWeight: "600" },
  mapPinHint: { fontSize: 12, color: "#475569" },

  addPhotoBtn: {
    borderWidth: 1.5,
    borderColor: "#334155",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e293b",
  },
  addPhotoBtnText: { fontSize: 14, color: "#64748b", fontWeight: "600" },
  imagePreviewWrap: { position: "relative" },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#1e293b",
  },
  removeImageBtn: { position: "absolute", top: 8, right: 8 },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1c0a0a",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { fontSize: 14, color: "#fca5a5", flex: 1 },
  validationNote: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 19,
  },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#f59e0b",
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: "#334155", opacity: 0.6 },
  submitBtnText: { fontSize: 17, fontWeight: "800", color: "#0f172a" },

  // ── Category picker ──
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryCard: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    position: "relative",
  },
  categoryEmoji: {
    fontSize: 22,
    flexShrink: 0,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    lineHeight: 18,
  },
  categoryCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
