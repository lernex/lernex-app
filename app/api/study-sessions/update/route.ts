import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const sb = supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
    const status = typeof payload?.status === "string" ? payload.status : "";

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }
    if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Fetch the session to verify permissions
    const { data: session, error: fetchError } = await sb
      .from("study_sessions")
      .select("id, organizer_id, friend_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Only allow organizer or friend to update status
    if (session.organizer_id !== user.id && session.friend_id !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Update the session
    const { data: updatedSession, error: updateError } = await sb
      .from("study_sessions")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", sessionId)
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

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, session: updatedSession });
  } catch (error) {
    console.error("/api/study-sessions/update POST error", error);
    return NextResponse.json({ error: "Unable to update study session" }, { status: 500 });
  }
}
