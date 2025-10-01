export type Nullable<T> = T | null;

export type RawProfile = {
  id?: unknown;
  username?: unknown;
  full_name?: unknown;
  avatar_url?: unknown;
  streak?: unknown;
  points?: unknown;
  last_study_date?: unknown;
  interests?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export type RawFriendship = {
  id?: unknown;
  user_a?: unknown;
  user_b?: unknown;
  created_at?: unknown;
  last_interaction_at?: unknown;
};

export type RawRequest = {
  id?: unknown;
  sender_id?: unknown;
  receiver_id?: unknown;
  status?: unknown;
  message?: unknown;
  created_at?: unknown;
  resolved_at?: unknown;
};

export type RawAttempt = {
  user_id?: unknown;
  subject?: unknown;
  level?: unknown;
  correct_count?: unknown;
  total?: unknown;
  created_at?: unknown;
};

export type ProfileSummary = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  streak: number;
  points: number;
  lastStudyDate: string | null;
  interests: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type FriendshipSummary = {
  id: string;
  userA: string;
  userB: string;
  createdAt: string | null;
  lastInteractionAt: string | null;
};

export type FriendRequestSummary = {
  id: string;
  senderId: string;
  receiverId: string;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
};

export type AttemptSummary = {
  userId: string;
  subject: string | null;
  level: string | null;
  correct: number | null;
  total: number | null;
  createdAt: string | null;
};

export function toStr(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export function toStrOrNull(value: unknown): string | null {
  return value == null ? null : toStr(value);
}

export function toNumOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : null))
    .filter((item): item is string => !!item && item.trim().length > 0)
    .map((item) => item.trim());
}

export function normalizeProfile(row: Nullable<RawProfile>): ProfileSummary | null {
  if (!row) return null;
  const id = row.id ? toStr(row.id) : null;
  if (!id) return null;
  return {
    id,
    username: toStrOrNull(row.username),
    fullName: toStrOrNull(row.full_name),
    avatarUrl: toStrOrNull(row.avatar_url),
    streak: toNumOrNull(row.streak) ?? 0,
    points: toNumOrNull(row.points) ?? 0,
    lastStudyDate: toStrOrNull(row.last_study_date),
    interests: toStringArray(row.interests),
    createdAt: toStrOrNull(row.created_at),
    updatedAt: toStrOrNull(row.updated_at),
  };
}

export function normalizeFriendship(row: Nullable<RawFriendship>): FriendshipSummary | null {
  if (!row) return null;
  const id = row.id ? toStr(row.id) : null;
  const userA = row.user_a ? toStr(row.user_a) : null;
  const userB = row.user_b ? toStr(row.user_b) : null;
  if (!id || !userA || !userB) return null;
  return {
    id,
    userA,
    userB,
    createdAt: toStrOrNull(row.created_at),
    lastInteractionAt: toStrOrNull(row.last_interaction_at),
  };
}

export function normalizeRequest(row: Nullable<RawRequest>): FriendRequestSummary | null {
  if (!row) return null;
  const id = row.id ? toStr(row.id) : null;
  const senderId = row.sender_id ? toStr(row.sender_id) : null;
  const receiverId = row.receiver_id ? toStr(row.receiver_id) : null;
  if (!id || !senderId || !receiverId) return null;
  const statusRaw = toStr(row.status ?? "pending").toLowerCase();
  const status: FriendRequestSummary["status"] =
    statusRaw === "accepted" || statusRaw === "declined" ? (statusRaw as FriendRequestSummary["status"]) : "pending";
  return {
    id,
    senderId,
    receiverId,
    status,
    message: toStrOrNull(row.message),
    createdAt: toStrOrNull(row.created_at),
    resolvedAt: toStrOrNull(row.resolved_at),
  };
}

export function normalizeAttempt(row: Nullable<RawAttempt>): AttemptSummary | null {
  if (!row) return null;
  const userId = row.user_id ? toStr(row.user_id) : null;
  if (!userId) return null;
  return {
    userId,
    subject: toStrOrNull(row.subject),
    level: toStrOrNull(row.level),
    correct: toNumOrNull(row.correct_count),
    total: toNumOrNull(row.total),
    createdAt: toStrOrNull(row.created_at),
  };
}
