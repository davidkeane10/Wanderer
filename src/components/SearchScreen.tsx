/**
 * SearchScreen — 3-step wizard search builder.
 *
 * Step 1: Category
 * Step 2: Distance + unit toggle
 * Step 3: Description (free text) + Find Quests
 *
 * Background prefetch begins as soon as the user picks a category.
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { useLocation } from "../context/LocationContext";
import type { CategoryKey, SearchInput } from "../hooks/useQuestSearch";
import { isOllamaAvailable } from "../services/ollama";

interface CategoryConfig {
  key: CategoryKey;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  defaultDistanceKm: number;
  placeholder: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: "hiking",
    label: "Hiking",
    subtitle: "Trails, peaks, waterfalls & outdoor adventures",
    icon: "trail-sign-outline",
    color: "#22c55e",
    defaultDistanceKm: 80, // ~50 mi
    placeholder:
      "e.g. A hike with a waterfall, not too long, maybe an hour or two, relatively flat",
  },
  {
    key: "urbex",
    label: "Urban Exploring",
    subtitle: "Abandoned buildings, ruins & hidden places",
    icon: "business-outline",
    color: "#f59e0b",
    defaultDistanceKm: 32, // ~20 mi
    placeholder:
      "e.g. An abandoned factory or hospital with some history, preferably eerie and interesting",
  },
  {
    key: "town",
    label: "City",
    subtitle: "Restaurants, events, activities & local finds",
    icon: "storefront-outline",
    color: "#818cf8",
    defaultDistanceKm: 16, // ~10 mi
    placeholder:
      "e.g. A cozy coffee shop or a fun activity for friends on a weekend afternoon",
  },
  {
    key: "other",
    label: "Other",
    subtitle: "Something different — you describe it",
    icon: "compass-outline",
    color: "#ec4899",
    defaultDistanceKm: 80, // ~50 mi
    placeholder:
      "e.g. A scenic spot to watch the sunset with friends, somewhere off the beaten path",
  },
];

// Mile steps shown to the user — internally stored as km
const MILE_STEPS = [5, 10, 20, 50, 100, 150];
const KM_STEPS   = MILE_STEPS.map((mi) => Math.round(mi * 1.60934));
// = [8, 16, 32, 80, 161, 241]

function getMileLabel(idx: number): string {
  const mi = MILE_STEPS[idx];
  return idx === MILE_STEPS.length - 1 ? `${mi}+ mi` : `${mi} mi`;
}

function getKmLabel(idx: number): string {
  const km = KM_STEPS[idx];
  return idx === KM_STEPS.length - 1 ? `${km}+ km` : `${km} km`;
}

interface SearchScreenProps {
  onSearch: (input: SearchInput) => void;
}

type Step = 1 | 2 | 3;

export function SearchScreen({ onSearch }: SearchScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { location } = useLocation();

  const [aiOnline, setAiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const online = await isOllamaAvailable();
      if (!cancelled) setAiOnline(online);
      // If offline, keep retrying every 10s until it comes up
      if (!online && !cancelled) {
        setTimeout(check, 10_000);
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [useMetric, setUseMetric] = useState(false); // miles by default
  const [distanceIndex, setDistanceIndex] = useState(1); // 10 mi default
  const [description, setDescription] = useState("");

  // Fade animation between steps
  const opacity = useRef(new Animated.Value(1)).current;

  const selectedCategory = CATEGORIES.find((c) => c.key === category);
  const distanceKm = KM_STEPS[distanceIndex];
  const distanceDisplay = useMetric ? getKmLabel(distanceIndex) : getMileLabel(distanceIndex);

  function animateToStep(next: Step, fn: () => void) {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      fn();
      setStep(next);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  }

  function handleSelectCategory(cfg: CategoryConfig) {
    const idx = KM_STEPS.findIndex((k) => k >= cfg.defaultDistanceKm);
    animateToStep(2, () => {
      setCategory(cfg.key);
      setDistanceIndex(idx >= 0 ? idx : 2);
    });
  }

  function handleDistanceNext() {
    animateToStep(3, () => {});
  }

  function handleBack() {
    if (step === 2) animateToStep(1, () => {});
    else if (step === 3) animateToStep(2, () => {});
  }

  function handleSearch() {
    if (!category || description.trim().length < 5) return;
    onSearch({
      category,
      distanceKm,
      description: description.trim(),
      location: {
        cityName: location.cityName,
        regionName: location.regionName,
        countryName: location.countryName,
        coords: location.coords,
      },
    });
  }

  // ── Step indicators ────────────────────────────────────────────────────────
  function StepDots() {
    return (
      <View style={styles.dots}>
        {([1, 2, 3] as Step[]).map((s) => (
          <View
            key={s}
            style={[styles.dot, step === s && styles.dotActive, step > s && styles.dotDone]}
          />
        ))}
      </View>
    );
  }

  // ── Header ─────────────────────────────────────────────────────────────────
  function Header() {
    return (
      <View style={styles.headerRow}>
        {step > 1 ? (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color="#94a3b8" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.addSpotBtn} onPress={() => router.push("/submit-spot" as any)} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={15} color="#f59e0b" />
            <Text style={styles.addSpotBtnText}>Add a spot</Text>
          </TouchableOpacity>
        )}
        <StepDots />
        {/* AI status pill */}
        {aiOnline !== null && (
          <View style={[styles.aiBadge, aiOnline ? styles.aiBadgeOn : styles.aiBadgeOff]}>
            <View style={[styles.aiDot, { backgroundColor: aiOnline ? "#22c55e" : "#475569" }]} />
            <Text style={[styles.aiBadgeText, { color: aiOnline ? "#22c55e" : "#475569" }]}>
              {aiOnline ? "AI online" : "AI offline"}
            </Text>
          </View>
        )}
        {/* Location pill */}
        <TouchableOpacity
          style={styles.locationPill}
          onPress={() => router.push("/location-picker")}
        >
          <Ionicons name="location" size={12} color="#6366f1" />
          <Text style={styles.locationPillText} numberOfLines={1}>
            {location.cityName ?? "Set location"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Location gate — shown when no location is set ─────────────────────────
  function LocationGate() {
    return (
      <View style={styles.gateContainer}>
        <View style={styles.gateIconWrap}>
          <Ionicons name="compass" size={64} color="#6366f1" />
        </View>
        <Text style={styles.gateTitle}>Where are you?</Text>
        <Text style={styles.gateSubtitle}>
          SideQuests needs your location to find adventures near you.
        </Text>
        <TouchableOpacity
          style={styles.gateGpsBtn}
          onPress={() => router.push("/location-picker")}
          activeOpacity={0.85}
        >
          <Ionicons name="locate" size={20} color="#fff" />
          <Text style={styles.gateGpsBtnText}>Use my location</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.gateCityBtn}
          onPress={() => router.push("/location-picker")}
          activeOpacity={0.85}
        >
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <Text style={styles.gateCityBtnText}>Enter a city manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Step 1: Category ───────────────────────────────────────────────────────
  function StepCategory() {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>What are you{"\n"}looking to do?</Text>
        <Text style={styles.stepSubtitle}>Choose a category to get started</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cfg) => (
            <TouchableOpacity
              key={cfg.key}
              style={[styles.categoryCard, { borderColor: cfg.color + "40" }]}
              onPress={() => handleSelectCategory(cfg)}
              activeOpacity={0.75}
            >
              <View style={[styles.categoryIcon, { backgroundColor: cfg.color + "22" }]}>
                <Ionicons name={cfg.icon} size={26} color={cfg.color} />
              </View>
              <Text style={[styles.categoryLabel, { color: cfg.color }]}>{cfg.label}</Text>
              <Text style={styles.categorySubtitle}>{cfg.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ── Step 2: Distance ───────────────────────────────────────────────────────
  function StepDistance() {
    return (
      <View style={styles.stepContent}>
        <View style={[styles.selectedBadge, { borderColor: selectedCategory!.color + "60" }]}>
          <Ionicons name={selectedCategory!.icon} size={14} color={selectedCategory!.color} />
          <Text style={[styles.selectedBadgeText, { color: selectedCategory!.color }]}>
            {selectedCategory!.label}
          </Text>
        </View>

        <Text style={styles.stepTitle}>How far are you{"\n"}willing to travel?</Text>

        <View style={styles.unitToggleRow}>
          <TouchableOpacity
            style={[styles.unitBtn, useMetric && styles.unitBtnActive]}
            onPress={() => setUseMetric(true)}
          >
            <Text style={[styles.unitBtnText, useMetric && styles.unitBtnTextActive]}>km</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.unitBtn, !useMetric && styles.unitBtnActive]}
            onPress={() => setUseMetric(false)}
          >
            <Text style={[styles.unitBtnText, !useMetric && styles.unitBtnTextActive]}>miles</Text>
          </TouchableOpacity>
        </View>

        {/* Big distance display */}
        <Text style={styles.distanceBig}>{distanceDisplay}</Text>

        {/* Step pills */}
        <View style={styles.distancePills}>
          {KM_STEPS.map((km, idx) => {
            const label = useMetric ? getKmLabel(idx) : getMileLabel(idx);
            const active = distanceIndex === idx;
            return (
              <TouchableOpacity
                key={km}
                style={[styles.distancePill, active && styles.distancePillActive]}
                onPress={() => setDistanceIndex(idx)}
              >
                <Text style={[styles.distancePillText, active && styles.distancePillTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={handleDistanceNext}>
          <Text style={styles.nextBtnText}>Next</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  const canSearch = description.trim().length >= 5;

  // Show location gate full-screen before anything else
  if (!location.cityName) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header />
        <View style={styles.gateFull}>
          <LocationGate />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity }}>
            {step === 1 && <StepCategory />}
            {step === 2 && <StepDistance />}
            {step === 3 && (
              <View style={styles.stepContent}>
                <View style={styles.summaryRow}>
                  <View style={[styles.selectedBadge, { borderColor: selectedCategory!.color + "60" }]}>
                    <Ionicons name={selectedCategory!.icon} size={14} color={selectedCategory!.color} />
                    <Text style={[styles.selectedBadgeText, { color: selectedCategory!.color }]}>
                      {selectedCategory!.label}
                    </Text>
                  </View>
                  <View style={styles.selectedBadge}>
                    <Ionicons name="navigate-outline" size={14} color="#64748b" />
                    <Text style={styles.selectedBadgeText}>{distanceDisplay}</Text>
                  </View>
                </View>

                <Text style={styles.stepTitle}>Describe what{"\n"}you are looking for</Text>
                <Text style={styles.stepSubtitle}>
                  The more detail you give, the better the results
                </Text>

                <TextInput
                  style={styles.descInput}
                  multiline
                  numberOfLines={5}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={selectedCategory?.placeholder ?? "Tell us what kind of adventure you have in mind..."}
                  placeholderTextColor="#334155"
                  textAlignVertical="top"
                  autoFocus
                />

                <TouchableOpacity
                  style={[styles.searchBtn, !canSearch && styles.searchBtnDisabled]}
                  onPress={handleSearch}
                  disabled={!canSearch}
                  activeOpacity={0.85}
                >
                  <Ionicons name="search" size={20} color="#fff" />
                  <Text style={styles.searchBtnText}>Find Quests</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#0f172a" },
  scroll: { paddingHorizontal: 20 },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPlaceholder: { width: 36, height: 36 },
  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#334155",
  },
  dotActive: { width: 18, backgroundColor: "#6366f1" },
  dotDone: { backgroundColor: "#22c55e" },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1e293b",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 130,
  },
  locationPillText: { fontSize: 12, color: "#94a3b8", fontWeight: "600" },

  // AI status badge
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
  },
  aiBadgeOn: { backgroundColor: "#052e16", borderColor: "#166534" },
  aiBadgeOff: { backgroundColor: "#1e293b", borderColor: "#334155" },
  aiDot: { width: 6, height: 6, borderRadius: 3 },
  aiBadgeText: { fontSize: 11, fontWeight: "700" },

  // Step content
  stepContent: { paddingTop: 16, gap: 0 },
  stepTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#f1f5f9",
    lineHeight: 36,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  stepSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 28,
    lineHeight: 20,
  },

  // Category grid (2x2)
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  categoryCard: {
    width: "47%",
    backgroundColor: "#1e293b",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    gap: 10,
  },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryLabel: {
    fontSize: 17,
    fontWeight: "800",
  },
  categorySubtitle: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },

  // Selected badge
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1e293b",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 20,
  },
  selectedBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },

  // Unit toggle
  unitToggleRow: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 4,
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: 20,
  },
  unitBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 9,
  },
  unitBtnActive: { backgroundColor: "#6366f1" },
  unitBtnText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  unitBtnTextActive: { color: "#fff" },

  // Distance display
  distanceBig: {
    fontSize: 52,
    fontWeight: "900",
    color: "#f1f5f9",
    letterSpacing: -2,
    marginBottom: 24,
  },

  // Distance pills
  distancePills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 32,
  },
  distancePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
  },
  distancePillActive: { borderColor: "#6366f1", backgroundColor: "#312e81" },
  distancePillText: { fontSize: 14, color: "#64748b", fontWeight: "600" },
  distancePillTextActive: { color: "#a5b4fc" },

  // Next button
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 18,
  },
  nextBtnText: { fontSize: 17, fontWeight: "800", color: "#fff" },

  // Summary row (step 3)
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 0,
  },

  // Description input
  descInput: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#334155",
    color: "#f1f5f9",
    fontSize: 16,
    lineHeight: 24,
    padding: 18,
    minHeight: 140,
    marginBottom: 20,
    marginTop: 8,
  },

  // Search button
  searchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 18,
  },
  searchBtnDisabled: { backgroundColor: "#312e81", opacity: 0.5 },
  searchBtnText: { fontSize: 17, fontWeight: "800", color: "#fff" },

  // Location gate
  gateFull: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  gateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingTop: 40,
    gap: 16,
  },
  gateIconWrap: {
    width: 110,
    height: 110,
    borderRadius: 32,
    backgroundColor: "#1e2d4a",
    borderWidth: 1.5,
    borderColor: "#6366f144",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gateTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: "#f1f5f9",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  gateSubtitle: {
    fontSize: 15,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  gateGpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 18,
    width: "100%",
  },
  gateGpsBtnText: { fontSize: 17, fontWeight: "800", color: "#fff" },
  gateCityBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    paddingVertical: 16,
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#334155",
  },
  gateCityBtnText: { fontSize: 16, fontWeight: "700", color: "#94a3b8" },

  addSpotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1c1408",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#78350f",
  },
  addSpotBtnText: { fontSize: 12, color: "#f59e0b", fontWeight: "700" },
});
