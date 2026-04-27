/**
 * Join a group by entering a 6-character code.
 * The code is shared by the group creator via SMS.
 */

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGroups } from "../../src/context/GroupsContext";

export default function JoinGroupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { joinGroup } = useGroups();
  const params = useLocalSearchParams<{ code?: string }>();

  const [code, setCode] = useState(
    params.code?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) ?? ""
  );
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-join when the screen is opened via a deep link with a complete code
  useEffect(() => {
    if (params.code?.length === 6) handleJoin();
  }, []);

  const canJoin = code.trim().length === 6;

  const handleJoin = async () => {
    if (!canJoin || joining) return;
    setJoining(true);
    setError(null);

    try {
      const group = await joinGroup(code.trim());
      if (!group) {
        setError("Code not found. Check the code and try again.");
        setJoining(false);
        return;
      }
      router.replace(`/group/${group.id}` as any);
    } catch {
      setError("Something went wrong. Please try again.");
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Join a Group</Text>
          <View style={{ width: 56 }} />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="people-circle-outline" size={64} color="#6366f1" />
        </View>

        <Text style={styles.title}>Enter your invite code</Text>
        <Text style={styles.subtitle}>
          Ask the group creator to share their 6-character code with you.
        </Text>

        <TextInput
          style={styles.codeInput}
          placeholder="A B C 1 2 3"
          placeholderTextColor="#334155"
          value={code}
          onChangeText={(t) => {
            setError(null);
            setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          keyboardType="default"
          returnKeyType="join"
          onSubmitEditing={handleJoin}
          autoFocus
        />

        {error && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.joinBtn, (!canJoin || joining) && styles.joinBtnDisabled]}
          onPress={handleJoin}
          disabled={!canJoin || joining}
          activeOpacity={0.85}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="enter-outline" size={18} color="#fff" />
              <Text style={styles.joinBtnText}>Join Group</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },

  header: {
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

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },

  iconWrap: { marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: "#f1f5f9", textAlign: "center" },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },

  codeInput: {
    width: "100%",
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    fontSize: 28,
    fontWeight: "800",
    color: "#f1f5f9",
    textAlign: "center",
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: "#6366f1",
    marginTop: 8,
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorText: { fontSize: 13, color: "#ef4444" },

  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 8,
    width: "100%",
    justifyContent: "center",
  },
  joinBtnDisabled: { backgroundColor: "#334155" },
  joinBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
