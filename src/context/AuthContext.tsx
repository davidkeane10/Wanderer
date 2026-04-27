/**
 * AuthContext — anonymous Firebase auth + user profile.
 *
 * Flow:
 *   1. Sign in anonymously on first launch (or restore existing session)
 *   2. Check Firestore for a saved profile (/users/{uid})
 *   3. If no profile yet, show a name-setup modal
 *   4. Expose `currentUser` with uid + display info throughout the app
 */

import { Ionicons } from "@expo/vector-icons";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../services/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  name: string;
  initials: string;
  color: string;
}

interface AuthContextValue {
  currentUser: UserProfile | null;
  isLoading: boolean;
}

// ─── Avatar colour palette ────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#34e0a1",
  "#fb7185", "#22c55e", "#3b82f6", "#a855f7",
];

function pickColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({ currentUser: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false);
  const pendingUid = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // Sign in anonymously — creates a persistent UID
        try {
          await signInAnonymously(auth);
        } catch (e) {
          setIsLoading(false);
        }
        return;
      }

      // Load existing profile
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          setCurrentUser(snap.data() as UserProfile);
        } else {
          // New user — ask for their name
          pendingUid.current = firebaseUser.uid;
          setShowNameModal(true);
        }
      } catch {
        // Offline or error — create a temporary local profile
        const fallback: UserProfile = {
          uid: firebaseUser.uid,
          name: "You",
          initials: "ME",
          color: pickColor(firebaseUser.uid),
        };
        setCurrentUser(fallback);
      }

      setIsLoading(false);
    });

    return unsub;
  }, []);

  const handleNameSubmit = useCallback(async (name: string) => {
    const uid = pendingUid.current;
    if (!uid || !name.trim()) return;

    const profile: UserProfile = {
      uid,
      name: name.trim(),
      initials: toInitials(name),
      color: pickColor(uid),
    };

    try {
      await setDoc(doc(db, "users", uid), profile);
    } catch {
      // Offline — set locally, will sync when back online
    }

    setCurrentUser(profile);
    setShowNameModal(false);
    pendingUid.current = null;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading }}>
      {children}
      <NameSetupModal visible={showNameModal} onSubmit={handleNameSubmit} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Name Setup Modal ─────────────────────────────────────────────────────────

function NameSetupModal({
  visible,
  onSubmit,
}: {
  visible: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const canSubmit = name.trim().length >= 2;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.modalBg}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalIcon}>
            <Ionicons name="person-circle-outline" size={48} color="#6366f1" />
          </View>
          <Text style={styles.modalTitle}>What's your name?</Text>
          <Text style={styles.modalSubtitle}>
            This is how your friends will see you in groups.
          </Text>
          <TextInput
            style={styles.nameInput}
            placeholder="Your name…"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => canSubmit && onSubmit(name)}
          />
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={() => onSubmit(name)}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            <Text style={styles.submitBtnText}>Let's go</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalIcon: { marginBottom: 4 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#f1f5f9" },
  modalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
  nameInput: {
    width: "100%",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 14,
    fontSize: 17,
    fontWeight: "600",
    color: "#f1f5f9",
    borderWidth: 2,
    borderColor: "#6366f1",
    marginTop: 8,
  },
  submitBtn: {
    width: "100%",
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: { backgroundColor: "#334155" },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
