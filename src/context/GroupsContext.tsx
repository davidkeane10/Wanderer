/**
 * GroupsContext — Firestore-backed real-time group sync.
 *
 * Data model:
 *   /groups/{groupId}        — full group document (members + spots + votes embedded)
 *   /inviteCodes/{code}      — maps 6-char code → groupId for fast joins
 *
 * Every user sees only groups where their UID is in `memberIds`.
 * Groups sync in real-time across all members' devices.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { db } from "../services/firebase";
import type { FeedItem } from "../types/feed";
import type {
  CreateGroupInput,
  CreateVoteInput,
  Group,
  GroupMember,
  Vote,
  VoteOption,
} from "../types/social";
import { useAuth } from "./AuthContext";

// ─── Context shape ────────────────────────────────────────────────────────────

interface GroupsContextValue {
  groups: Group[];
  isLoading: boolean;
  activeVotes: Array<Vote & { group: Group }>;
  you: GroupMember | null;
  createGroup: (input: CreateGroupInput) => Promise<Group>;
  deleteGroup: (groupId: string) => Promise<void>;
  joinGroup: (code: string) => Promise<Group | null>;
  addSavedSpot: (groupId: string, feedItem: FeedItem) => Promise<"added" | "already_saved">;
  removeSavedSpot: (groupId: string, spotId: string) => Promise<void>;
  createVote: (groupId: string, input: CreateVoteInput) => Promise<Vote>;
  castVote: (groupId: string, voteId: string, rankings: string[]) => Promise<void>;
  resolveVote: (groupId: string, voteId: string) => Promise<string | null>;
  spinWheel: (groupId: string, voteId: string) => Promise<VoteOption | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function isVoteActive(vote: Vote): boolean {
  return vote.status === "active" && Date.now() < vote.deadline;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const GroupsContext = createContext<GroupsContextValue | null>(null);

export function GroupsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Real-time listener — only groups the current user is a member of
  useEffect(() => {
    if (!currentUser) {
      setGroups([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, "groups"),
      where("memberIds", "array-contains", currentUser.uid)
    );

    const unsub = onSnapshot(
      q,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (snapshot: any) => {
        const docs = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as Group));
        // Sort newest first
        docs.sort((a: Group, b: Group) => b.createdAt - a.createdAt);
        setGroups(docs);
        setIsLoading(false);
      },
      () => {
        // Firestore error (e.g. offline) — keep whatever we have
        setIsLoading(false);
      }
    );

    return unsub;
  }, [currentUser?.uid]);

  // ─── Group CRUD ──────────────────────────────────────────────────────────

  const createGroup = useCallback(
    async (input: CreateGroupInput): Promise<Group> => {
      if (!currentUser) throw new Error("Not authenticated");

      const joinCode = generateJoinCode();
      const me: GroupMember = {
        id: currentUser.uid,
        name: currentUser.name,
        initials: currentUser.initials,
        color: currentUser.color,
        isYou: true,
      };

      const groupData: Omit<Group, "id"> = {
        name: input.name.trim(),
        emoji: input.emoji,
        description: input.description?.trim(),
        members: [me],
        memberIds: [currentUser.uid],
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        joinCode,
        savedSpots: [],
        votes: [],
      };

      const ref = await addDoc(collection(db, "groups"), groupData);

      // Register the join code so others can look it up
      await setDoc(doc(db, "inviteCodes", joinCode), {
        groupId: ref.id,
        groupName: groupData.name,
        emoji: groupData.emoji,
      });

      return { id: ref.id, ...groupData };
    },
    [currentUser]
  );

  const deleteGroup = useCallback(async (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      await deleteDoc(doc(db, "inviteCodes", group.joinCode)).catch(() => {});
    }
    await deleteDoc(doc(db, "groups", groupId));
  }, [groups]);

  const joinGroup = useCallback(
    async (code: string): Promise<Group | null> => {
      if (!currentUser) return null;

      const codeDoc = await getDoc(doc(db, "inviteCodes", code.toUpperCase().trim()));
      if (!codeDoc.exists()) return null;

      const { groupId } = codeDoc.data() as { groupId: string };
      const groupDoc = await getDoc(doc(db, "groups", groupId));
      if (!groupDoc.exists()) return null;

      const group = { id: groupDoc.id, ...groupDoc.data() } as Group;

      // Already a member?
      if (group.memberIds.includes(currentUser.uid)) return group;

      const newMember: GroupMember = {
        id: currentUser.uid,
        name: currentUser.name,
        initials: currentUser.initials,
        color: currentUser.color,
      };

      await updateDoc(doc(db, "groups", groupId), {
        memberIds: [...group.memberIds, currentUser.uid],
        members: [...group.members, newMember],
      });

      return group;
    },
    [currentUser]
  );

  // ─── Saved Spots ─────────────────────────────────────────────────────────

  const addSavedSpot = useCallback(
    async (groupId: string, feedItem: FeedItem): Promise<"added" | "already_saved"> => {
      if (!currentUser) throw new Error("Not authenticated");

      const group = groups.find((g) => g.id === groupId);
      if (!group) throw new Error("Group not found");

      if (group.savedSpots.some((s) => s.feedItem.id === feedItem.id)) {
        return "already_saved";
      }

      const newSpot = {
        id: uid(),
        feedItem,
        savedAt: Date.now(),
        savedBy: currentUser.uid,
      };

      await updateDoc(doc(db, "groups", groupId), {
        savedSpots: [newSpot, ...group.savedSpots],
      });

      return "added";
    },
    [currentUser, groups]
  );

  const removeSavedSpot = useCallback(
    async (groupId: string, spotId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      await updateDoc(doc(db, "groups", groupId), {
        savedSpots: group.savedSpots.filter((s) => s.id !== spotId),
      });
    },
    [groups]
  );

  // ─── Votes ─────��─────────────────────────────────────────────────────────

  const createVote = useCallback(
    async (groupId: string, input: CreateVoteInput): Promise<Vote> => {
      if (!currentUser) throw new Error("Not authenticated");

      const group = groups.find((g) => g.id === groupId);
      if (!group) throw new Error("Group not found");

      const vote: Vote = {
        id: uid(),
        groupId,
        question: input.question.trim(),
        options: input.options.map((o) => ({ ...o, id: uid() })),
        deadline: Date.now() + input.deadlineHours * 60 * 60 * 1000,
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        responses: [],
        status: "active",
      };

      await updateDoc(doc(db, "groups", groupId), {
        votes: [vote, ...group.votes],
      });

      return vote;
    },
    [currentUser, groups]
  );

  const castVote = useCallback(
    async (groupId: string, voteId: string, rankings: string[]) => {
      if (!currentUser) return;

      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const updatedVotes = group.votes.map((v) => {
        if (v.id !== voteId) return v;
        const filtered = v.responses.filter((r) => r.memberId !== currentUser.uid);
        return {
          ...v,
          responses: [
            ...filtered,
            { memberId: currentUser.uid, rankings, votedAt: Date.now() },
          ],
        };
      });

      await updateDoc(doc(db, "groups", groupId), { votes: updatedVotes });
    },
    [currentUser, groups]
  );

  const resolveVote = useCallback(
    async (groupId: string, voteId: string): Promise<string | null> => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return null;
      const vote = group.votes.find((v) => v.id === voteId);
      if (!vote || vote.winnerId) return vote?.winnerId ?? null;
      if (vote.responses.length === 0) return null;

      const n = vote.options.length;
      const scores = new Map<string, number>(vote.options.map((o) => [o.id, 0]));
      for (const r of vote.responses) {
        const rankings = r.rankings ?? [];
        rankings.forEach((id, idx) => {
          if (scores.has(id)) scores.set(id, scores.get(id)! + (n - 1 - idx));
        });
      }

      let winnerId = vote.options[0].id;
      let maxScore = -Infinity;
      scores.forEach((score, id) => {
        if (score > maxScore) { maxScore = score; winnerId = id; }
      });

      const updatedVotes = group.votes.map((v) =>
        v.id !== voteId ? v : { ...v, status: "closed" as const, winnerId }
      );
      await updateDoc(doc(db, "groups", groupId), { votes: updatedVotes });
      return winnerId;
    },
    [groups]
  );

  const spinWheel = useCallback(
    async (groupId: string, voteId: string): Promise<VoteOption | null> => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return null;

      let winner: VoteOption | null = null;

      const updatedVotes = group.votes.map((v) => {
        if (v.id !== voteId) return v;
        const idx = Math.floor(Math.random() * v.options.length);
        winner = v.options[idx];
        return { ...v, status: "closed" as const, winnerId: winner.id };
      });

      await updateDoc(doc(db, "groups", groupId), { votes: updatedVotes });

      return winner;
    },
    [groups]
  );

  // ─── Derived: active votes across all groups ──────────────────────────────

  const activeVotes = groups.flatMap((g) =>
    g.votes.filter(isVoteActive).map((v) => ({ ...v, group: g }))
  );

  return (
    <GroupsContext.Provider
      value={{
        groups,
        isLoading,
        activeVotes,
        you: currentUser
          ? { id: currentUser.uid, name: currentUser.name, initials: currentUser.initials, color: currentUser.color, isYou: true }
          : null,
        createGroup,
        deleteGroup,
        joinGroup,
        addSavedSpot,
        removeSavedSpot,
        createVote,
        castVote,
        resolveVote,
        spinWheel,
      }}
    >
      {children}
    </GroupsContext.Provider>
  );
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error("useGroups must be used within GroupsProvider");
  return ctx;
}
