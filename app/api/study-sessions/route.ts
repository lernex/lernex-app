import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  try {
    const sb = await supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const now = new Date().toISOString();

    // Fetch sessions where the user is either organizer or participant
    const { data: sessions, error } = await sb
      .from("study_sessions")
      .select(`
        id,
        organizer_id,
        friend_id,
        title,
        description,
        subject,
        topics,
        scheduled_at,
        duration_minutes,
        status,
        created_at,
        updated_at,
        organizer:organizer_id(id, username, full_name, avatar_url),
        friend:friend_id(id, username, full_name, avatar_url)
      `)
      .or(`organizer_id.eq.${user.id},friend_id.eq.${user.id}`)
      .gte("scheduled_at", now)
      .in("status", ["pending", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ sessions: sessions || [] });
  } catch (error) {
    console.error("/api/study-sessions GET error", error);
    return NextResponse.json({ error: "Unable to fetch study sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const friendId = typeof payload?.friendId === "string" ? payload.friendId.trim() : "";
    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    const description = typeof payload?.description === "string" ? payload.description.trim() : null;
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : null;
    const topics = Array.isArray(payload?.topics) ? payload.topics : null;
    const scheduledAt = typeof payload?.scheduledAt === "string" ? payload.scheduledAt : "";
    const durationMinutes = typeof payload?.durationMinutes === "number" ? payload.durationMinutes : 60;

    if (!friendId) {
      return NextResponse.json({ error: "Friend ID is required" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Session title is required" }, { status: 400 });
    }
    if (!scheduledAt) {
      return NextResponse.json({ error: "Scheduled time is required" }, { status: 400 });
    }

    // Verify they are friends
    const pairFilter =
      "and(user_a.eq." +
      user.id +
      ",user_b.eq." +
      friendId +
      "),and(user_a.eq." +
      friendId +
      ",user_b.eq." +
      user.id +
      ")";

    const { data: friendship, error: friendshipError } = await sb
      .from("friendships")
      .select("id")
      .or(pairFilter)
      .maybeSingle();

    if (friendshipError) throw friendshipError;
    if (!friendship) {
      return NextResponse.json({ error: "You can only schedule sessions with friends" }, { status: 403 });
    }

    // Create the study session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error: insertError } = await (sb as any)
      .from("study_sessions")
      .insert({
        organizer_id: user.id,
        friend_id: friendId,
        title: title.slice(0, 200),
        description: description ? description.slice(0, 1000) : null,
        subject,
        topics,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes,
        status: "pending",
      })
      .select(`
        id,
        organizer_id,
        friend_id,
        title,
        description,
        subject,
        topics,
        scheduled_at,
        duration_minutes,
        status,
        created_at,
        updated_at
      `)
      .maybeSingle();

    if (insertError) throw insertError;

    return NextResponse.json({ ok: true, session });
  } catch (error) {
    console.error("/api/study-sessions POST error", error);
    return NextResponse.json({ error: "Unable to create study session" }, { status: 500 });
  }
}
