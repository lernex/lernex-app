import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  normalizeProfile,
  normalizeFriendship,
  normalizeRequest,
  normalizeAttempt,
  RawProfile,
  RawFriendship,
  RawRequest,
  RawAttempt,
  ProfileSummary,
  FriendRequestSummary,
} from "./shared";

function buildSharedInterestExtractor(profile: ProfileSummary) {
  return (other: ProfileSummary | null) => {
    if (!other) return [] as string[];
    if (!profile.interests.length || !other.interests.length) return [] as string[];
    const mine = new Set(profile.interests.map((item) => item.toLowerCase()));
    const shared = new Set<string>();
    other.interests.forEach((interest) => {
      const key = interest.toLowerCase();
      if (mine.has(key)) shared.add(interest);
    });
    return Array.from(shared);
  };
}

export async function GET() {
  try {
    const sb = supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    if (!authState.data.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = authState.data.user.id;
    const filterSelfFriend = "user_a.eq." + userId + ",user_b.eq." + userId;

    const [profileRes, friendshipsRes, incomingReqRes, outgoingReqRes] = await Promise.all([
      sb
        .from("profiles")
        .select(
          "id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at"
        )
        .eq("id", userId)
        .maybeSingle(),
      sb
        .from("friendships")
        .select("id, user_a, user_b, created_at, last_interaction_at")
        .or(filterSelfFriend),
      sb
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
        .eq("receiver_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      sb
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
        .eq("sender_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (!profileRes.data) {
      return NextResponse.json({ error: "Profile missing" }, { status: 404 });
    }
    if (friendshipsRes.error) throw friendshipsRes.error;
    if (incomingReqRes.error) throw incomingReqRes.error;
    if (outgoingReqRes.error) throw outgoingReqRes.error;

    const profile = normalizeProfile(profileRes.data as RawProfile);
    if (!profile) {
      return NextResponse.json({ error: "Profile missing" }, { status: 404 });
    }

    const sharedInterest = buildSharedInterestExtractor(profile);

    const friendships = (friendshipsRes.data ?? [])
      .map((row) => normalizeFriendship(row as RawFriendship))
      .filter((row): row is NonNullable<typeof row> => !!row);

    const friendIdSet = new Set<string>();
    const connectionMap = new Map<string, { id: string; createdAt: string | null; lastInteractionAt: string | null }>();
    friendships.forEach((link) => {
      const friendId = link.userA === userId ? link.userB : link.userA;
      if (!friendId) return;
      friendIdSet.add(friendId);
      const current = connectionMap.get(friendId);
      if (!current || (link.createdAt && (!current.createdAt || link.createdAt < current.createdAt))) {
        connectionMap.set(friendId, {
          id: link.id,
          createdAt: link.createdAt,
          lastInteractionAt: link.lastInteractionAt,
        });
      }
    });

    const incomingRequests = (incomingReqRes.data ?? [])
      .map((row) => normalizeRequest(row as RawRequest))
      .filter((row): row is NonNullable<typeof row> => !!row);
    const outgoingRequests = (outgoingReqRes.data ?? [])
      .map((row) => normalizeRequest(row as RawRequest))
      .filter((row): row is NonNullable<typeof row> => !!row);

    const requestCounterparts = new Set<string>();
    incomingRequests.forEach((req) => requestCounterparts.add(req.senderId));
    outgoingRequests.forEach((req) => requestCounterparts.add(req.receiverId));

    const friendIds = Array.from(friendIdSet);
    const counterpartIds = Array.from(requestCounterparts);
    const profileLookupIds = Array.from(new Set([...friendIds, ...counterpartIds]));

    const mutualPromise = friendIds.length
      ? (async () => {
          const universe = Array.from(new Set([userId, ...friendIds]));
          const list = universe.join(",");
          if (!list) return { data: [], error: null } as const;
          const filter = "user_a.in.(" + list + "),user_b.in.(" + list + ")";
          return await sb
            .from("friendships")
            .select("user_a, user_b")
            .or(filter);
        })()
      : Promise.resolve({ data: [], error: null });

    const suggestionPromise = sb
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at"
      )
      .neq("id", userId)
      .order("points", { ascending: false })
      .limit(32);

    const [friendProfilesRes, attemptRes, mutualRes, suggestionRes] = await Promise.all([
      profileLookupIds.length
        ? sb
            .from("profiles")
            .select(
              "id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at"
            )
            .in("id", profileLookupIds)
        : Promise.resolve({ data: [], error: null }),
      friendIds.length
        ? sb
            .from("attempts")
            .select("user_id, subject, level, correct_count, total, created_at")
            .in("user_id", friendIds)
            .order("created_at", { ascending: false })
            .limit(Math.min(60, Math.max(friendIds.length * 4, 12)))
        : Promise.resolve({ data: [], error: null }),
      mutualPromise,
      suggestionPromise,
    ]);

    if (friendProfilesRes.error) throw friendProfilesRes.error;
    if (attemptRes.error) throw attemptRes.error;
    const mutualError = (mutualRes as { error?: unknown }).error;
    if (mutualError) {
      console.warn("/api/friends mutual lookup", mutualError);
    }
    if (suggestionRes.error) {
      console.warn("/api/friends suggestion lookup", suggestionRes.error);
    }

    const friendProfilesMap = new Map<string, ProfileSummary>();
    (friendProfilesRes.data ?? []).forEach((row) => {
      const normalized = normalizeProfile(row as RawProfile);
      if (normalized) friendProfilesMap.set(normalized.id, normalized);
    });

    const mutualCounts = new Map<string, number>();
    const mutualData = (mutualRes.error ? [] : mutualRes.data) ?? [];
    if (mutualData) {
      (mutualData as RawFriendship[]).forEach((row) => {
        const link = normalizeFriendship(row);
        if (!link) return;
        const isDirect = link.userA === userId || link.userB === userId;
        if (isDirect) return;
        const aIsFriend = friendIdSet.has(link.userA);
        const bIsFriend = friendIdSet.has(link.userB);
        if (aIsFriend && bIsFriend) {
          mutualCounts.set(link.userA, (mutualCounts.get(link.userA) ?? 0) + 1);
          mutualCounts.set(link.userB, (mutualCounts.get(link.userB) ?? 0) + 1);
        }
      });
    }

    const friends = friendIds.map((friendId) => {
      const base = friendProfilesMap.get(friendId) ?? null;
      const connection = connectionMap.get(friendId) ?? null;
      return {
        id: friendId,
        username: base?.username ?? null,
        fullName: base?.fullName ?? null,
        avatarUrl: base?.avatarUrl ?? null,
        streak: base?.streak ?? 0,
        points: base?.points ?? 0,
        lastStudyDate: base?.lastStudyDate ?? null,
        createdAt: base?.createdAt ?? null,
        friendSince: connection?.createdAt ?? null,
        lastInteractionAt: connection?.lastInteractionAt ?? null,
        mutualFriends: mutualCounts.get(friendId) ?? 0,
        sharedInterests: sharedInterest(base ?? null),
      };
    });

    const recentActivity = (attemptRes.data ?? [])
      .map((row) => normalizeAttempt(row as RawAttempt))
      .filter((row): row is NonNullable<typeof row> => !!row && friendIdSet.has(row.userId))
      .slice(0, 20)
      .map((item) => {
        const base = friendProfilesMap.get(item.userId);
        const totalQuestions = item.total ?? null;
        const accuracy = totalQuestions && totalQuestions > 0 && item.correct != null
          ? Math.round(((item.correct ?? 0) / totalQuestions) * 100)
          : null;
        return {
          userId: item.userId,
          username: base?.username ?? null,
          fullName: base?.fullName ?? null,
          avatarUrl: base?.avatarUrl ?? null,
          createdAt: item.createdAt,
          subject: item.subject,
          level: item.level,
          accuracy,
        };
      });

    const withCounterpart = (
      request: FriendRequestSummary,
      direction: "incoming" | "outgoing"
    ) => {
      const counterpartId = direction === "incoming" ? request.senderId : request.receiverId;
      const base = friendProfilesMap.get(counterpartId) ?? null;
      return {
        ...request,
        direction,
        counterpart: {
          id: counterpartId,
          username: base?.username ?? null,
          fullName: base?.fullName ?? null,
          avatarUrl: base?.avatarUrl ?? null,
          streak: base?.streak ?? 0,
          points: base?.points ?? 0,
          sharedInterests: sharedInterest(base),
        },
      };
    };

    const incoming = incomingRequests
      .map((req) => withCounterpart(req, "incoming"))
      .filter((req) => !!req.counterpart.id);
    const outgoing = outgoingRequests
      .map((req) => withCounterpart(req, "outgoing"))
      .filter((req) => !!req.counterpart.id);

    const excludeSet = new Set<string>([userId, ...friendIds, ...counterpartIds]);
    const suggestions = ((suggestionRes.error ? [] : suggestionRes.data) ?? [])
      .map((row) => normalizeProfile(row as RawProfile))
      .filter((row): row is ProfileSummary => !!row && row.id !== userId)
      .filter((candidate) => !excludeSet.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        username: candidate.username,
        fullName: candidate.fullName,
        avatarUrl: candidate.avatarUrl,
        streak: candidate.streak,
        points: candidate.points,
        sharedInterests: sharedInterest(candidate),
        lastStudyDate: candidate.lastStudyDate,
      }))
      .slice(0, 12);

    return NextResponse.json({
      profile,
      friends,
      requests: { incoming, outgoing },
      suggestions,
      recentActivity,
      counts: {
        totalFriends: friends.length,
        pendingIncoming: incoming.length,
        pendingOutgoing: outgoing.length,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("/api/friends GET error", error);
    return NextResponse.json({ error: "Failed to load friends" }, { status: 500 });
  }
}
