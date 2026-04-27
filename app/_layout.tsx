import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { AuthProvider } from "../src/context/AuthContext";
import { GroupsProvider } from "../src/context/GroupsContext";
import { LocationProvider } from "../src/context/LocationContext";
import { SettingsProvider } from "../src/context/SettingsContext";

export default function RootLayout() {
  return (
    <SettingsProvider>
    <LocationProvider>
      <AuthProvider>
      <GroupsProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0f172a" },
          }}
        >
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
      </GroupsProvider>
      </AuthProvider>
    </LocationProvider>
    </SettingsProvider>
  );
}
