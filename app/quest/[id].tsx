import { Ionicons } from "@expo/vector-icons";
import { safeOpenUrl } from "../../src/utils/safeUrl";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useGroups } from "../../src/context/GroupsContext";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPreview } from "../../src/components/MapPreview";
import { formatScore, timeAgo } from "../../src/utils/formatters";
import type { ActivityType, FeedItem, FeedSource } from "../../src/types/feed";
import { getActivityInsights, type ActivityInsights } from "../../src/services/ollama";
import { trackQuestViewed, trackQuestExternalLink } from "../../src/services/analytics";

interface ActivityInfo {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  summary: string;
  tips: string[];
}

const ACTIVITY_INFO: Record<ActivityType, ActivityInfo> = {
  trails: {
    label: "Day Hiking",
    icon: "trail-sign",
    color: "#22c55e",
    summary: "Marked trails through parks, forests, and mountains for a day out on foot.",
    tips: [
      "Wear sturdy, broken-in footwear",
      "Bring at least 0.5L of water per hour of hiking",
      "Download an offline map — cell signal is unreliable on trail",
      "Check weather and sunset time before you head out",
      "Tell someone where you're going and when you'll be back",
    ],
  },
  backpacking: {
    label: "Backpacking",
    icon: "walk",
    color: "#f97316",
    summary: "Multi-day overnight trips carrying everything you need into the backcountry.",
    tips: [
      "Many wilderness areas require a free or paid permit — check in advance",
      "Pack the 10 essentials: navigation, sun protection, insulation, light, first aid, fire, repair tools, food, water, shelter",
      "A bear canister or hang is required in many areas",
      "Water filter or purification tablets are essential — never drink untreated water",
      "Leave No Trace: pack out everything you pack in",
    ],
  },
  urbex: {
    label: "Urban Exploration",
    icon: "business",
    color: "#f59e0b",
    summary: "Exploring forgotten, abandoned, or hidden built environments — factories, asylums, tunnels, and more.",
    tips: [
      "Always go with a buddy — never explore alone",
      "Wear sturdy boots and a dust mask; floors and air quality can be hazardous",
      "Check structural safety visually before entering any floor or staircase",
      "Research the legal status first — many sites are private property",
      "Bring a powerful torch and a backup",
      "Take nothing, leave nothing, and keep locations discreet to protect sites",
    ],
  },
  adventure: {
    label: "Adventure Sports",
    icon: "rocket",
    color: "#6366f1",
    summary: "Action-packed activities like climbing, surfing, kayaking, paragliding, and more.",
    tips: [
      "Gear and skill requirements vary widely — never exceed your ability level",
      "Check local conditions (swell, wind, rock quality) before heading out",
      "Take a lesson or go with an experienced partner if you're new",
      "Helmet and appropriate PPE are non-negotiable for most disciplines",
      "File a float plan or trip plan with someone when doing water sports",
    ],
  },
  social: {
    label: "Social Activity",
    icon: "people",
    color: "#ec4899",
    summary: "Group events, meetups, club sports, and ways to connect with people nearby.",
    tips: [
      "Many clubs welcome complete beginners — don't be shy to reach out",
      "Check Meetup, Facebook Groups, and local notice boards for scheduled events",
      "Arrive a few minutes early to introductions are less awkward",
      "Bring something to share (snacks, a ball, a game) to break the ice",
    ],
  },
  food: {
    label: "Food & Drink",
    icon: "restaurant",
    color: "#ef4444",
    summary: "Restaurants, bars, cafés, food trucks, and culinary experiences worth seeking out.",
    tips: [
      "Book ahead for popular spots, especially on weekends",
      "Check opening hours — many places close Mondays or have limited lunch service",
      "Ask locals or check recent reviews — Google ratings can lag behind quality changes",
      "Food tours and markets are a great way to try multiple things in one outing",
    ],
  },
  arts: {
    label: "Arts & Culture",
    icon: "color-palette",
    color: "#8b5cf6",
    summary: "Galleries, live music, theatre, street art, and cultural events and exhibitions.",
    tips: [
      "Many galleries and museums have free entry days — check their website",
      "Street art changes frequently; follow local art accounts for the latest pieces",
      "For concerts and shows, book tickets early — popular acts sell out fast",
      "Opening nights and preview events often offer cheaper or free entry",
    ],
  },
  geocache: {
    label: "Geocaching",
    icon: "navigate",
    color: "#14b8a6",
    summary: "GPS-based treasure hunting — find hidden containers left by other players around the world.",
    tips: [
      "Download the Geocaching app (free tier covers most caches) and create an account",
      "Bring a pen to sign physical logbooks inside the cache",
      "Caches come in sizes from nano (thimble) to large (ammo can) — check the listing",
      "Practice good stealth — don't reveal a cache location to non-players (muggles)",
      "If you take a trinket from the cache, leave something of equal or greater value",
    ],
  },
};

