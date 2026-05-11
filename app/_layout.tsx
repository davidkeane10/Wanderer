import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { GroupsProvider } from "../src/context/GroupsContext";
import { LocationProvider } from "../src/context/LocationContext";
import { SettingsProvider } from "../src/context/SettingsContext";

/**
 * Handles auth-based routing.
 * The Stack always renders so the navigator exists when router.replace fires.
 * The overlay stays up until auth has resolved AND the redirect (if any) has
 * been dispatched, preventing a white flash between overlay removal and
 * the new screen painting.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Stays false until the first auth resolution + routing decision is made.
  const [authSettled, setAuthSettled] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const inLogin = (segments as string[])[0] === "login";
    if (!currentUser && !inLogin) {
      router.replace("/login" as any);
    } else if (currentUser && inLogin) {
      router.replace("/(tabs)/discover" as any);
    }
    setAuthSettled(true);
  }, [currentUser, isLoading, segments]);

  return (
    <View style={styles.fill}>
      {children}
      {(!authSettled || isLoading) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#6366f1" size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // backgroundColor here ensures there is never a white frame visible during
  // navigation transitions, even if the overlay has just been removed.
  fill: { flex: 1, backgroundColor: "#0f172a" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function RootLayout() {
  return (
    <SettingsProvider>
      <LocationProvider>
        <AuthProvider>
          <GroupsProvider>
            <StatusBar style="light" />
            <AuthGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#0f172a" },
                }}
              >
                <Stack.Screen name="login" options={{ headerShown: false, animation: "fade" }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="location-picker"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen name="quest/[id]" options={{ headerShown: false }} />
                <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
                <Stack.Screen
                  name="group/create"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen
                  name="group/send"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen
                  name="group/join"
                  options={{ presentation: "modal", headerShown: false }}
                />
                <Stack.Screen name="vote/[id]" options={{ headerShown: false }} />
                <Stack.Screen
                  name="vote/create"
                  options={{ presentation: "modal", headerShown: false }}
                />
              </Stack>
            </AuthGate>
          </GroupsProvider>
        </AuthProvider>
      </LocationProvider>
    </SettingsProvider>
  );
}
