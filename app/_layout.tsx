import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { GroupsProvider } from "../src/context/GroupsContext";
import { LocationProvider } from "../src/context/LocationContext";
import { SettingsProvider } from "../src/context/SettingsContext";

/**
 * Handles auth-based routing.
 * The Stack always renders so the navigator exists when router.replace fires.
 * A non-interactive overlay covers the screen during the brief auth check.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inLogin = (segments as string[])[0] === "login";
    if (!currentUser && !inLogin) {
      router.replace("/login" as any);
    } else if (currentUser && inLogin) {
      router.replace("/(tabs)/discover" as any);
    }
  }, [currentUser, isLoading, segments]);

  return (
    <View style={styles.fill}>
      {children}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#6366f1" size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
