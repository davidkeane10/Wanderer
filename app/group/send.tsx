/**
 * "Send to Group" modal — shown when user taps the paper-plane button on a QuestCard.
 * Receives itemData as a JSON-encoded FeedItem in route params.
 * User picks a group → spot is saved to that group.
 */

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MemberAvatarStack } from "../(tabs)/groups";
import { useGroups } from "../../src/context/GroupsContext";
import type { FeedItem } from "../../src/types/feed";
import type { Group } from "../../src/types/social";

export default function SendToGroupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, addSavedSpot } = useGroups();
  const params = useLocalSearchParams<{ itemData: string }>();
  const [sent, setSent] = useState<Set<string>>(new Set());

  let feedItem: FeedItem | null = null;
  try {
    feedItem = JSON.parse(params.itemData ?? "null");
  } catch {
    feedItem = null;
  }

  if (!feedItem) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.error}>Could not load spot data.</Text>
      </View>
    );
  }

  const handleSave = async (group: Group) => {
    const result = await addSavedSpot(group.id, feedItem!);
    if (result === "already_saved") {
      Alert.alert("Already saved", `This spot is already saved to "${group.name}".`);
    } else {
      setSent((prev) => new Set(prev).add(group.id));
    }
  };

  const handleStartVote = (group: Group) => {
    // Save the spot first, then navigate to create vote with this item pre-filled
    addSavedSpot(group.id, feedItem!);
    router.replace({
      pathname: "/vote/create" as any,
      params: {
        groupId: group.id,
        prefillItemData: params.itemData,
      },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send to Group</Text>
          <View style={{ width: 22 }} />
        </View>
      </View>

      {/* Spot preview */}
      <View style={styles.spotPreview}>
        <Text style={styles.spotEmoji}>
          {feedItem.source === "trails" ? "🥾" :
           feedItem.activityType === "urbex" ? "🏚️" :
           feedItem.activityType === "adventure" ? "🧗" : "📍"}
        </Text>
        <View style={styles.spotInfo}>
          <Text style={styles.spotTitle} numberOfLines={2}>{feedItem.title}</Text>
          <Text style={styles.spotSource}>{feedItem.sourceName}</Text>
        </View>
      </View>

      {groups.length === 0 ? (
        <View style={styles.noGroups}>
          <Text style={styles.noGroupsText}>You don't have any groups yet.</Text>
          <TouchableOpacity
            style={styles.createGroupBtn}
            onPress={() => router.replace("/group/create" as any)}
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={styles.createGroupBtnText}>Create a group first</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 10 }}
          renderItem={({ item: group }) => {
            const wasSent = sent.has(group.id);
            return (
              <View style={styles.groupCard}>
                {/* Group info */}
                <View style={styles.groupInfo}>
                  <Text style={styles.groupEmoji}>{group.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <MemberAvatarStack members={group.members} max={3} size={18} />
                  </View>
                </View>

                {/* Actions */}
                {wasSent ? (
                  <View style={styles.savedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                    <Text style={styles.savedText}>Saved</Text>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={() => handleSave(group)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="bookmark-outline" size={14} color="#6366f1" />
                      <Text style={styles.saveBtnText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.voteBtn}
                      onPress={() => handleStartVote(group)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="bar-chart-outline" size={14} color="#fff" />
                      <Text style={styles.voteBtnText}>Start Vote</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListHeaderComponent={
            <Text style={styles.listLabel}>Choose a group:</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  error: { textAlign: "center", color: "#64748b", marginTop: 40 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },

  spotPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 16,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  spotEmoji: { fontSize: 28 },
  spotInfo: { flex: 1 },
  spotTitle: { fontSize: 14, fontWeight: "600", color: "#f1f5f9", lineHeight: 20 },
  spotSource: { fontSize: 11, color: "#64748b", marginTop: 2 },

  listLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  groupCard: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 12,
  },
  groupInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupEmoji: { fontSize: 26 },
  groupName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9", marginBottom: 4 },

  actions: { flexDirection: "row", gap: 10 },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#6366f1",
    borderRadius: 10,
    paddingVertical: 10,
  },
  saveBtnText: { fontSize: 13, fontWeight: "600", color: "#6366f1" },
  voteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#6366f1",
    borderRadius: 10,
    paddingVertical: 10,
  },
  voteBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#14532d33",
    borderWidth: 1,
    borderColor: "#22c55e44",
  },
  savedText: { fontSize: 13, fontWeight: "600", color: "#22c55e" },

  noGroups: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  noGroupsText: { fontSize: 15, color: "#64748b", textAlign: "center" },
  createGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6366f1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  createGroupBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
