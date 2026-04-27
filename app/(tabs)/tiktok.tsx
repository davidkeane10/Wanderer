import React from "react";
import { Text, View } from "react-native";

// TikTok integration has been removed. This tab is hidden (href: null in layout).
export default function TikTokTab() {
  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#475569" }}>Not available</Text>
    </View>
  );
}
