import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

const EMOJI_OPTIONS = [
  "🏕️","⛺️","🥾","🏔️","🌊","🧗","🏚️","🗺️","🌲","🏞️",
  "🎯","🚵","🛶","⛷️","🤿","🪂","🎪","🌋","🦅","🌄",
];

export default function CreateGroupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createGroup } = useGroups();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏕️");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const canCreate = name.trim().length >= 2;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const group = await createGroup({ name, emoji, description });
      router.replace(`/group/${group.id}` as any);
    } catch {
      setCreating(false);
    }
  };

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
          <Text style={styles.headerTitle}>New Group</Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canCreate || creating}
            style={[styles.doneBtn, (!canCreate || creating) && styles.doneBtnDisabled]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.doneBtnText, !canCreate && styles.doneBtnTextDisabled]}>
                Create
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Emoji preview + name */}
        <View style={styles.previewRow}>
          <View style={styles.emojiPreview}>
            <Text style={styles.emojiPreviewText}>{emoji}</Text>
          </View>
          <TextInput
            style={styles.nameInput}
            placeholder="Group name…"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            maxLength={30}
            autoFocus
            returnKeyType="done"
          />
        </View>

        {/* Emoji picker */}
        <Label>Choose an emoji</Label>
        <View style={styles.emojiGrid}>
          {EMOJI_OPTIONS.map((e) => (
            <TouchableOpacity
              key={e}
              style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
              onPress={() => setEmoji(e)}
            >
              <Text style={styles.emojiBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <Label>Description (optional)</Label>
        <TextInput
          style={styles.descInput}
          placeholder="What's this group about?"
          placeholderTextColor="#475569"
          value={description}
          onChangeText={setDescription}
          maxLength={120}
          multiline
          numberOfLines={2}
        />

        {/* Invite hint */}
        <View style={styles.inviteHint}>
          <Ionicons name="information-circle-outline" size={16} color="#6366f1" />
          <Text style={styles.inviteHintText}>
            After creating, you'll get a join code to share with your crew via SMS.
          </Text>
        </View>

        {/* Create button */}
        {canCreate && (
          <TouchableOpacity
            style={[styles.createBtn, creating && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={creating}
            activeOpacity={0.85}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>
                Create "{name}" {emoji}
              </Text>
            )}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cancelText: { fontSize: 15, color: "#64748b" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },
  doneBtn: {
    backgroundColor: "#6366f1",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    minWidth: 64,
    alignItems: "center",
  },
  doneBtnDisabled: { backgroundColor: "#1e293b" },
  doneBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  doneBtnTextDisabled: { color: "#334155" },

  content: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },

  previewRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  emojiPreview: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#334155",
  },
  emojiPreviewText: { fontSize: 34 },
  nameInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#f1f5f9",
    borderBottomWidth: 2,
    borderBottomColor: "#6366f1",
    paddingBottom: 6,
  },

  label: { fontSize: 12, fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },

  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  emojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  emojiBtnActive: { borderColor: "#6366f1", backgroundColor: "#1e1b4b" },
  emojiBtnText: { fontSize: 24 },

  descInput: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#334155",
    minHeight: 72,
    textAlignVertical: "top",
  },

  inviteHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#1e1b4b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#4338ca44",
  },
  inviteHintText: { flex: 1, fontSize: 13, color: "#818cf8", lineHeight: 18 },

  createBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
