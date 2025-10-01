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

type Action = "accept" | "decline";

export async function POST(req: Request) {
  try {
    const sb = supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const requestId = typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
    const action = typeof payload?.action === "string" ? (payload.action.trim().toLowerCase() as Action) : "";

    if (!requestId || (action !== "accept" && action !== "decline")) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const requestRes = await sb
      .from("friend_requests")
      .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
      .eq("id", requestId)
      .maybeSingle();
    if (requestRes.error) throw requestRes.error;
    if (!requestRes.data) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (requestRes.data.receiver_id !== user.id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    if (requestRes.data.status !== "pending") {
      return NextResponse.json({ error: "Request already handled" }, { status: 409 });
    }

    const counterpartId = requestRes.data.sender_id;

    const counterpartRes = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at")
      .eq("id", counterpartId)
      .maybeSingle();
    if (counterpartRes.error) throw counterpartRes.error;
    if (!counterpartRes.data) {
      return NextResponse.json({ error: "Sender profile missing" }, { status: 404 });
    }

    const updateRes = await sb
      .from("friend_requests")
      .update({
        status: action,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
      .maybeSingle();
    if (updateRes.error) throw updateRes.error;

    const normalizedRequest = normalizeRequest(updateRes.data as RawRequest);
    const counterpartProfile = normalizeProfile(counterpartRes.data as RawProfile);

    if (!counterpartProfile) {
      return NextResponse.json({ error: "Sender profile incomplete" }, { status: 500 });
    }

    if (action === "decline") {
      return NextResponse.json({ ok: true, request: normalizedRequest, counterpart: counterpartProfile });
    }

    const pairFilter =
      "and(user_a.eq." +
      user.id +
      ",user_b.eq." +
      counterpartId +
      "),and(user_a.eq." +
      counterpartId +
      ",user_b.eq." +
      user.id +")";

    const existingFriendship = await sb
      .from("friendships")
      .select("id, user_a, user_b, created_at, last_interaction_at")
      .or(pairFilter)
      .limit(1);
    if (existingFriendship.error) throw existingFriendship.error;

    let friendshipRecord = existingFriendship.data?.[0] ?? null;

    if (!friendshipRecord) {
      const insertRes = await sb
        .from("friendships")
        .insert({
          user_a: user.id,
          user_b: counterpartId,
          last_interaction_at: new Date().toISOString(),
        })
        .select("id, user_a, user_b, created_at, last_interaction_at")
        .maybeSingle();
      if (insertRes.error) throw insertRes.error;
      friendshipRecord = insertRes.data;
    }

    const friendship = friendshipRecord
      ? normalizeFriendship(friendshipRecord as RawFriendship)
      : null;

    return NextResponse.json({
      ok: true,
      request: normalizedRequest,
      friendship,
      counterpart: counterpartProfile,
    });
  } catch (error) {
    console.error("/api/friends/respond POST error", error);
    return NextResponse.json({ error: "Unable to update friend request" }, { status: 500 });
  }
}