const SOURCE_LABELS: Record<FeedSource, string> = {
  reddit: "Reddit",
  tripadvisor: "TripAdvisor",
  trails: "OpenStreetMap",
  ai: "AI Discovery",
  arcgis: "Historic Register",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
  youtube: "YouTube",
};

const SOURCE_COLORS: Record<FeedSource, string> = {
  reddit: "#ff4500",
  tripadvisor: "#34e0a1",
  trails: "#22c55e",
  ai: "#818cf8",
  arcgis: "#f59e0b",
  wikidata: "#339af0",
  wikipedia: "#94a3b8",
  youtube: "#ef4444",
};

const SOURCE_ICONS: Record<FeedSource, keyof typeof Ionicons.glyphMap> = {
  reddit: "logo-reddit",
  tripadvisor: "star",
  trails: "trail-sign",
  ai: "sparkles",
  arcgis: "business",
  wikidata: "globe-outline",
  wikipedia: "book-outline",
  youtube: "logo-youtube",
};

function ActivityInfoCard({ activityType }: { activityType: ActivityType }) {
  const [expanded, setExpanded] = useState(false);
  const info = ACTIVITY_INFO[activityType];
  if (!info) return null;

  return (
    <TouchableOpacity
      style={[styles.infoCard, { borderColor: info.color + "44" }]}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
    >
      <View style={styles.infoCardHeader}>
        <View style={styles.infoCardLeft}>
          <View style={[styles.infoIconBadge, { backgroundColor: info.color + "22" }]}>
            <Ionicons name={info.icon} size={16} color={info.color} />
          </View>
          <View>
            <Text style={[styles.infoCardLabel, { color: info.color }]}>{info.label}</Text>
            <Text style={styles.infoCardSummary} numberOfLines={expanded ? undefined : 2}>
              {info.summary}
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#475569"
        />
      </View>

      {expanded && (
        <View style={styles.infoTips}>
          <Text style={styles.infoTipsHeading}>What to know</Text>
          {info.tips.map((tip, i) => (
            <View key={i} style={styles.infoTipRow}>
              <View style={[styles.infoTipDot, { backgroundColor: info.color }]} />
              <Text style={styles.infoTipText}>{tip}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Difficulty chip ───────────────────────────────────────────────────────────

const DIFF_COLORS = { easy: "#22c55e", moderate: "#f59e0b", hard: "#ef4444" };
const DIFF_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  easy: "sunny-outline",
  moderate: "trending-up-outline",
  hard: "flame-outline",
};

function DifficultyChip({ level }: { level: "easy" | "moderate" | "hard" }) {
  const color = DIFF_COLORS[level];
  return (
    <View style={[styles.chip, { borderColor: color + "44", backgroundColor: color + "18" }]}>
      <Ionicons name={DIFF_ICONS[level]} size={13} color={color} />
      <Text style={[styles.chipText, { color }]}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
    </View>
  );
}

// ── AI Insights card ──────────────────────────────────────────────────────────

function AIInsightsCard({ insights, activityType }: { insights: ActivityInsights; activityType: ActivityType | null }) {
  const accentColor = activityType ? (
    activityType === "trails" || activityType === "backpacking" ? "#22c55e" :
    activityType === "urbex" ? "#f59e0b" :
    activityType === "adventure" ? "#6366f1" :
    activityType === "food" ? "#ef4444" :
    activityType === "arts" ? "#8b5cf6" :
    "#818cf8"
  ) : "#818cf8";

  return (
    <View style={[styles.insightsCard, { borderColor: accentColor + "33" }]}>
      {/* Card header */}
      <View style={styles.insightsHeader}>
        <View style={[styles.insightsIconBadge, { backgroundColor: accentColor + "22" }]}>
          <Ionicons name="sparkles" size={14} color={accentColor} />
        </View>
        <Text style={[styles.insightsTitle, { color: accentColor }]}>AI Insights</Text>
      </View>

      {/* Overview */}
      <Text style={styles.insightsOverview}>{insights.overview}</Text>

      {/* Chips row: difficulty + duration + distance + elevation */}
      {(insights.difficulty || insights.durationHours != null || insights.distanceKm != null || insights.elevationGainM != null || insights.trailType || insights.skillLevel) && (
        <View style={styles.chipsRow}>
          {insights.difficulty && <DifficultyChip level={insights.difficulty} />}
          {insights.skillLevel && !insights.difficulty && (
            <View style={[styles.chip, { borderColor: "#6366f144", backgroundColor: "#6366f118" }]}>
              <Ionicons name="person-outline" size={13} color="#6366f1" />
              <Text style={[styles.chipText, { color: "#6366f1" }]}>{insights.skillLevel}</Text>
            </View>
          )}
          {insights.durationHours != null && (
            <View style={[styles.chip, { borderColor: "#64748b44", backgroundColor: "#64748b18" }]}>
              <Ionicons name="time-outline" size={13} color="#94a3b8" />
              <Text style={[styles.chipText, { color: "#94a3b8" }]}>
                {insights.durationHours < 1 ? `${Math.round(insights.durationHours * 60)}min` : `${insights.durationHours}h`}
              </Text>
            </View>
          )}
          {insights.distanceKm != null && (
            <View style={[styles.chip, { borderColor: "#64748b44", backgroundColor: "#64748b18" }]}>
              <Ionicons name="resize-outline" size={13} color="#94a3b8" />
              <Text style={[styles.chipText, { color: "#94a3b8" }]}>{insights.distanceKm.toFixed(1)}km</Text>
            </View>
          )}
          {insights.elevationGainM != null && (
            <View style={[styles.chip, { borderColor: "#64748b44", backgroundColor: "#64748b18" }]}>
              <Ionicons name="trending-up-outline" size={13} color="#94a3b8" />
              <Text style={[styles.chipText, { color: "#94a3b8" }]}>{Math.round(insights.elevationGainM)}m</Text>
            </View>
          )}
          {insights.trailType && (
            <View style={[styles.chip, { borderColor: "#64748b44", backgroundColor: "#64748b18" }]}>
              <Ionicons name="git-merge-outline" size={13} color="#94a3b8" />
              <Text style={[styles.chipText, { color: "#94a3b8" }]}>{insights.trailType.replace("-", " ")}</Text>
            </View>
          )}
        </View>
      )}

      {/* Best season / time */}
      {(insights.bestSeason || insights.bestTime) && (
        <View style={styles.insightsRow}>
          <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
          <Text style={styles.insightsRowText}>{insights.bestSeason ?? insights.bestTime}</Text>
        </View>
      )}

      {/* Known for */}
      {insights.knownFor && (
        <View style={styles.insightsRow}>
          <Ionicons name="star-outline" size={14} color="#94a3b8" />
          <Text style={styles.insightsRowText}>{insights.knownFor}</Text>
        </View>
      )}

      {/* Price range + booking */}
      {(insights.priceRange || insights.bookingRequired != null) && (
        <View style={styles.chipsRow}>
          {insights.priceRange && (
            <View style={[styles.chip, { borderColor: "#64748b44", backgroundColor: "#64748b18" }]}>
              <Ionicons name="cash-outline" size={13} color="#94a3b8" />
              <Text style={[styles.chipText, { color: "#94a3b8" }]}>{insights.priceRange}</Text>
            </View>
          )}
          {insights.bookingRequired != null && (
            <View style={[styles.chip, { borderColor: insights.bookingRequired ? "#ef444444" : "#22c55e44", backgroundColor: insights.bookingRequired ? "#ef444418" : "#22c55e18" }]}>
              <Ionicons name={insights.bookingRequired ? "calendar" : "walk-outline"} size={13} color={insights.bookingRequired ? "#ef4444" : "#22c55e"} />
              <Text style={[styles.chipText, { color: insights.bookingRequired ? "#ef4444" : "#22c55e" }]}>{insights.bookingRequired ? "Booking required" : "Walk-in"}</Text>
            </View>
          )}
        </View>
      )}

      {/* History (urbex) */}
      {insights.history && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>History</Text>
          <Text style={styles.insightsSectionText}>{insights.history}</Text>
          {insights.era && <Text style={[styles.chipText, { color: "#94a3b8", marginTop: 4 }]}>{insights.era}</Text>}
        </View>
      )}

      {/* Highlights */}
      {insights.highlights && insights.highlights.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Highlights</Text>
          {insights.highlights.map((h, i) => (
            <View key={i} style={styles.insightsBulletRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={accentColor} />
              <Text style={styles.insightsBulletText}>{h}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tips */}
      {insights.tips && insights.tips.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Tips</Text>
          {insights.tips.map((t, i) => (
            <View key={i} style={styles.insightsBulletRow}>
              <Ionicons name="bulb-outline" size={14} color="#f59e0b" />
              <Text style={styles.insightsBulletText}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Safety notes */}
      {insights.safetyNotes && insights.safetyNotes.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Safety</Text>
          {insights.safetyNotes.map((s, i) => (
            <View key={i} style={styles.insightsBulletRow}>
              <Ionicons name="warning-outline" size={14} color="#ef4444" />
              <Text style={styles.insightsBulletText}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Photography tips (urbex) */}
      {insights.photographyTips && insights.photographyTips.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Photography</Text>
          {insights.photographyTips.map((p, i) => (
            <View key={i} style={styles.insightsBulletRow}>
              <Ionicons name="camera-outline" size={14} color="#818cf8" />
              <Text style={styles.insightsBulletText}>{p}</Text>
            </View>
          ))}
        </View>
      )}

      {/* What to bring */}
      {insights.whatToBring && insights.whatToBring.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>What to bring</Text>
          <View style={styles.chipsRow}>
            {insights.whatToBring.map((w, i) => (
              <View key={i} style={[styles.chip, { borderColor: "#64748b44", backgroundColor: "#64748b18" }]}>
                <Text style={[styles.chipText, { color: "#94a3b8" }]}>{w}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Gear needed (adventure) */}
      {insights.gearNeeded && insights.gearNeeded.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Gear needed</Text>
          <View style={styles.chipsRow}>
            {insights.gearNeeded.map((g, i) => (
              <View key={i} style={[styles.chip, { borderColor: "#6366f144", backgroundColor: "#6366f118" }]}>
                <Text style={[styles.chipText, { color: "#a5b4fc" }]}>{g}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Access info */}
      {(insights.accessInfo || insights.conditions) && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Access</Text>
          {insights.accessInfo && <Text style={styles.insightsSectionText}>{insights.accessInfo}</Text>}
          {insights.conditions && <Text style={[styles.insightsSectionText, { marginTop: 4 }]}>{insights.conditions}</Text>}
        </View>
      )}

      {/* Nearby attractions */}
      {insights.nearbyAttractions && insights.nearbyAttractions.length > 0 && (
        <View style={styles.insightsSection}>
          <Text style={styles.insightsSectionTitle}>Nearby</Text>
          {insights.nearbyAttractions.map((n, i) => (
            <View key={i} style={styles.insightsBulletRow}>
              <Ionicons name="location-outline" size={14} color="#6366f1" />
              <Text style={styles.insightsBulletText}>{n}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <View style={[styles.insightsCard, { borderColor: "#818cf833" }]}>
      <View style={styles.insightsHeader}>
        <View style={[styles.insightsIconBadge, { backgroundColor: "#818cf822" }]}>
          <ActivityIndicator size="small" color="#818cf8" />
        </View>
        <Text style={[styles.insightsTitle, { color: "#818cf8" }]}>Getting AI Insights…</Text>
      </View>
      <View style={[styles.skeletonLine, { width: "100%", marginBottom: 8 }]} />
      <View style={[styles.skeletonLine, { width: "80%", marginBottom: 16 }]} />
      <View style={styles.chipsRow}>
        {[60, 80, 70].map((w, i) => (
          <View key={i} style={[styles.skeletonChip, { width: w }]} />
        ))}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function QuestDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; itemData: string }>();
  const { groups, addSavedSpot } = useGroups();

  // QuestResult extends FeedItem with aiDescription + relevanceScore + trail stats
  let item: (FeedItem & { aiDescription?: string; relevanceScore?: number }) | null = null;
  try {
    item = JSON.parse(params.itemData ?? "null");
  } catch {
    item = null;
  }

  const [insights, setInsights] = useState<ActivityInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const cancelledRef = useRef(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [sendingToGroup, setSendingToGroup] = useState<string | null>(null);
  const [sentToGroup, setSentToGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    trackQuestViewed({
      questId: item.id,
      title: item.title,
      source: item.source,
      activityType: item.activityType ?? "unknown",
      hasCoords: item.locationCoords !== null,
    });
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    cancelledRef.current = false;
    setInsightsLoading(true);

    const timeout = setTimeout(() => {
      if (!cancelledRef.current) setInsightsLoading(false);
    }, 12_000); // max wait

    getActivityInsights(
      item.title,
      item.locationName ?? null,
      item.activityType ?? null,
      (item.aiDescription ?? item.description).slice(0, 600)
    ).then((result) => {
      clearTimeout(timeout);
      if (cancelledRef.current) return;
      setInsights(result);
      setInsightsLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      if (!cancelledRef.current) setInsightsLoading(false);
    });

    return () => {
      cancelledRef.current = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={styles.errorCenter}>
          <Text style={styles.errorText}>Quest not found.</Text>
        </View>
      </View>
    );
  }

  const sourceColor = SOURCE_COLORS[item.source];
  const sourceLabel = SOURCE_LABELS[item.source];
  const sourceIcon = SOURCE_ICONS[item.source];

  async function handleSendToGroup(groupId: string) {
    if (!item) return;
    setSendingToGroup(groupId);
    try {
      await addSavedSpot(groupId, item);
      setSentToGroup(groupId);
    } finally {
      setSendingToGroup(null);
    }
  }

  function openInMaps() {
    if (!item?.locationCoords) return;
    const { latitude: lat, longitude: lng } = item.locationCoords;
    const label = encodeURIComponent(item.title);
    if (Platform.OS === "web") {
      // PWA — open Google Maps in browser
      safeOpenUrl(`https://www.google.com/maps?q=${lat},${lng}&label=${label}`);
    } else if (Platform.OS === "ios") {
      // Try Apple Maps first, fall back to Google Maps web
      Linking.openURL(`maps://maps.apple.com/?ll=${lat},${lng}&q=${label}`).catch(() =>
        safeOpenUrl(`https://maps.apple.com/?ll=${lat},${lng}&q=${label}`)
      );
    } else {
      // Android — geo: scheme opens Maps app
      Linking.openURL(`geo:${lat},${lng}?q=${label}`).catch(() =>
        safeOpenUrl(`https://www.google.com/maps?q=${lat},${lng}`)
      );
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Back Button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#f1f5f9" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Hero Image */}
        {item.imageUrl && (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.heroImage}
            contentFit="cover"
            transition={300}
          />
        )}

        <View style={styles.content}>
          {/* Source tag + time */}
          <View style={styles.tagRow}>
            <View style={[styles.sourceTag, { borderColor: sourceColor + "44" }]}>
              <Ionicons name={sourceIcon} size={13} color={sourceColor} />
              <Text style={[styles.sourceText, { color: sourceColor }]}>
                {item.sourceName}
              </Text>
            </View>
            {item.createdAt != null && (
              <Text style={styles.timeText}>{timeAgo(item.createdAt)}</Text>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>{item.title}</Text>

          {/* TripAdvisor rating */}
          {item.rating != null && (
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={
                    item!.rating! >= star
                      ? "star"
                      : item!.rating! >= star - 0.5
                      ? "star-half"
                      : "star-outline"
                  }
                  size={16}
                  color="#34e0a1"
                />
              ))}
              <Text style={styles.ratingText}>{item.rating.toFixed(1)} / 5</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={styles.statsRow}>
            {item.score != null && (
              <View style={styles.stat}>
                <Ionicons
                  name={item.source === "tripadvisor" ? "people-outline" : "arrow-up"}
                  size={16}
                  color="#818cf8"
                />
                <Text style={styles.statText}>
                  {formatScore(item.score)}{" "}
                  {item.source === "tripadvisor" ? "reviews" : "upvotes"}
                </Text>
              </View>
            )}
            {item.commentCount != null && (
              <View style={styles.stat}>
                <Ionicons name="chatbubble-outline" size={15} color="#64748b" />
                <Text style={styles.statText}>{formatScore(item.commentCount)} comments</Text>
              </View>
            )}
          </View>

          {/* Location + distance */}
          {(item.locationName || item.distanceFromUserKm != null) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={15} color="#6366f1" />
              {item.locationName && (
                <Text style={styles.locationText}>{item.locationName}</Text>
              )}
              {item.distanceFromUserKm != null && (
                <View style={styles.distancePill}>
                  <Ionicons name="navigate-outline" size={11} color="#f59e0b" />
                  <Text style={styles.distancePillText}>
                    {item.distanceFromUserKm < 1
                      ? `${Math.round(item.distanceFromUserKm * 1000)}m away`
                      : `${item.distanceFromUserKm.toFixed(1)}km away`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Open in Maps button — only when we have coords */}
          {item.locationCoords && (
            <TouchableOpacity style={styles.mapsBtn} onPress={openInMaps} activeOpacity={0.85}>
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={styles.mapsBtnText}>Open in Maps</Text>
              <Ionicons name="open-outline" size={14} color="#ffffff88" style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          )}

          {/* Send to Group button */}
          <TouchableOpacity
            style={styles.groupBtn}
            onPress={() => { setSentToGroup(null); setShowGroupModal(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="people" size={18} color="#818cf8" />
            <Text style={styles.groupBtnText}>Send to Group</Text>
            <Ionicons name="chevron-forward" size={14} color="#818cf844" style={{ marginLeft: "auto" }} />
          </TouchableOpacity>

          {/* Send to Group modal */}
          <Modal
            visible={showGroupModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowGroupModal(false)}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowGroupModal(false)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Send to Group</Text>
                <Text style={styles.modalSubtitle}>
                  The spot will be saved and your group can vote on it.
                </Text>

                {groups.length === 0 ? (
                  <View style={styles.noGroupsBox}>
                    <Ionicons name="people-outline" size={36} color="#334155" />
                    <Text style={styles.noGroupsText}>You have no groups yet.</Text>
                    <TouchableOpacity
                      style={styles.createGroupBtn}
                      onPress={() => { setShowGroupModal(false); router.push("/group/create" as any); }}
                    >
                      <Text style={styles.createGroupBtnText}>Create a group</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  groups.map((g) => {
                    const isSent = sentToGroup === g.id;
                    const isSending = sendingToGroup === g.id;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.groupRow, isSent && styles.groupRowSent]}
                        onPress={() => !isSent && handleSendToGroup(g.id)}
                        activeOpacity={0.8}
                        disabled={isSending || isSent}
                      >
                        <Text style={styles.groupRowEmoji}>{g.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.groupRowName}>{g.name}</Text>
                          <Text style={styles.groupRowMeta}>{g.members.length} members · {g.savedSpots.length} spots</Text>
                        </View>
                        {isSending && <ActivityIndicator size="small" color="#818cf8" />}
                        {isSent && <Ionicons name="checkmark-circle" size={22} color="#22c55e" />}
                        {!isSending && !isSent && <Ionicons name="chevron-forward" size={16} color="#334155" />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>

          {/* Trail stats — distance + elevation (hikes / OSM routes) */}
          {(item.trailDistanceKm != null || item.elevationGainM != null) && (
            <View style={styles.trailStatsRow}>
              {item.trailDistanceKm != null && (
                <View style={styles.trailStat}>
                  <Ionicons name="resize-outline" size={14} color="#22c55e" />
                  <Text style={styles.trailStatText}>
                    {item.trailDistanceKm < 1
                      ? `${Math.round(item.trailDistanceKm * 1000)}m`
                      : `${item.trailDistanceKm.toFixed(1)}km`}
                  </Text>
                  <Text style={styles.trailStatLabel}>distance</Text>
                </View>
              )}
              {item.elevationGainM != null && (
                <View style={styles.trailStat}>
                  <Ionicons
                    name={item.activityType === "trails" && item.source !== "trails" ? "trending-up-outline" : "arrow-up-outline"}
                    size={14}
                    color="#22c55e"
                  />
                  <Text style={styles.trailStatText}>
                    {Math.round(item.elevationGainM)}m
                  </Text>
                  <Text style={styles.trailStatLabel}>
                    {item.source === "trails" && item.trailDistanceKm != null ? "ascent" : "elevation"}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* AI-generated description — shown above the raw body */}
          {item.aiDescription && item.aiDescription !== item.description && item.aiDescription.length > 20 && (
            <View style={styles.aiDescBox}>
              <View style={styles.aiDescHeader}>
                <Ionicons name="sparkles" size={13} color="#818cf8" />
                <Text style={styles.aiDescLabel}>AI Summary</Text>
              </View>
              <Text style={styles.aiDescText}>{item.aiDescription}</Text>
            </View>
          )}

          {/* AI Insights — auto-loaded on open */}
          {insightsLoading && <InsightsSkeleton />}
          {!insightsLoading && insights && (
            <AIInsightsCard insights={insights} activityType={item.activityType ?? null} />
          )}

          {/* Activity info card */}
          {item.activityType && ACTIVITY_INFO[item.activityType] && (
            <ActivityInfoCard activityType={item.activityType} />
          )}

          {/* Body text — Reddit selftext or item description */}
          {(item.redditSelftext ?? item.description).length > 10 && (
            <View style={styles.bodyBox}>
              <Text style={styles.bodyText}>
                {(item.redditSelftext ?? item.description)
                  .replace(/&#x200B;/g, "")
                  .trim()}
              </Text>
            </View>
          )}

          {/* Map preview */}
          {item.source === "reddit" && item.redditSelftext != null ? (
            <MapPreview title={item.title} selftext={item.redditSelftext} />
          ) : item.locationCoords ? (
            <MapPreview
              title={item.title}
              selftext={`${item.locationCoords.latitude}, ${item.locationCoords.longitude}`}
            />
          ) : null}

          {/* View on source — prominent, always visible */}
          <TouchableOpacity
            style={[styles.sourceBtn, { borderColor: sourceColor + "44" }]}
            onPress={() => {
              trackQuestExternalLink({ questId: item!.id, source: item!.source });
              safeOpenUrl(item!.externalUrl);
            }}
          >
            <Ionicons name={sourceIcon} size={20} color={sourceColor} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sourceBtnText, { color: sourceColor }]}>
                View on {sourceLabel}
              </Text>
              {item.source === "reddit" && item.redditAuthor && (
                <Text style={styles.sourceBtnSub}>Posted by u/{item.redditAuthor}</Text>
              )}
            </View>
            <Ionicons name="open-outline" size={16} color={sourceColor + "88"} />
          </TouchableOpacity>

          {/* YouTube attribution */}
          {item.source === "youtube" && (
            <View style={styles.attributionRow}>
              <Ionicons name="logo-youtube" size={13} color="#ef4444" />
              <Text style={styles.attributionText}>
                Video data provided by YouTube. YouTube is a trademark of Google LLC.
              </Text>
            </View>
          )}

          {/* Reddit link post URL */}
          {item.source === "reddit" && item.redditIsLink && item.redditUrl && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => safeOpenUrl(item!.redditUrl)}
            >
              <Ionicons name="link" size={16} color="#6366f1" />
              <Text style={styles.linkText} numberOfLines={1}>
                {item.redditUrl}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  backBtn: {
    position: "absolute",
    top: 48,
    left: 16,
    zIndex: 10,
    backgroundColor: "#0f172acc",
    borderRadius: 20,
    padding: 8,
  },
  heroImage: {
    width: "100%",
    height: 260,
    backgroundColor: "#1e293b",
  },
  content: {
    padding: 20,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sourceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1e293b",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  sourceText: {
    fontSize: 12,
    fontWeight: "700",
  },
  timeText: {
    fontSize: 12,
    color: "#475569",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#f1f5f9",
    lineHeight: 30,
    marginBottom: 14,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 14,
  },
  ratingText: {
    fontSize: 14,
    color: "#34e0a1",
    fontWeight: "600",
    marginLeft: 6,
  },
  statsRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 14,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    fontSize: 14,
    color: "#94a3b8",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  locationText: {
    fontSize: 14,
    color: "#6366f1",
    fontWeight: "600",
    flex: 1,
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1c1408",
    borderWidth: 1,
    borderColor: "#78350f",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  distancePillText: {
    fontSize: 11,
    color: "#f59e0b",
    fontWeight: "700",
  },
  trailStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  trailStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0f2918",
    borderWidth: 1,
    borderColor: "#14532d",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  trailStatText: {
    fontSize: 15,
    color: "#22c55e",
    fontWeight: "700",
  },
  trailStatLabel: {
    fontSize: 11,
    color: "#4ade80",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  aiDescBox: {
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#3730a3",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  aiDescHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  aiDescLabel: {
    fontSize: 11,
    color: "#818cf8",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aiDescText: {
    fontSize: 15,
    color: "#c7d2fe",
    lineHeight: 24,
  },
  sourceBtnSub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  bodyBox: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  bodyText: {
    fontSize: 15,
    color: "#cbd5e1",
    lineHeight: 24,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1e293b",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: "#6366f1",
  },
  sourceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  sourceBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#94a3b8",
    fontSize: 16,
  },
  infoCard: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
  },
  infoCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  infoCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  infoIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  infoCardLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  infoCardSummary: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
    flex: 1,
  },
  infoTips: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    gap: 10,
  },
  infoTipsHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoTipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  infoTipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  infoTipText: {
    fontSize: 14,
    color: "#cbd5e1",
    lineHeight: 22,
    flex: 1,
  },

  // ── AI Insights card ──
  insightsCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  insightsIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  insightsTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  insightsOverview: {
    fontSize: 15,
    color: "#cbd5e1",
    lineHeight: 24,
    marginBottom: 14,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  insightsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  insightsRowText: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
    flex: 1,
  },
  insightsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    gap: 6,
  },
  insightsSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  insightsSectionText: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 22,
  },
  insightsBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  insightsBulletText: {
    fontSize: 14,
    color: "#cbd5e1",
    lineHeight: 22,
    flex: 1,
  },

  mapsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  mapsBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  attributionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
    opacity: 0.6,
  },
  attributionText: {
    fontSize: 11,
    color: "#64748b",
    flex: 1,
    lineHeight: 16,
  },

  // ── Skeleton ──
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: "#1e293b",
  },
  skeletonChip: {
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1e293b",
  },

  // ── Send to Group ──
  groupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e1b4b",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#4338ca44",
  },
  groupBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#818cf8",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    gap: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#334155",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#f1f5f9",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 16,
    lineHeight: 18,
  },
  noGroupsBox: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
  },
  noGroupsText: {
    fontSize: 14,
    color: "#475569",
  },
  createGroupBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  createGroupBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#334155",
  },
  groupRowSent: {
    borderColor: "#14532d",
    backgroundColor: "#052e16",
  },
  groupRowEmoji: {
    fontSize: 26,
  },
  groupRowName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f1f5f9",
  },
  groupRowMeta: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
});
