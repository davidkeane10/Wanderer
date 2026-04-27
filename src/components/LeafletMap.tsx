// Platform-specific implementations:
//   LeafletMap.native.tsx — uses react-native-webview (iOS / Android)
//   LeafletMap.web.tsx    — uses <iframe> (browser)
//
// Expo/Metro resolves the correct file automatically.
// This file is the shared type export so imports don't need the platform suffix.

export type { MapMarker } from "./LeafletMap.native";
export { LeafletMap } from "./LeafletMap.native";
