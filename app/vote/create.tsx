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
import type { FeedItem } from "../../src/types/feed";
import type { VoteOption } from "../../src/types/social";

const DEADLINE_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "1 week",   hours: 168 },
];

const OPTION_EMOJIS = ["🥾","🏚️","🧗","🌊","🏔️","🗺️","🌲","🎯","🚵","🌄","📍","⛺️"];

interface DraftOption {
  emoji: string;
  label: string;
  feedItem?: FeedItem;
  meta?: string;
}

export default function CreateVoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createVote, groups } = useGroups();
  const params = useLocalSearchParams<{ groupId: string; prefillItemData?: string }>();

  const group = groups.find((g) => g.id === params.groupId);

  // Pre-fill from "Send to group" flow
  const prefillItem: FeedItem | null = (() => {
    try { return params.prefillItemData ? JSON.parse(params.prefillItemData) : null; }
    catch { return null; }
  })();

  const initialOptions: DraftOption[] = prefillItem
    ? [
        {
          emoji: prefillItem.source === "trails" ? "🥾" :
                 prefillItem.activityType === "urbex" ? "🏚️" :
                 prefillItem.activityType === "adventure" ? "🧗" : "📍",
          label: prefillItem.title.slice(0, 60),
          feedItem: prefillItem,
          meta: prefillItem.sourceName,
        },
        { emoji: "📍", label: "" },
      ]
    : [
        { emoji: "🥾", label: "" },
        { emoji: "🏚️", label: "" },
      ];

  const [question, setQuestion] = useState(
    prefillItem ? `Are we doing "${prefillItem.title.slice(0, 40)}"?` : ""
  );
  const [options, setOptions] = useState<DraftOption[]>(initialOptions);
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [editingEmoji, setEditingEmoji] = useState<number | null>(null);

  const canCreate =
    question.trim().length >= 4 &&
    options.filter((o) => o.label.trim().length >= 2).length >= 2;

  const updateOption = (idx: number, patch: Partial<DraftOption>) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const addOption = () => {
    if (options.length >= 5) return;
    setOptions((prev) => [...prev, { emoji: OPTION_EMOJIS[prev.length % OPTION_EMOJIS.length], label: "" }]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!canCreate || !params.groupId) return;
    const filledOptions: Omit<VoteOption, "id">[] = options
      .filter((o) => o.label.trim().length >= 2)
      .map((o) => ({
        emoji: o.emoji,
        label: o.label.trim(),
        feedItem: o.feedItem,
        meta: o.meta,
      }));

    const vote = await createVote(params.groupId, { question, options: filledOptions, deadlineHours });
    router.replace(`/vote/${vote.id}` as any);
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
      {/* Modal header */}
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
            disabled={!canCreate}
            style={[styles.doneBtn, !canCreate && styles.doneBtnDisabled]}
          >
            <Text style={[styles.doneBtnText, !canCreate && styles.doneBtnTextDisabled]}>
              Create
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
          autoFocus={!prefillItem}
          multiline
        />

        {/* Options */}
        <View style={styles.optionsHeader}>
          <Label>Options</Label>
          <Text style={styles.optionsCount}>{options.length}/5</Text>
        </View>

        {options.map((opt, idx) => (
          <View key={idx} style={styles.optionRow}>
            {/* Emoji picker toggle */}
            <TouchableOpacity
              style={styles.emojiBtn}
              onPress={() => setEditingEmoji(editingEmoji === idx ? null : idx)}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
            </TouchableOpacity>

            {/* Label input */}
            <TextInput
              style={[styles.optionInput, opt.feedItem && styles.optionInputPrefilled]}
              placeholder={`Option ${idx + 1}…`}
              placeholderTextColor="#334155"
              value={opt.label}
              onChangeText={(v) => updateOption(idx, { label: v })}
              maxLength={60}
              editable={!opt.feedItem}
            />

            {/* Remove (if > 2 options) */}
            {options.length > 2 && !opt.feedItem && (
              <TouchableOpacity onPress={() => removeOption(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#334155" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Emoji picker grid (shown for editingEmoji index) */}
        {editingEmoji !== null && (
          <View style={styles.emojiGrid}>
            {OPTION_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiOption, options[editingEmoji]?.emoji === e && styles.emojiOptionActive]}
                onPress={() => { updateOption(editingEmoji, { emoji: e }); setEditingEmoji(null); }}
              >
                <Text style={styles.emojiOptionText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Add option */}
        {options.length < 5 && (
          <TouchableOpacity style={styles.addOptionBtn} onPress={addOption}>
            <Ionicons name="add" size={16} color="#6366f1" />
            <Text style={styles.addOptionText}>Add another option</Text>
          </TouchableOpacity>
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

        {/* Create */}
        {canCreate && (
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate} activeOpacity={0.85}>
            <Ionicons name="bar-chart" size={16} color="#fff" />
            <Text style={styles.createBtnText}>Start Vote</Text>
          </TouchableOpacity>
        )}
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
    width: 36, height: 4,
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
  label: { fontSize: 12, fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },

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

  optionsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionsCount: { fontSize: 12, color: "#475569" },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  emojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  optionEmoji: { fontSize: 22 },
  optionInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#f1f5f9",
    paddingVertical: 4,
  },
  optionInputPrefilled: { color: "#94a3b8" },

  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    marginTop: -4,
  },
  emojiOption: {
    width: 44, height: 44,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiOptionActive: { backgroundColor: "#1e1b4b", borderWidth: 1, borderColor: "#6366f1" },
  emojiOptionText: { fontSize: 24 },

  addOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addOptionText: { fontSize: 14, color: "#6366f1", fontWeight: "600" },

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
  createBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
