/**
 * Firebase — app init, auth, Firestore, and Storage exports.
 *
 * Auth persistence:
 *   - Native (iOS/Android via Expo/Metro): initializeAuth with AsyncStorage so
 *     the session survives app restarts. Metro resolves firebase/auth to the
 *     react-native build which exports getReactNativePersistence.
 *   - Web: getAuth falls back to browserLocalStorage automatically.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApps, initializeApp } from "firebase/app";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — getReactNativePersistence is present in the Metro/RN build of firebase/auth
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// On native, explicitly use AsyncStorage so the session persists across restarts.
// On web, initializeAuth defaults to localStorage — same result, no extra config.
function buildAuth() {
  if (Platform.OS !== "web") {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  // Web: import getAuth lazily to avoid bundling the RN persistence module
  const { getAuth } = require("firebase/auth");
  return getAuth(app);
}

export const auth = buildAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
