/**
 * AuthContext — email/password Firebase auth + user profile.
 *
 * Flow:
 *   1. onAuthStateChanged fires on launch
 *   2. If no user → currentUser stays null, routing guard sends to /login
 *   3. If user → load Firestore profile, expose it app-wide
 *
 * Exposed actions: signIn, signUp, signOut, resetPassword
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { auth, db } from "../services/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  createdAt: number;
}

interface AuthContextValue {
  currentUser: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
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

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isLoading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  updateDisplayName: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          setCurrentUser(snap.data() as UserProfile);
        } else {
          // Profile missing — build one from the Firebase Auth record
          const fallback: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "User",
            email: firebaseUser.email ?? "",
            initials: toInitials(firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "U"),
            color: pickColor(firebaseUser.uid),
            createdAt: Date.now(),
          };
          await setDoc(doc(db, "users", firebaseUser.uid), fallback).catch(() => {});
          setCurrentUser(fallback);
        }
      } catch {
        // Offline — minimal profile from auth object
        setCurrentUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName ?? "User",
          email: firebaseUser.email ?? "",
          initials: toInitials(firebaseUser.displayName ?? "U"),
          color: pickColor(firebaseUser.uid),
          createdAt: Date.now(),
        });
      }

      setIsLoading(false);
    });

    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    // Set displayName on the Firebase Auth user
    await updateProfile(cred.user, { displayName: name.trim() }).catch(() => {});

    const profile: UserProfile = {
      uid: cred.user.uid,
      name: name.trim(),
      email: email.trim(),
      initials: toInitials(name),
      color: pickColor(cred.user.uid),
      createdAt: Date.now(),
    };
    await setDoc(doc(db, "users", cred.user.uid), profile);
    setCurrentUser(profile);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    if (!auth.currentUser || !currentUser) return;
    const updated: UserProfile = {
      ...currentUser,
      name: name.trim(),
      initials: toInitials(name),
    };
    await updateProfile(auth.currentUser, { displayName: name.trim() }).catch(() => {});
    await setDoc(doc(db, "users", currentUser.uid), updated);
    setCurrentUser(updated);
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, signIn, signUp, signOut, resetPassword, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
