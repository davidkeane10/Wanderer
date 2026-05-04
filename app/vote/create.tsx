import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
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
import { useGroups } from "../../src/context/GroupsContext";
import type { VoteOption } from "../../src/types/social";

const DEADLINE_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "1 week", hours: 168 },
];

function spotEmoji(activityType?: string | null, source?: string | null): string {
  if (source === "trails") return "🥾";
  if (activityType === "urbex") return "🏚️";
  if (activityType === "hiking") return "🥾";
  if (activityType === "town") return "🏙️";
  return "📍";
}

export default function CreateVoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createVote, groups } = useGroups();
  const params = useLocalSearchParams<{ groupId: string }>();

  const group = groups.find((g) => g.id === params.groupId);
  const spots = group?.savedSpots ?? [];

  const [question, setQuestion] = useState("Where are we going?");
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [creating, setCreating] = useState(false);

  const canCreate = question.trim().length >= 4 && spots.length >= 2;

  const handleCreate = async () => {
    if (!canCreate || !params.groupId || creating) return;
    setCreating(true);
    try {
      const options: Omit<VoteOption, "id">[] = spots.map((s) => ({
        emoji: spotEmoji(s.feedItem.activityType, s.feedItem.source),
        label: s.feedItem.title,
        meta: s.feedItem.sourceName ?? s.feedItem.activityType,
        feedItem: s.feedItem,
      }));
      const vote = await createVote(params.groupId, {
        question: question.trim(),
        options,
        deadlineHours,
      });
      router.replace(`/vote/${vote.id}` as any);
    } finally {
      setCreating(false);
    }
  };

  if (!group) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.error}>Group not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Modal handle + header */}
      <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerGroupEmoji}>{group.emoji}</Text>
            <Text style={styles.headerTitle}>New Vote</Text>
          </View>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || creating}
            style={[styles.doneBtn, (!canCreate || creating) && styles.doneBtnDisabled]}
          >
            <Text style={[styles.doneBtnText, (!canCreate || creating) && styles.doneBtnTextDisabled]}>
              {creating ? "…" : "Start"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Question */}
        <Label>Question</Label>
        <TextInput
          style={styles.questionInput}
          placeholder="Where are we going this weekend?"
          placeholderTextColor="#475569"
          value={question}
          onChangeText={setQuestion}
          maxLength={100}
          autoFocus
          multiline
        />

        {/* Spots that will be voted on */}
        <Label>Spots in the vote ({spots.length})</Label>

        {spots.length < 2 ? (
          <View style={styles.noSpotsCard}>
            <Ionicons name="map-outline" size={32} color="#334155" />
            <Text style={styles.noSpotsTitle}>Not enough spots</Text>
            <Text style={styles.noSpotsBody}>
              Add at least 2 spots to your group before starting a vote.
            </Text>
          </View>
        ) : (
          <View style={styles.spotsList}>
            {spots.map((s, idx) => (
              <View key={s.id} style={styles.spotRow}>
                <View style={styles.spotRankBadge}>
                  <Text style={styles.spotRankText}>{idx + 1}</Text>
                </View>
                <Text style={styles.spotEmoji}>
                  {spotEmoji(s.feedItem.activityType, s.feedItem.source)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.spotLabel} numberOfLines={1}>{s.feedItem.title}</Text>
                  {s.feedItem.sourceName ? (
                    <Text style={styles.spotMeta}>{s.feedItem.sourceName}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Deadline */}
        <Label>Close voting after</Label>
        <View style={styles.deadlineRow}>
          {DEADLINE_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d.hours}
              style={[styles.deadlineBtn, deadlineHours === d.hours && styles.deadlineBtnActive]}
              onPress={() => setDeadlineHours(d.hours)}
            >
              <Text style={[styles.deadlineBtnText, deadlineHours === d.hours && styles.deadlineBtnTextActive]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={[styles.createBtn, (!canCreate || creating) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!canCreate || creating}
          activeOpacity={0.85}
        >
          <Ionicons name="notifications" size={16} color="#fff" />
          <Text style={styles.createBtnText}>
            {creating ? "Starting…" : "Start Vote & Notify Group"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  error: { textAlign: "center", color: "#64748b", marginTop: 40 },

  modalHeader: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerGroupEmoji: { fontSize: 18 },
  cancelText: { fontSize: 15, color: "#64748b" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },
  doneBtn: { backgroundColor: "#6366f1", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 },
  doneBtnDisabled: { backgroundColor: "#1e293b" },
  doneBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  doneBtnTextDisabled: { color: "#334155" },

  content: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  questionInput: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 16,
    fontSize: 17,
    fontWeight: "600",
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#334155",
    minHeight: 72,
    textAlignVertical: "top",
  },

  noSpotsCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  noSpotsTitle: { fontSize: 15, fontWeight: "700", color: "#64748b" },
  noSpotsBody: { fontSize: 13, color: "#475569", textAlign: "center", lineHeight: 18 },

  spotsList: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    overflow: "hidden",
  },
  spotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  spotRankBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  spotRankText: { fontSize: 11, fontWeight: "800", color: "#94a3b8" },
  spotEmoji: { fontSize: 20 },
  spotLabel: { fontSize: 14, fontWeight: "600", color: "#f1f5f9" },
  spotMeta: { fontSize: 11, color: "#475569", marginTop: 1 },

  deadlineRow: { flexDirection: "row", gap: 10 },
  deadlineBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
    alignItems: "center",
  },
  deadlineBtnActive: { borderColor: "#6366f1", backgroundColor: "#1e1b4b" },
  deadlineBtnText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  deadlineBtnTextActive: { color: "#818cf8" },

  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 8,
  },
  createBtnDisabled: { backgroundColor: "#312e81", opacity: 0.5 },
  createBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
