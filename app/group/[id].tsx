import { Ionicons } from "@expo/vector-icons";
import * as ExpoLinking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MemberAvatarStack } from "../(tabs)/groups";
import { useGroups } from "../../src/context/GroupsContext";
import type { Vote } from "../../src/types/social";

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, deleteGroup, removeSavedSpot, you } = useGroups();

  const group = groups.find((g) => g.id === id);

  if (!group) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={styles.notFound}>Group not found</Text>
      </View>
    );
  }

  const activeVotes = group.votes.filter(
    (v) => v.status === "active" && Date.now() < v.deadline
  );
  const pastVotes = group.votes.filter(
    (v) => v.status === "closed" || Date.now() >= v.deadline
  );

  const handleInvite = () => {
    const joinLink = ExpoLinking.createURL("group/join", { queryParams: { code: group.joinCode } });
    const body = `Join my SideQuests group "${group.name}"!\n\nTap to join: ${joinLink}\n\nOr open the app → Groups → Join and enter code: ${group.joinCode}`;
    const url = Platform.OS === "ios"
      ? `sms:&body=${encodeURIComponent(body)}`
      : `sms:?body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Can't open SMS", "Copy your join code: " + group.joinCode)
    );
  };

  const handleDelete = () => {
    Alert.alert("Delete Group", `Delete "${group.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteGroup(group.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{group.emoji}</Text>
          <View>
            <Text style={styles.headerTitle}>{group.name}</Text>
            <Text style={styles.headerSub}>{group.members.length} members</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.inviteBtn}
            onPress={handleInvite}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="person-add-outline" size={15} color="#818cf8" />
            <Text style={styles.inviteBtnText}>Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Members */}
        <Section title="Members">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersList}>
            {group.members.map((m) => (
              <View key={m.id} style={styles.memberChip}>
                <View style={[styles.memberAvatar, { backgroundColor: m.color }]}>
                  <Text style={styles.memberAvatarText}>{m.initials[0]}</Text>
                </View>
                <Text style={styles.memberName}>{m.id === you?.id ? "You" : m.name}</Text>
              </View>
            ))}
          </ScrollView>
        </Section>

        {/* Active Votes */}
        <Section
          title="Active Votes"
          action={
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/vote/create" as any, params: { groupId: group.id } })}
            >
              <Text style={styles.sectionAction}>+ New vote</Text>
            </TouchableOpacity>
          }
        >
          {activeVotes.length === 0 ? (
            <View style={styles.sectionEmpty}>
              <Text style={styles.sectionEmptyText}>No active votes</Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/vote/create" as any, params: { groupId: group.id } })}
              >
                <Text style={styles.sectionEmptyAction}>Start a vote →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            activeVotes.map((v) => (
              <VoteRow key={v.id} vote={v} onPress={() => router.push(`/vote/${v.id}` as any)} />
            ))
          )}
        </Section>

        {/* Saved Spots */}
        <Section
          title="Saved Spots"
          count={group.savedSpots.length}
        >
          {group.savedSpots.length === 0 ? (
            <View style={styles.sectionEmpty}>
              <Text style={styles.sectionEmptyText}>No saved spots yet</Text>
              <Text style={styles.sectionEmptyHint}>
                Tap the 📤 button on any Discover card to send a spot here
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotsRow}>
              {group.savedSpots.map((spot) => (
                <TouchableOpacity
                  key={spot.id}
                  style={styles.spotCard}
                  onLongPress={() =>
                    Alert.alert("Remove Spot", `Remove "${spot.feedItem.title}"?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => removeSavedSpot(group.id, spot.id) },
                    ])
                  }
                >
                  <Text style={styles.spotEmoji}>
                    {spot.feedItem.source === "trails" ? "🥾" :
                     spot.feedItem.activityType === "urbex" ? "🏚️" :
                     spot.feedItem.activityType === "adventure" ? "🧗" : "📍"}
                  </Text>
                  <Text style={styles.spotTitle} numberOfLines={2}>{spot.feedItem.title}</Text>
                  <Text style={styles.spotSource}>{spot.feedItem.sourceName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Section>

        {/* Past Votes */}
        {pastVotes.length > 0 && (
          <Section title="Past Votes">
            {pastVotes.map((v) => (
              <VoteRow key={v.id} vote={v} onPress={() => router.push(`/vote/${v.id}` as any)} past />
            ))}
          </Section>
        )}
      </ScrollView>

      {/* FAB: Start vote */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => router.push({ pathname: "/vote/create" as any, params: { groupId: group.id } })}
        activeOpacity={0.85}
      >
        <Ionicons name="bar-chart" size={18} color="#fff" />
        <Text style={styles.fabText}>Start Vote</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── VoteRow ──────────────────────────────────────────────────────────────────

function VoteRow({ vote, onPress, past }: { vote: Vote; onPress: () => void; past?: boolean }) {
  const timeLeft = vote.deadline - Date.now();
  const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));
  const minutesLeft = Math.max(0, Math.floor((timeLeft % 3600000) / 60000));

  const timeLabel = past
    ? (vote.winnerId ? "Decided" : "Expired")
    : hoursLeft > 0
    ? `${hoursLeft}h left`
    : `${minutesLeft}m left`;

  const winner = past && vote.winnerId
    ? vote.options.find((o) => o.id === vote.winnerId)
    : null;

  return (
    <TouchableOpacity style={styles.voteRow} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.voteRowLeft}>
        <Text style={styles.voteQuestion} numberOfLines={2}>{vote.question}</Text>
        <View style={styles.voteRowMeta}>
          <View style={[styles.voteStatus, past && styles.voteStatusPast]}>
            <Ionicons
              name={past ? "checkmark-circle" : "time-outline"}
              size={10}
              color={past ? "#34e0a1" : "#818cf8"}
            />
            <Text style={[styles.voteStatusText, past && styles.voteStatusTextPast]}>{timeLabel}</Text>
          </View>
          <Text style={styles.voteResponseCount}>
            {vote.responses.length}/{vote.options.length + 1} voted
          </Text>
        </View>
        {winner && (
          <Text style={styles.voteWinner}>Winner: {winner.emoji} {winner.label}</Text>
        )}
      </View>
      <View style={styles.voteRowAvatars}>
        <MemberAvatarStack
          members={vote.responses.map(() => ({ initials: "?", color: "#334155" }))}
          max={3}
          size={20}
        />
        <Ionicons name="chevron-forward" size={14} color="#334155" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
  action,
  count,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  count?: number;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count !== undefined && count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
        {action}
      </View>
      {children}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  backBtn: { padding: 4 },
  notFound: { textAlign: "center", color: "#64748b", marginTop: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    gap: 12,
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  headerEmoji: { fontSize: 36 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#f1f5f9" },
  headerSub: { fontSize: 12, color: "#64748b", marginTop: 1 },

  section: { paddingTop: 20, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionAction: { fontSize: 13, color: "#6366f1", fontWeight: "600", marginLeft: "auto" },
  sectionEmpty: { paddingVertical: 16, gap: 6 },
  sectionEmptyText: { fontSize: 14, color: "#475569" },
  sectionEmptyAction: { fontSize: 13, color: "#6366f1", fontWeight: "600" },
  sectionEmptyHint: { fontSize: 12, color: "#334155", lineHeight: 18 },
  countBadge: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: { fontSize: 11, color: "#64748b", fontWeight: "600" },

  membersList: { gap: 12, paddingBottom: 4 },
  memberChip: { alignItems: "center", gap: 5 },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  memberName: { fontSize: 11, color: "#64748b", fontWeight: "500" },

  spotsRow: { gap: 12, paddingBottom: 4 },
  spotCard: {
    width: 120,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  spotEmoji: { fontSize: 24 },
  spotTitle: { fontSize: 12, fontWeight: "600", color: "#f1f5f9", lineHeight: 16 },
  spotSource: { fontSize: 10, color: "#475569" },

  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 12,
  },
  voteRowLeft: { flex: 1, gap: 6 },
  voteQuestion: { fontSize: 14, fontWeight: "600", color: "#f1f5f9", lineHeight: 20 },
  voteRowMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  voteStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1e1b4b",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  voteStatusPast: { backgroundColor: "#064e3b" },
  voteStatusText: { fontSize: 10, color: "#818cf8", fontWeight: "600" },
  voteStatusTextPast: { color: "#34e0a1" },
  voteResponseCount: { fontSize: 11, color: "#475569" },
  voteWinner: { fontSize: 12, color: "#34e0a1", fontWeight: "600" },
  voteRowAvatars: { alignItems: "center", gap: 6 },

  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#4338ca44",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  inviteBtnText: { fontSize: 13, fontWeight: "600", color: "#818cf8" },

  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6366f1",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
