import { Redirect } from "expo-router";

export default function Index() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Redirect href={"/(tabs)/discover" as any} />;
}
