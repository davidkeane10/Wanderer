/**
 * Thin AsyncStorage wrapper for persisting feed items between app sessions.
 * Each cache key maps to an array of FeedItems + a timestamp.
 * Stale entries (older than MAX_AGE_MS) are returned but trigger a background refresh.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FeedItem } from "../types/feed";

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  items: FeedItem[];
  savedAt: number;
}

export async function readCache(key: string): Promise<FeedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const entry: CacheEntry = JSON.parse(raw);
    return entry.items ?? [];
  } catch {
    return [];
  }
}

export async function writeCache(key: string, items: FeedItem[]): Promise<void> {
  try {
    const entry: CacheEntry = { items: items.slice(0, 100), savedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // storage failure is non-fatal
  }
}

export async function isCacheStale(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return true;
    const entry: CacheEntry = JSON.parse(raw);
    return Date.now() - entry.savedAt > MAX_AGE_MS;
  } catch {
    return true;
  }
}

// ── Generic JSON cache ─────────────────────────────────────────────────────
// Used for search results (AI descriptions included) which have a longer TTL.

interface JsonCacheEntry<T> {
  data: T;
  savedAt: number;
}

/**
 * Read a cached value. Returns null if missing or older than ttlMs.
 */
export async function readJsonCache<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: JsonCacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.savedAt > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Write a value to the cache with the current timestamp.
 */
export async function writeJsonCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: JsonCacheEntry<T> = { data, savedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // storage failure is non-fatal
  }
}
