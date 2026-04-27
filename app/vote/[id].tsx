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
import type { Vote, VoteOption } from "../../src/types/social";

// ─── Borda count helpers ──────────────────────────────────────────────────────

function computeBorda(vote: Vote): Map<string, number> {
  const n = vote.options.length;
  const scores = new Map<string, number>(vote.options.map((o) => [o.id, 0]));
  for (const r of vote.responses) {
    const rankings: string[] = r.rankings ?? [];
    rankings.forEach((id, idx) => {
      if (scores.has(id)) scores.set(id, scores.get(id)! + (n - 1 - idx));
    });
  }
  return scores;
}

// ─── Draggable ranking list ───────────────────────────────────────────────────

const ITEM_H = 68;
const ITEM_GAP = 10;
const STRIDE = ITEM_H + ITEM_GAP;
const RANK_COLORS = ["#f59e0b", "#94a3b8", "#a16207"];

function DraggableRankingList({
  options,
  order,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  options: VoteOption[];
  order: string[];
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

  // Sync when external order changes (e.g. after submit)
  useEffect(() => {
    if (!activeIdRef.current) {
      orderRef.current = order;
      setDisplayOrder(order);
      order.forEach((id, idx) => itemY.get(id)?.setValue(idx * STRIDE));
    }
  }, [order.join(",")]);

  // Create one PanResponder per item, memoised for the lifetime of the component
  const panResponders = useRef(
    new Map(
      options.map((o) => {
        const id = o.id;
        const pr = PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
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

              // Slide other items into their new slots
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
        const rc = RANK_COLORS[rank] ?? "#475569";

        return (
          <Animated.View
            key={option.id}
            style={[
              styles.rankItem,
              isActive && styles.rankItemActive,
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
            <View style={[styles.rankBadge, { backgroundColor: rc + "22", borderColor: rc + "66" }]}>
              <Text style={[styles.rankBadgeText, { color: rc }]}>{rank + 1}</Text>
            </View>
            <Text style={styles.rankOptionEmoji}>{option.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankOptionLabel} numberOfLines={2}>{option.label}</Text>
              {option.meta ? <Text style={styles.rankOptionMeta}>{option.meta}</Text> : null}
            </View>
            <View style={styles.dragHandle}>
              <View style={styles.dhLine} />
              <View style={styles.dhLine} />
              <View style={styles.dhLine} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── Borda results ────────────────────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"];

function BordaResultRow({
  option,
  rank,
  score,
  pct,
  isWinner,
  firstChoices,
}: {
  option: VoteOption;
  rank: number;
  score: number;
  pct: number;
  isWinner: boolean;
  firstChoices: number;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barAnim, { toValue: pct, duration: 700, useNativeDriver: false }).start();
  }, [pct]);

  const barColor = isWinner ? "#f59e0b" : "#6366f1";

  return (
    <View style={[styles.bordaRow, isWinner && styles.bordaRowWinner]}>
      <Text style={styles.bordaMedal}>{MEDALS[rank] ?? `#${rank + 1}`}</Text>
      <Text style={styles.bordaEmoji}>{option.emoji}</Text>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.bordaLabel} numberOfLines={1}>{option.label}</Text>
        <Text style={styles.bordaMeta}>
          {score} pts{firstChoices > 0 ? ` · ${firstChoices} first choice${firstChoices !== 1 ? "s" : ""}` : ""}
        </Text>
        <View style={styles.bordaBarBg}>
          <Animated.View
            style={[
              styles.bordaBar,
              {
                backgroundColor: barColor,
                width: barAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
              },
            ]}
          />
        </View>
      </View>
      {isWinner && <Ionicons name="trophy" size={18} color="#f59e0b" />}
    </View>
  );
}

function BordaResults({ vote }: { vote: Vote }) {
  const scores = computeBorda(vote);
  const maxScore = Math.max(...Array.from(scores.values()), 1);
  const sorted = [...vote.options].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
  );

  return (
    <View style={{ gap: 8 }}>
      {sorted.map((option, rank) => {
        const score = scores.get(option.id) ?? 0;
        const firstChoices = vote.responses.filter((r) => r.rankings?.[0] === option.id).length;
        return (
          <BordaResultRow
            key={option.id}
            option={option}
            rank={rank}
            score={score}
            pct={(score / maxScore) * 100}
            isWinner={option.id === vote.winnerId}
            firstChoices={firstChoices}
          />
        );
      })}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function VoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, you, castVote, resolveVote } = useGroups();

  let vote: Vote | null = null;
  let groupId = "";
  let groupName = "";
  let groupEmoji = "";
  for (const g of groups) {
    const found = g.votes.find((v) => v.id === id);
    if (found) { vote = found; groupId = g.id; groupName = g.name; groupEmoji = g.emoji; break; }
  }

  const isClosed = !vote ? false : vote.status === "closed" || Date.now() >= vote.deadline;
  const myResponse = vote?.responses.find((r) => r.memberId === you?.id);
  const myRankings: string[] | null = myResponse?.rankings ?? null;

  const [rankOrder, setRankOrder] = useState<string[]>(
    myRankings ?? vote?.options.map((o) => o.id) ?? []
  );
  const [isEditing, setIsEditing] = useState(!myRankings);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-resolve when the vote closes and a winner hasn't been set yet
  const resolveAttempted = useRef(false);
  useEffect(() => {
    if (isClosed && vote && !vote.winnerId && !resolveAttempted.current && vote.responses.length > 0) {
      resolveAttempted.current = true;
      resolveVote(groupId, vote.id);
    }
  }, [isClosed, vote?.id]);

  // Keep rankOrder in sync when Firestore pushes an updated response
  useEffect(() => {
    if (myRankings && !isEditing) setRankOrder(myRankings);
  }, [myRankings?.join(",")]);

  const handleSubmit = async () => {
    if (!vote || submitting) return;
    setSubmitting(true);
    try {
      await castVote(groupId, vote.id, rankOrder);
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!vote) {
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

  const winner = vote.winnerId ? vote.options.find((o) => o.id === vote.winnerId) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <View style={styles.groupTag}>
          <Text style={styles.groupEmoji}>{groupEmoji}</Text>
          <Text style={styles.groupName}>{groupName}</Text>
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isDragging}
      >
        {/* Question */}
        <View style={styles.questionSection}>
          <Text style={styles.question}>{vote.question}</Text>
          <Text style={styles.voteCount}>
            {vote.responses.length} {vote.responses.length === 1 ? "person" : "people"} ranked
            {!isClosed ? ` · ${vote.options.length} spots to order` : ""}
          </Text>
        </View>

        {/* Winner banner */}
        {isClosed && winner && (
          <View style={styles.winnerBanner}>
            <Text style={styles.winnerEmoji}>{winner.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.winnerLabel}>Winner by Borda count</Text>
              <Text style={styles.winnerName}>{winner.label}</Text>
            </View>
            <Ionicons name="trophy" size={22} color="#f59e0b" />
          </View>
        )}

        {/* Ranking UI — only when vote is open */}
        {!isClosed && (
          <View style={styles.votingSection}>
            <View style={styles.votingHeader}>
              <Text style={styles.votingSectionTitle}>
                {isEditing ? "Drag to rank your preferences" : "Your ranking"}
              </Text>
              {!isEditing && myRankings && (
                <TouchableOpacity onPress={() => { setIsEditing(true); setRankOrder(myRankings); }}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.votingHint}>
              {isEditing
                ? "1 = top choice · drag the handle to reorder"
                : "Submitted ✓ — tap Edit to change"}
            </Text>

            <DraggableRankingList
              options={vote.options}
              order={rankOrder}
              onChange={setRankOrder}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
            />

            {isEditing && (
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>
                  {myRankings ? "Update ranking" : "Submit ranking"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Results */}
        <View style={styles.resultsSection}>
          <Text style={styles.resultsSectionTitle}>
            {isClosed ? "Final Results" : "Current Standings"}
          </Text>
          {vote.responses.length === 0 ? (
            <Text style={styles.noVotesText}>No rankings submitted yet</Text>
          ) : (
            <BordaResults vote={vote} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  backBtn: { padding: 4 },
  notFound: { textAlign: "center", color: "#64748b", marginTop: 40 },

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
  groupName: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
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

  questionSection: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, gap: 6 },
  question: { fontSize: 22, fontWeight: "800", color: "#f1f5f9", lineHeight: 30, letterSpacing: -0.3 },
  voteCount: { fontSize: 13, color: "#64748b" },

  winnerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#451a0366",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f59e0b44",
  },
  winnerEmoji: { fontSize: 36 },
  winnerLabel: { fontSize: 11, fontWeight: "600", color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 },
  winnerName: { fontSize: 16, fontWeight: "800", color: "#f1f5f9", marginTop: 2 },

  // ── Voting section ──
  votingSection: { paddingHorizontal: 16, paddingBottom: 8 },
  votingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  votingSectionTitle: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  editLink: { fontSize: 13, color: "#6366f1", fontWeight: "600" },
  votingHint: { fontSize: 12, color: "#475569", marginBottom: 14 },

  // ── Rank items ──
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
  rankItemActive: {
    borderColor: "#6366f1",
    backgroundColor: "#1e2a4a",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rankBadgeText: { fontSize: 13, fontWeight: "800" },
  rankOptionEmoji: { fontSize: 22 },
  rankOptionLabel: { fontSize: 14, fontWeight: "600", color: "#f1f5f9", lineHeight: 18 },
  rankOptionMeta: { fontSize: 11, color: "#475569", marginTop: 1 },
  dragHandle: { gap: 4, paddingVertical: 4, paddingLeft: 4 },
  dhLine: { width: 18, height: 2, borderRadius: 1, backgroundColor: "#475569" },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 16,
  },
  submitBtnDisabled: { backgroundColor: "#312e81", opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  // ── Results section ──
  resultsSection: { paddingHorizontal: 16, paddingTop: 24 },
  resultsSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  noVotesText: { fontSize: 14, color: "#334155" },

  bordaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  bordaRowWinner: { borderColor: "#f59e0b66", backgroundColor: "#1c1408" },
  bordaMedal: { fontSize: 22, width: 28, textAlign: "center" },
  bordaEmoji: { fontSize: 20 },
  bordaLabel: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  bordaMeta: { fontSize: 11, color: "#475569" },
  bordaBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#334155",
    overflow: "hidden",
    marginTop: 2,
  },
  bordaBar: { height: 4, borderRadius: 2 },
});
