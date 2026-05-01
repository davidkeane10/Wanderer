import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/context/AuthContext";
import { useSettings } from "../../src/context/SettingsContext";
import type { Units } from "../../src/context/SettingsContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../src/services/firebase";

const RADIUS_OPTIONS = [25, 50, 100, 200, 500];

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentUser, signOut, updateDisplayName } = useAuth();
  const { settings, dispatch } = useSettings();

  const [spotsCount, setSpotsCount] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    getDocs(query(collection(db, "community_spots"), where("submittedBy", "==", currentUser.uid)))
      .then((snap) => setSpotsCount(snap.size))
      .catch(() => setSpotsCount(0));
  }, [currentUser]);

  function memberSince() {
    if (!currentUser?.createdAt) return "Unknown";
    return new Date(currentUser.createdAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  async function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch {
            // proceed regardless
          }
          router.replace("/login" as any);
        },
      },
    ]);
  }

  async function handleSaveName() {
    if (!nameInput.trim() || nameInput.trim().length < 2) {
      Alert.alert("Too short", "Name must be at least 2 characters.");
      return;
    }
    setSavingName(true);
    try {
      await updateDisplayName(nameInput.trim());
      setEditingName(false);
    } catch {
      Alert.alert("Error", "Could not update your name. Try again.");
    } finally {
      setSavingName(false);
    }
  }

  const radiusLabel = (km: number) =>
    settings.units === "imperial" ? `${Math.round(km * 0.621371)} mi` : `${km} km`;

  if (!currentUser) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Account</Text>

      {/* ── Profile card ── */}
      <View style={styles.profileCard}>
        <View style={[styles.avatar, { backgroundColor: currentUser.color }]}>
          <Text style={styles.avatarText}>{currentUser.initials}</Text>
        </View>

        <View style={styles.profileInfo}>
          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
                placeholderTextColor="#475569"
              />
              <TouchableOpacity style={styles.saveNameBtn} onPress={handleSaveName} disabled={savingName}>
                <Text style={styles.saveNameBtnText}>{savingName ? "…" : "Save"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)} style={styles.cancelBtn}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.nameRow}
              onPress={() => { setNameInput(currentUser.name); setEditingName(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.profileName}>{currentUser.name}</Text>
              <Ionicons name="pencil-outline" size={14} color="#475569" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          )}
          <Text style={styles.profileEmail}>{currentUser.email}</Text>
          <Text style={styles.profileSince}>Member since {memberSince()}</Text>
        </View>
      </View>

      {/* ── Stats ── */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{spotsCount ?? "—"}</Text>
          <Text style={styles.statLabel}>Spots Added</Text>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statDot, { backgroundColor: currentUser.color }]} />
          <Text style={styles.statLabel}>Explorer</Text>
        </View>
      </View>

      {/* ── Settings section ── */}
      <Text style={styles.sectionLabel}>Preferences</Text>

      <View style={styles.section}>
        <Text style={styles.sectionItemLabel}>Units</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionItemLabel}>Search Radius</Text>
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

      {/* ── Actions ── */}
      <Text style={styles.sectionLabel}>Account</Text>

      <View style={styles.actionsList}>
        <TouchableOpacity style={styles.actionRow} onPress={() => router.push("/submit-spot" as any)}>
          <View style={styles.actionIcon}>
            <Ionicons name="add-circle-outline" size={20} color="#22c55e" />
          </View>
          <Text style={styles.actionLabel}>Add a Spot</Text>
          <Ionicons name="chevron-forward" size={16} color="#334155" />
        </TouchableOpacity>

        <View style={styles.actionDivider} />

        <TouchableOpacity style={styles.actionRow} onPress={handleSignOut}>
          <View style={[styles.actionIcon, { backgroundColor: "#1c0a0a" }]}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          </View>
          <Text style={[styles.actionLabel, { color: "#ef4444" }]}>Sign Out</Text>
          <Ionicons name="chevron-forward" size={16} color="#334155" />
        </TouchableOpacity>
      </View>

      <Text style={styles.versionText}>SideQuests • Your account stays signed in across devices</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  content: { paddingHorizontal: 20 },
  heading: { fontSize: 26, fontWeight: "800", color: "#f1f5f9", marginBottom: 20 },

  // Profile
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { fontSize: 22, fontWeight: "800", color: "#fff" },
  profileInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  profileName: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  profileEmail: { fontSize: 13, color: "#64748b" },
  profileSince: { fontSize: 12, color: "#475569", marginTop: 2 },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nameInput: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#6366f1",
  },
  saveNameBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  saveNameBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  cancelBtn: { padding: 4 },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statValue: { fontSize: 28, fontWeight: "900", color: "#f1f5f9" },
  statLabel: { fontSize: 12, color: "#64748b", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  statDot: { width: 16, height: 16, borderRadius: 8 },

  // Section labels
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },

  // Preferences
  section: { marginBottom: 20 },
  sectionItemLabel: { fontSize: 14, fontWeight: "600", color: "#94a3b8", marginBottom: 10 },
  segmentRow: { flexDirection: "row", gap: 10 },
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
  segmentActive: { backgroundColor: "#6366f1", borderColor: "#6366f1" },
  segmentText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  segmentTextActive: { color: "#fff" },
  radiusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  radiusChip: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  radiusChipActive: { backgroundColor: "#312e81", borderColor: "#6366f1" },
  radiusChipText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  radiusChipTextActive: { color: "#a5b4fc" },

  // Actions list
  actionsList: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 28,
    overflow: "hidden",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0d2818",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  actionDivider: { height: 1, backgroundColor: "#334155", marginLeft: 66 },

  versionText: { fontSize: 12, color: "#334155", textAlign: "center", marginTop: 8 },
});
