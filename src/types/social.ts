import type { FeedItem } from "./feed";

// ─── Members ─────────────────────────────────────────────────────────────────

export interface GroupMember {
  id: string;    // = Firebase UID for real users
  name: string;
  initials: string;
  color: string; // avatar background colour
  isYou?: boolean;
}

// ─── Saved Spots ─────────────────────────────────────────────────────────────

export interface SavedSpot {
  id: string;
  feedItem: FeedItem;
  savedAt: number; // unix ms
  savedBy: string; // GroupMember.id
}

// ─── Voting ──────────────────────────────────────────────────────────────────

export interface VoteOption {
  id: string;
  label: string;
  emoji: string;
  feedItem?: FeedItem; // if sourced from Discover
  meta?: string;       // e.g. "AllTrails · 5.4 mi"
}

export interface VoteResponse {
  memberId: string;
  rankings: string[]; // optionIds in preference order — index 0 = 1st choice
  votedAt: number; // unix ms
}

export type VoteStatus = "active" | "closed";

export interface Vote {
  id: string;
  groupId: string;
  question: string;
  options: VoteOption[];
  deadline: number;           // unix ms
  createdBy: string;          // GroupMember.id
  createdAt: number;          // unix ms
  responses: VoteResponse[];
  status: VoteStatus;
  winnerId?: string;          // VoteOption.id after spin/close
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface Group {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  members: GroupMember[];
  /** Array of Firebase UIDs — used for Firestore array-contains queries */
  memberIds: string[];
  createdBy: string; // GroupMember.id
  createdAt: number; // unix ms
  /** 6-character uppercase join code shared via SMS */
  joinCode: string;
  savedSpots: SavedSpot[];
  votes: Vote[];
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  emoji: string;
  description?: string;
}

export interface CreateVoteInput {
  question: string;
  options: Omit<VoteOption, "id">[];
  deadlineHours: number; // 24 | 48 | 72
}
