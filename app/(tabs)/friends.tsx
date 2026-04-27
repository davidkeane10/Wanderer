import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function FriendsTab() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
        <Text style={styles.subtitle}>Find your adventure crew</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.iconRing}>
          <Ionicons name="person-add" size={48} color="#6366f1" />
        </View>
        <Text style={styles.comingSoonTitle}>Friend system, coming soon</Text>
        <Text style={styles.comingSoonBody}>
          Add friends by username or QR code, build your crew, and start planning group
          adventures together.
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={16} color="#6366f1" />
              </View>
              <Text style={styles.featureText}>{f.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.avatarRow}>
          {["D", "A", "J", "M", "+"].map((letter, i) => (
            <View
              key={i}
              style={[
                styles.avatar,
                i === 4 && styles.avatarMore,
                { marginLeft: i === 0 ? 0 : -12 },
              ]}
            >
              <Text style={[styles.avatarText, i === 4 && styles.avatarMoreText]}>
                {letter}
              </Text>
            </View>
          ))}
          <Text style={styles.avatarLabel}>Your crew awaits</Text>
        </View>
      </View>
    </View>
  );
}

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "search-outline",       label: "Find friends by username or name" },
  { icon: "qr-code-outline",      label: "Add in person with a QR code" },
  { icon: "people-outline",       label: "See mutual friends on requests" },
  { icon: "lock-closed-outline",  label: "Control who can see your profile" },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#f1f5f9", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#312e81",
    marginBottom: 8,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f1f5f9",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  comingSoonBody: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
  },
  featureList: { gap: 10, alignSelf: "stretch", marginTop: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { fontSize: 14, color: "#94a3b8", flex: 1 },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#312e81",
    borderWidth: 2,
    borderColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMore: {
    backgroundColor: "#1e293b",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#a5b4fc",
  },
  avatarMoreText: {
    color: "#475569",
  },
  avatarLabel: {
    fontSize: 13,
    color: "#475569",
    marginLeft: 16,
    fontStyle: "italic",
  },
});
