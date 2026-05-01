import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { GroupsProvider } from "../src/context/GroupsContext";
import { LocationProvider } from "../src/context/LocationContext";
import { SettingsProvider } from "../src/context/SettingsContext";

// Redirects unauthenticated users to /login and authenticated users away from it.
// Must be a child of AuthProvider so it can read auth state.
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

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

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
