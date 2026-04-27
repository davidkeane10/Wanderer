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
import type { Vote } from "../../src/types/social";

export default function VoteTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeVotes, groups, you } = useGroups();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Vote</Text>
          <Text style={styles.subtitle}>Pick your next adventure</Text>
        </View>
        {activeVotes.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeVotes.length}</Text>
          </View>
        )}
      </View>

      {activeVotes.length === 0 ? (
        <EmptyVotes onGoToGroups={() => router.push("/(tabs)/groups" as any)} />
      ) : (
        <FlatList
          data={activeVotes}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => (
            <ActiveVoteCard
              vote={item}
              groupName={item.group.name}
              groupEmoji={item.group.emoji}
              yourVote={item.responses.find((r) => r.memberId === you?.id)?.optionId ?? null}
              onPress={() => router.push(`/vote/${item.id}` as any)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            groups.some((g) => g.votes.filter((v) => v.status === "closed").length > 0) ? (
              <Text style={styles.sectionLabel}>Active</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ─── ActiveVoteCard ───────────────────────────────────────────────────────────

function ActiveVoteCard({
  vote,
  groupName,
  groupEmoji,
  yourVote,
  onPress,
}: {
  vote: Vote;
  groupName: string;
  groupEmoji: string;
  yourVote: string | null;
  onPress: () => void;
}) {
  const timeLeft = vote.deadline - Date.now();
  const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));
  const minutesLeft = Math.max(0, Math.floor((timeLeft % 3600000) / 60000));
  const timeLabel = hoursLeft > 0 ? `${hoursLeft}h left` : `${minutesLeft}m left`;
  const waiting = vote.options.length + 1 - vote.responses.length;

  // Leading option
  const optionVotes = vote.options.map((o) => ({
    option: o,
    count: vote.responses.filter((r) => r.optionId === o.id).length,
  }));
  const leading = optionVotes.sort((a, b) => b.count - a.count)[0];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Group tag */}
      <View style={styles.groupTag}>
        <Text style={styles.groupTagEmoji}>{groupEmoji}</Text>
        <Text style={styles.groupTagName}>{groupName}</Text>
        <View style={styles.timeChip}>
          <Ionicons name="time-outline" size={10} color="#818cf8" />
          <Text style={styles.timeChipText}>{timeLabel}</Text>
        </View>
      </View>

      {/* Question */}
      <Text style={styles.question}>{vote.question}</Text>

      {/* Mini bar chart — top 3 options */}
      <View style={styles.miniChart}>
        {vote.options.slice(0, 3).map((o) => {
          const count = vote.responses.filter((r) => r.optionId === o.id).length;
          const total = Math.max(vote.responses.length, 1);
          const pct = Math.round((count / total) * 100);
          const isYours = o.id === yourVote;
          const isLeading = leading?.option.id === o.id && count > 0;
          return (
            <View key={o.id} style={styles.miniBarRow}>
              <Text style={styles.miniBarEmoji}>{o.emoji}</Text>
              <View style={styles.miniBarTrack}>
                <View
                  style={[
                    styles.miniBarFill,
                    { width: `${pct}%` as any },
                    isLeading && styles.miniBarFillLeading,
                    isYours && styles.miniBarFillYours,
                  ]}
                />
              </View>
              <Text style={styles.miniBarLabel} numberOfLines={1}>{o.label}</Text>
              {isYours && <Ionicons name="checkmark-circle" size={12} color="#6366f1" />}
            </View>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        {yourVote ? (
          <View style={styles.voted}>
            <Ionicons name="checkmark-circle" size={13} color="#6366f1" />
            <Text style={styles.votedText}>You voted</Text>
          </View>
        ) : (
          <View style={styles.waitingChip}>
            <Ionicons name="hand-left-outline" size={12} color="#f59e0b" />
            <Text style={styles.waitingText}>Your vote needed</Text>
          </View>
        )}
        {waiting > 0 && (
          <Text style={styles.waitingCount}>Waiting on {waiting} more</Text>
        )}
        <Ionicons name="chevron-forward" size={14} color="#334155" style={{ marginLeft: "auto" }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── EmptyVotes ───────────────────────────────────────────────────────────────

function EmptyVotes({ onGoToGroups }: { onGoToGroups: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🗳️</Text>
      <Text style={styles.emptyTitle}>No active votes</Text>
      <Text style={styles.emptyBody}>
        Go to a group and tap "Start Vote" to pick your next adventure together.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onGoToGroups} activeOpacity={0.8}>
        <Ionicons name="people-outline" size={16} color="#fff" />
        <Text style={styles.emptyBtnText}>Go to Groups</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  title: { fontSize: 26, fontWeight: "800", color: "#f1f5f9", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: "#64748b", marginTop: 2 },
  badge: {
    marginLeft: 10,
    backgroundColor: "#6366f1",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },

  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 12,
  },
  groupTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupTagEmoji: { fontSize: 14 },
  groupTagName: { fontSize: 12, fontWeight: "600", color: "#64748b", flex: 1 },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1e1b4b",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timeChipText: { fontSize: 10, color: "#818cf8", fontWeight: "600" },

  question: { fontSize: 17, fontWeight: "700", color: "#f1f5f9", lineHeight: 24 },

  miniChart: { gap: 6 },
  miniBarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  miniBarEmoji: { fontSize: 14, width: 20, textAlign: "center" },
  miniBarTrack: {
    width: 80,
    height: 6,
    backgroundColor: "#0f172a",
    borderRadius: 3,
    overflow: "hidden",
  },
  miniBarFill: { height: 6, backgroundColor: "#334155", borderRadius: 3 },
  miniBarFillLeading: { backgroundColor: "#6366f1" },
  miniBarFillYours: { backgroundColor: "#22c55e" },
  miniBarLabel: { flex: 1, fontSize: 12, color: "#94a3b8" },

  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#334155" },
  voted: { flexDirection: "row", alignItems: "center", gap: 4 },
  votedText: { fontSize: 12, color: "#6366f1", fontWeight: "600" },
  waitingChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  waitingText: { fontSize: 12, color: "#f59e0b", fontWeight: "600" },
  waitingCount: { fontSize: 12, color: "#475569" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
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
});
