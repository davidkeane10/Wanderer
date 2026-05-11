import { Redirect } from "expo-router";
import { View } from "react-native";
import { useAuth } from "../../src/context/AuthContext";

export default function Index() {
  const { isLoading } = useAuth();
  // Hold off on redirecting until auth has resolved. Firing <Redirect>
  // unconditionally races against AuthGate for unauthenticated users,
  // causing competing navigations and a white-screen window.
  if (isLoading) return <View style={{ flex: 1, backgroundColor: "#0f172a" }} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Redirect href={"/(tabs)/discover" as any} />;
}
