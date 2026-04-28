// Platform-specific implementations:
//   SpotPinMap.native.tsx — uses react-native-webview (iOS / Android)
//   SpotPinMap.web.tsx    — uses <iframe> (browser / PWA)
//
// Expo/Metro resolves the correct file automatically.

export type { SpotPinMapProps } from "./SpotPinMap.native";
export { SpotPinMap } from "./SpotPinMap.native";
