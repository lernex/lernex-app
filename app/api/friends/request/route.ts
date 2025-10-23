import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  normalizeProfile,
  normalizeFriendship,
  normalizeRequest,
  RawProfile,
  RawFriendship,
  RawRequest,
} from "../shared";

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const targetId = typeof payload?.targetId === "string" ? payload.targetId.trim() : "";
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";

    if (!targetId) {
      return NextResponse.json({ error: "Missing targetId" }, { status: 400 });
    }
    if (targetId === user.id) {
      return NextResponse.json({ error: "You cannot add yourself" }, { status: 400 });
    }

    const targetRes = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at")
      .eq("id", targetId)
      .maybeSingle();
    if (targetRes.error) throw targetRes.error;
    if (!targetRes.data) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const pairFilter =
      "and(user_a.eq." +
      user.id +
      ",user_b.eq." +
      targetId +
      "),and(user_a.eq." +
      targetId +
      ",user_b.eq." +
      user.id +")";

    const existingFriendship = await sb
      .from("friendships")
      .select("id")
      .or(pairFilter)
      .limit(1);
    if (existingFriendship.error) throw existingFriendship.error;
    if ((existingFriendship.data?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Already friends" }, { status: 409 });
    }

    const incoming = await sb
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
      .eq("sender_id", targetId)
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (incoming.error) throw incoming.error;

    const targetProfile = normalizeProfile(targetRes.data as RawProfile);
    if (!targetProfile) {
      return NextResponse.json({ error: "User profile incomplete" }, { status: 500 });
    }

    if (incoming.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accept = await (sb as any)
        .from("friend_requests")
        .update({ status: "accepted", resolved_at: new Date().toISOString() })
        .eq("id", incoming.data.id)
        .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
        .maybeSingle();
      if (accept.error) throw accept.error;
      const normalizedRequest = normalizeRequest(accept.data as RawRequest);

      const friendshipInsert = await sb
        .from("friendships")
        .insert({
          user_a: user.id,
          user_b: targetId,
          last_interaction_at: new Date().toISOString(),
        })
        .select("id, user_a, user_b, created_at, last_interaction_at")
        .maybeSingle();
      if (friendshipInsert.error) throw friendshipInsert.error;

      const friendship = normalizeFriendship(friendshipInsert.data as RawFriendship);

      return NextResponse.json({
        ok: true,
        autoAccepted: true,
        request: normalizedRequest,
        friendship,
        counterpart: targetProfile,
      });
    }

    const existingOutgoing = await sb
      .from("friend_requests")
      .select("id, status")
      .eq("sender_id", user.id)
      .eq("receiver_id", targetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingOutgoing.error) throw existingOutgoing.error;
    if (existingOutgoing.data && (existingOutgoing.data as { status?: string }).status === "pending") {
      return NextResponse.json({ error: "Request already sent" }, { status: 409 });
    }

    const insertRes = await sb
      .from("friend_requests")
      .insert({
        sender_id: user.id,
        receiver_id: targetId,
        message: message ? message.slice(0, 280) : null,
      })
      .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
      .maybeSingle();
    if (insertRes.error) throw insertRes.error;

    const normalizedRequest = normalizeRequest(insertRes.data as RawRequest);

    return NextResponse.json({
      ok: true,
      request: normalizedRequest,
      counterpart: targetProfile,
    });
  } catch (error) {
    console.error("/api/friends/request POST error", error);
    return NextResponse.json({ error: "Unable to send friend request" }, { status: 500 });
  }
}
