import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGroups } from "../../src/context/GroupsContext";
import type { Group } from "../../src/types/social";

export default function GroupsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { groups } = useGroups();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Groups</Text>
          <Text style={styles.subtitle}>Plan adventures with your crew</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={styles.joinBtn}
            onPress={() => router.push("/group/join" as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add-outline" size={16} color="#818cf8" />
            <Text style={styles.joinBtnText}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push("/group/create" as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.createBtnText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {groups.length === 0 ? (
        <EmptyGroups onCreate={() => router.push("/group/create" as any)} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => <GroupCard group={item} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: Group }) {
  const router = useRouter();
  const activeVotes = group.votes.filter(
    (v) => v.status === "active" && Date.now() < v.deadline
  );
  const hasActiveVote = activeVotes.length > 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/group/${group.id}` as any)}
      activeOpacity={0.85}
    >
      {/* Left: emoji */}
      <View style={styles.cardEmoji}>
        <Text style={styles.emojiText}>{group.emoji}</Text>
      </View>

      {/* Middle: info */}
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName}>{group.name}</Text>
          {hasActiveVote && (
            <View style={styles.voteBadge}>
              <Ionicons name="bar-chart" size={10} color="#818cf8" />
              <Text style={styles.voteBadgeText}>Vote active</Text>
            </View>
          )}
        </View>
        <View style={styles.membersRow}>
          <MemberAvatarStack members={group.members} max={4} />
          <Text style={styles.memberCount}>{group.members.length} members</Text>
        </View>
        {group.description ? (
          <Text style={styles.cardDesc} numberOfLines={1}>{group.description}</Text>
        ) : null}
        <Text style={styles.cardMeta}>
          {group.savedSpots.length} saved spot{group.savedSpots.length !== 1 ? "s" : ""}
          {" · "}
          {group.votes.length} vote{group.votes.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color="#334155" />
    </TouchableOpacity>
  );
}

// ─── MemberAvatarStack ────────────────────────────────────────────────────────

export function MemberAvatarStack({
  members,
  max = 4,
  size = 24,
}: {
  members: { initials: string; color: string }[];
  max?: number;
  size?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - max;

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((m, i) => (
        <View
          key={i}
          style={[
            styles.avatar,
            {
              backgroundColor: m.color,
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: i === 0 ? 0 : -(size * 0.35),
              zIndex: shown.length - i,
            },
          ]}
        >
          <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{m.initials[0]}</Text>
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.avatar,
            styles.avatarExtra,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -(size * 0.35),
            },
          ]}
        >
          <Text style={[styles.avatarText, { fontSize: size * 0.36, color: "#64748b" }]}>
            +{extra}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── EmptyGroups ──────────────────────────────────────────────────────────────

function EmptyGroups({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🏕️</Text>
      <Text style={styles.emptyTitle}>No groups yet</Text>
      <Text style={styles.emptyBody}>
        Create a group with your adventure crew, share spots from Discover, and vote on where
        to go next.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onCreate} activeOpacity={0.8}>
        <Ionicons name="add-circle" size={18} color="#fff" />
        <Text style={styles.emptyBtnText}>Create your first group</Text>
      </TouchableOpacity>

      <View style={styles.featureList}>
        {[
          { icon: "paper-plane-outline" as const, text: "Share spots from Discover" },
          { icon: "bar-chart-outline" as const,   text: "Vote on where to go" },
          { icon: "shuffle-outline" as const,      text: "Spin the wheel to decide" },
          { icon: "images-outline" as const,       text: "Build a shared scrapbook" },
        ].map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <Ionicons name={f.icon} size={15} color="#6366f1" />
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#f1f5f9", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  headerBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#4338ca44",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinBtnText: { fontSize: 14, fontWeight: "700", color: "#818cf8" },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#6366f1",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // Cards
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1e293b",
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardEmoji: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 28 },
  cardInfo: { flex: 1, gap: 4 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardName: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  voteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#4338ca44",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  voteBadgeText: { fontSize: 10, color: "#818cf8", fontWeight: "600" },
  membersRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  memberCount: { fontSize: 12, color: "#64748b" },
  cardDesc: { fontSize: 12, color: "#475569" },
  cardMeta: { fontSize: 11, color: "#334155", fontWeight: "500", marginTop: 2 },

  // Avatar stack
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1e293b",
  },
  avatarExtra: { backgroundColor: "#1e293b" },
  avatarText: { fontWeight: "700", color: "#fff" },

  // Empty state
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  emptyEmoji: { fontSize: 60, marginBottom: 4 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#f1f5f9", textAlign: "center" },
  emptyBody: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 22 },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6366f1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 4,
  },
  emptyBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  featureList: { gap: 10, alignSelf: "stretch", marginTop: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontSize: 14, color: "#94a3b8" },
});
