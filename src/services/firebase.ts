/**
 * Firebase — app init, auth, and Firestore exports.
 *
 * Uses Anonymous Auth so users never have to sign up.
 * Auth state is persisted via AsyncStorage on native, browser localStorage on web.
 */

import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

// getAuth handles persistence automatically:
//   - Web/PWA  → browser localStorage
//   - Native   → falls back gracefully (PWA is the primary target)
function buildAuth() {
  return getAuth(app);
}

export const auth = buildAuth();
export const db = getFirestore(app);
