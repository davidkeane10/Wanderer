/**
 * Safe URL utilities.
 *
 * External URLs pulled from Reddit, TripAdvisor, Wikidata etc. must be
 * validated before being passed to Linking.openURL — a malformed or
 * deliberately crafted URL could otherwise use javascript: or file: schemes.
 *
 * Only https:// and http:// are allowed for external content.
 */

import { Linking } from "react-native";

const SAFE_SCHEMES = ["https:", "http:"];

/**
 * Returns true only if the URL is well-formed and uses http(s).
 */
export function isSafeUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim().length === 0) return false;
  try {
    const parsed = new URL(url);
    return SAFE_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Opens a URL only if it passes the safety check.
 * Silently ignores bad URLs in production; logs in dev.
 */
export function safeOpenUrl(url: unknown): void {
  if (!isSafeUrl(url)) {
    if (__DEV__) console.warn("[safeOpenUrl] blocked unsafe URL:", url);
    return;
  }
  Linking.openURL(url).catch((err) => {
    if (__DEV__) console.warn("[safeOpenUrl] failed to open:", url, err);
  });
}
