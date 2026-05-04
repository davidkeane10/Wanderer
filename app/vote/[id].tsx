import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGroups } from "../../src/context/GroupsContext";
import type { Group, Vote, VoteOption } from "../../src/types/social";

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Each person's #1 spot earns (n-1) points, #2 earns (n-2), … last earns 0.
// Spot with most total points wins — this rewards being consistently ranked high
// by everyone, not just being one person's favourite.

function computeScores(vote: Vote): Map<string, number> {
  const n = vote.options.length;
  const scores = new Map<string, number>(vote.options.map((o) => [o.id, 0]));
  for (const r of vote.responses) {
    (r.rankings ?? []).forEach((id, idx) => {
      if (scores.has(id)) scores.set(id, scores.get(id)! + (n - 1 - idx));
    });
  }
  return scores;
}

// ─── Draggable list ───────────────────────────────────────────────────────────

const ITEM_H = 72;
const ITEM_GAP = 10;
const STRIDE = ITEM_H + ITEM_GAP;

function DraggableList({
  options,
  order,
  disabled,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  options: VoteOption[];
  order: string[];
  disabled?: boolean;
  onChange: (newOrder: string[]) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const itemY = useRef(
    new Map(options.map((o, i) => [o.id, new Animated.Value(i * STRIDE)]))
  ).current;

  const orderRef = useRef(order);
  const [displayOrder, setDisplayOrder] = useState(order);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeIdxRef = useRef(-1);
  const dragStartY = useRef(0);

  useEffect(() => {
    if (!activeIdRef.current) {
      orderRef.current = order;
      setDisplayOrder(order);
      order.forEach((id, idx) => itemY.get(id)?.setValue(idx * STRIDE));
    }
  }, [order.join(",")]);

  const panResponders = useRef(
    new Map(
      options.map((o) => {
        const id = o.id;
        const pr = PanResponder.create({
          onStartShouldSetPanResponder: () => !disabled,
          onMoveShouldSetPanResponder: () => !disabled,
          onPanResponderGrant: () => {
            const idx = orderRef.current.indexOf(id);
            activeIdRef.current = id;
            activeIdxRef.current = idx;
            dragStartY.current = idx * STRIDE;
            setActiveId(id);
            onDragStart?.();
          },
          onPanResponderMove: (_, gs) => {
            if (activeIdRef.current !== id) return;
            const newY = Math.max(
              0,
              Math.min(dragStartY.current + gs.dy, (options.length - 1) * STRIDE)
            );
            itemY.get(id)!.setValue(newY);
            const newIdx = Math.round(newY / STRIDE);
            if (newIdx !== activeIdxRef.current) {
              const newOrder = [...orderRef.current];
              newOrder.splice(activeIdxRef.current, 1);
              newOrder.splice(newIdx, 0, id);
              orderRef.current = newOrder;
              activeIdxRef.current = newIdx;
              newOrder.forEach((oid, oidx) => {
                if (oid !== id) {
                  Animated.spring(itemY.get(oid)!, {
                    toValue: oidx * STRIDE,
                    useNativeDriver: false,
                    friction: 7,
                    tension: 100,
                  }).start();
                }
              });
              setDisplayOrder([...newOrder]);
            }
          },
          onPanResponderRelease: () => {
            if (activeIdRef.current !== id) return;
            Animated.spring(itemY.get(id)!, {
              toValue: activeIdxRef.current * STRIDE,
              useNativeDriver: false,
              friction: 7,
              tension: 100,
            }).start();
            activeIdRef.current = null;
            setActiveId(null);
            onDragEnd?.();
            onChange(orderRef.current);
          },
        });
        return [id, pr] as [string, typeof pr];
      })
    )
  ).current;

  return (
    <View style={{ height: options.length * STRIDE - ITEM_GAP }}>
      {options.map((option) => {
        const rank = displayOrder.indexOf(option.id);
        const isActive = activeId === option.id;
        const isTop = rank === 0;
        const isBottom = rank === options.length - 1;

        return (
          <Animated.View
            key={option.id}
            style={[
              styles.rankItem,
              isActive && styles.rankItemActive,
              isTop && !isActive && styles.rankItemTop,
              {
                position: "absolute",
                top: itemY.get(option.id),
                left: 0,
                right: 0,
                height: ITEM_H,
                zIndex: isActive ? 10 : 1,
              },
            ]}
            {...panResponders.get(option.id)!.panHandlers}
          >
            {/* Rank number */}
            <View style={[styles.rankBadge, isTop && styles.rankBadgeTop, isBottom && styles.rankBadgeBottom]}>
              <Text style={[styles.rankNum, isTop && styles.rankNumTop]}>{rank + 1}</Text>
            </View>

            {/* Emoji + info */}
            <Text style={styles.itemEmoji}>{option.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemLabel} numberOfLines={1}>{option.label}</Text>
              {(option.meta ?? option.feedItem?.sourceName) ? (
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {option.meta ?? option.feedItem?.sourceName}
                </Text>
              ) : null}
            </View>

            {/* Drag handle */}
            {!disabled && (
              <View style={styles.dragHandle}>
                <View style={styles.dhLine} />
                <View style={styles.dhLine} />
                <View style={styles.dhLine} />
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── Result rows (closed vote) ────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

function ResultRow({
  option,
  rank,
  score,
  maxScore,
  isWinner,
  firstChoices,
}: {
  option: VoteOption;
  rank: number;
  score: number;
  maxScore: number;
  isWinner: boolean;
  firstChoices: number;
}) {
  const bar = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bar, {
      toValue: maxScore > 0 ? (score / maxScore) * 100 : 0,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [score, maxScore]);

  return (
    <View style={[styles.resultRow, isWinner && styles.resultRowWinner]}>
      <Text style={styles.resultMedal}>{MEDALS[rank] ?? `#${rank + 1}`}</Text>
      <Text style={styles.resultEmoji}>{option.emoji}</Text>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.resultLabel} numberOfLines={1}>{option.label}</Text>
        <View style={styles.resultBarBg}>
          <Animated.View
            style={[
              styles.resultBar,
              {
                backgroundColor: isWinner ? "#f59e0b" : "#6366f1",
                width: bar.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
              },
            ]}
          />
        </View>
        <Text style={styles.resultMeta}>
          {score} {score === 1 ? "point" : "points"}
          {firstChoices > 0 ? ` · #1 for ${firstChoices} ${firstChoices === 1 ? "person" : "people"}` : ""}
        </Text>
      </View>
      {isWinner && <Ionicons name="trophy" size={18} color="#f59e0b" />}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function VoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, you, castVote, resolveVote } = useGroups();

  let vote: Vote | null = null;
  let group: Group | null = null;
  for (const g of groups) {
    const found = g.votes.find((v) => v.id === id);
    if (found) { vote = found; group = g; break; }
  }

  const isClosed = !vote ? false : vote.status === "closed" || Date.now() >= vote.deadline;
  const myResponse = vote?.responses.find((r) => r.memberId === you?.id);
  const myRankings = myResponse?.rankings ?? null;

  const [rankOrder, setRankOrder] = useState<string[]>(
    myRankings ?? vote?.options.map((o) => o.id) ?? []
  );
  const [isEditing, setIsEditing] = useState(!myRankings && !isClosed);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resolveAttempted = useRef(false);
  useEffect(() => {
    if (isClosed && vote && !vote.winnerId && !resolveAttempted.current && vote.responses.length > 0) {
      resolveAttempted.current = true;
      resolveVote(group!.id, vote.id);
    }
  }, [isClosed, vote?.id]);

  useEffect(() => {
    if (myRankings && !isEditing) setRankOrder(myRankings);
  }, [myRankings?.join(",")]);

  const handleSubmit = async () => {
    if (!vote || !group || submitting) return;
    setSubmitting(true);
    try {
      await castVote(group.id, vote.id, rankOrder);
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!vote || !group) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <Text style={styles.notFound}>Vote not found</Text>
      </View>
    );
  }

  const timeLeft = vote.deadline - Date.now();
  const hoursLeft = Math.max(0, Math.floor(timeLeft / 3600000));
  const minutesLeft = Math.max(0, Math.floor((timeLeft % 3600000) / 60000));
  const timeLabel = isClosed
    ? "Closed"
    : hoursLeft > 0
    ? `${hoursLeft}h ${minutesLeft}m left`
    : `${minutesLeft}m left`;

  // ── Results data ─────────────────────────────────────────────────────────────
  const scores = computeScores(vote);
  const maxScore = Math.max(...Array.from(scores.values()), 1);
  const sortedOptions = [...vote.options].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
  );
  const winner = vote.winnerId ? vote.options.find((o) => o.id === vote.winnerId) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={styles.groupTag}>
          <Text style={styles.groupEmoji}>{group.emoji}</Text>
          <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
        </View>
        <View style={[styles.timeChip, isClosed && styles.timeChipClosed]}>
          <Ionicons
            name={isClosed ? "checkmark-circle" : "time-outline"}
            size={11}
            color={isClosed ? "#34e0a1" : "#818cf8"}
          />
          <Text style={[styles.timeText, isClosed && styles.timeTextClosed]}>{timeLabel}</Text>
        </View>
      </View>

      {/* ── CLOSED: winner + results ────────────────────────────────────── */}
      {isClosed && (
        <ScrollView
          contentContainerStyle={[styles.resultsScroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Winner banner */}
          {winner && (
            <View style={styles.winnerBanner}>
              <Text style={styles.winnerEmoji}>{winner.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.winnerLabel}>Group pick</Text>
                <Text style={styles.winnerName}>{winner.label}</Text>
              </View>
              <Ionicons name="trophy" size={24} color="#f59e0b" />
            </View>
          )}

          {/* Results */}
          <Text style={styles.sectionLabel}>
            Final Rankings · {vote.responses.length} {vote.responses.length === 1 ? "person" : "people"} voted
          </Text>
          <Text style={styles.scoringNote}>
            Each person's ranking gives points — #1 earns the most, last earns none. Highest total points wins.
          </Text>

          {vote.responses.length === 0 ? (
            <Text style={styles.emptyText}>No one voted before it closed.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {sortedOptions.map((option, rank) => (
                <ResultRow
                  key={option.id}
                  option={option}
                  rank={rank}
                  score={scores.get(option.id) ?? 0}
                  maxScore={maxScore}
                  isWinner={option.id === vote.winnerId}
                  firstChoices={vote.responses.filter((r) => r.rankings?.[0] === option.id).length}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── OPEN: drag-to-rank ──────────────────────────────────────────── */}
      {!isClosed && (
        <>
          {/* Status row */}
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              {vote.responses.length} of {group.members.length}{" "}
              {group.members.length === 1 ? "person" : "people"} voted
              {isEditing ? " · drag to rank" : " · submitted ✓"}
            </Text>
            {!isEditing && myRankings && (
              <TouchableOpacity onPress={() => { setIsEditing(true); setRankOrder(myRankings); }}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Drag list */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.listScroll}
            scrollEnabled={!isDragging}
            showsVerticalScrollIndicator={false}
          >
            {/* TOP label */}
            <View style={styles.edgeLabel}>
              <View style={styles.edgeLine} />
              <Text style={styles.edgeLabelText}>TOP PICK  ↑</Text>
              <View style={styles.edgeLine} />
            </View>

            <DraggableList
              options={vote.options}
              order={rankOrder}
              disabled={!isEditing}
              onChange={setRankOrder}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
            />

            {/* BOTTOM label */}
            <View style={[styles.edgeLabel, { marginTop: 16 }]}>
              <View style={styles.edgeLine} />
              <Text style={styles.edgeLabelText}>↓  LAST PICK</Text>
              <View style={styles.edgeLine} />
            </View>
          </ScrollView>

          {/* Submit — pinned at bottom */}
          {isEditing && (
            <View style={[styles.submitRow, { paddingBottom: insets.bottom + 12 }]}>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnLoading]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {submitting ? "Submitting…" : myRankings ? "Update ranking" : "Submit ranking"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  backBtn: { padding: 4 },
  notFound: { textAlign: "center", color: "#64748b", marginTop: 40 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    gap: 10,
  },
  groupTag: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  groupEmoji: { fontSize: 18 },
  groupName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1e1b4b",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  timeChipClosed: { backgroundColor: "#064e3b" },
  timeText: { fontSize: 11, color: "#818cf8", fontWeight: "600" },
  timeTextClosed: { color: "#34e0a1" },

  // Status row (open vote)
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  statusText: { fontSize: 13, color: "#64748b" },
  editLink: { fontSize: 13, color: "#6366f1", fontWeight: "600" },

  // Drag list area
  listScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  edgeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  edgeLine: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  edgeLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Rank items
  rankItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  rankItemTop: {
    borderColor: "#f59e0b55",
    backgroundColor: "#1c160a",
  },
  rankItemActive: {
    borderColor: "#6366f1",
    backgroundColor: "#1e2a4a",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  rankBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeTop: { backgroundColor: "#78350f" },
  rankBadgeBottom: { backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  rankNum: { fontSize: 13, fontWeight: "800", color: "#94a3b8" },
  rankNumTop: { color: "#fbbf24" },
  itemEmoji: { fontSize: 22 },
  itemLabel: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  itemMeta: { fontSize: 11, color: "#475569", marginTop: 2 },
  dragHandle: { gap: 4, paddingVertical: 6, paddingLeft: 4 },
  dhLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: "#475569" },

  // Submit button (pinned)
  submitRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingVertical: 16,
  },
  submitBtnLoading: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  // Results (closed)
  resultsScroll: { padding: 16, gap: 12 },
  winnerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1c140866",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f59e0b44",
    marginBottom: 4,
  },
  winnerEmoji: { fontSize: 40 },
  winnerLabel: { fontSize: 11, fontWeight: "700", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 },
  winnerName: { fontSize: 17, fontWeight: "800", color: "#f1f5f9", marginTop: 3 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  scoringNote: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 17,
    marginBottom: 4,
  },
  emptyText: { fontSize: 14, color: "#334155" },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  resultRowWinner: { borderColor: "#f59e0b55", backgroundColor: "#1c1408" },
  resultMedal: { fontSize: 22, width: 28, textAlign: "center" },
  resultEmoji: { fontSize: 20 },
  resultLabel: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  resultBarBg: { height: 5, borderRadius: 3, backgroundColor: "#334155", overflow: "hidden", marginVertical: 3 },
  resultBar: { height: 5, borderRadius: 3 },
  resultMeta: { fontSize: 11, color: "#64748b" },
});
