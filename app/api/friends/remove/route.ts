import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeFriendship, normalizeProfile, RawFriendship, RawProfile } from "../shared";

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const friendId = typeof payload?.friendId === "string" ? payload.friendId.trim() : "";

    if (!friendId) {
      return NextResponse.json({ error: "Missing friendId" }, { status: 400 });
    }

    const pairFilter =
      "and(user_a.eq." +
      user.id +
      ",user_b.eq." +
      friendId +
      "),and(user_a.eq." +
      friendId +
      ",user_b.eq." +
      user.id +")";

    const deleteRes = await sb
      .from("friendships")
      .delete()
      .or(pairFilter)
      .select("id, user_a, user_b, created_at, last_interaction_at");
    if (deleteRes.error) throw deleteRes.error;
    if (!deleteRes.data || deleteRes.data.length === 0) {
      return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
    }

    await sb
      .from("friend_requests")
      .delete()
      .or(
        "and(sender_id.eq." +
          user.id +
          ",receiver_id.eq." +
          friendId +
          "),and(sender_id.eq." +
          friendId +
          ",receiver_id.eq." +
          user.id +")"
      );

    const friendProfileRes = await sb
      .from("profiles")
      .select("id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at")
      .eq("id", friendId)
      .maybeSingle();
    if (friendProfileRes.error) throw friendProfileRes.error;

    return NextResponse.json({
      ok: true,
      removed: deleteRes.data.map((row) => normalizeFriendship(row as RawFriendship)),
      counterpart: normalizeProfile(friendProfileRes.data as unknown as RawProfile),
    });
  } catch (error) {
    console.error("/api/friends/remove POST error", error);
    return NextResponse.json({ error: "Unable to remove friend" }, { status: 500 });
  }
}
