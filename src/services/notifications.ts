/**
 * Push notification helpers using Expo's notification service.
 *
 * Flow:
 *   1. On login, registerForPushNotifications saves the device's Expo push token
 *      to the user's Firestore document.
 *   2. When a vote is created, createVote in GroupsContext fetches all other
 *      members' tokens and calls sendVoteStartedNotifications.
 *
 * Physical device only — simulators cannot receive push notifications.
 */

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { doc, updateDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { db } from "./firebase";

// Show alerts + play sound when a notification arrives while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) return; // Push tokens don't work on simulators

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("votes", {
      name: "Vote notifications",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  ).catch(() => null);

  if (!tokenData?.data) return;

  await updateDoc(doc(db, "users", userId), { pushToken: tokenData.data }).catch(() => {});
}

export async function sendVoteStartedNotifications(
  recipientTokens: string[],
  groupEmoji: string,
  groupName: string,
  question: string
): Promise<void> {
  const tokens = recipientTokens.filter(Boolean);
  if (tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    sound: "default" as const,
    title: `${groupEmoji} ${groupName} — Vote started!`,
    body: question,
    data: { type: "vote_started" },
    channelId: "votes",
  }));

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  }).catch(() => {}); // Non-fatal — notification failure never blocks the vote
}
