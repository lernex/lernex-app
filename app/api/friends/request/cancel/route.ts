import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeRequest, RawRequest } from "../../shared";

export async function POST(req: Request) {
  try {
    const sb = await supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const requestId = typeof payload?.requestId === "string" ? payload.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
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

    if (requestRes.data.sender_id !== user.id) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    if (requestRes.data.status !== "pending") {
      return NextResponse.json({ error: "Request already processed" }, { status: 409 });
    }

    const deleteRes = await sb
      .from("friend_requests")
      .delete()
      .eq("id", requestId)
      .select("id, sender_id, receiver_id, status, message, created_at, resolved_at")
      .maybeSingle();
    if (deleteRes.error) throw deleteRes.error;

    return NextResponse.json({ ok: true, request: normalizeRequest(deleteRes.data as RawRequest) });
  } catch (error) {
    console.error("/api/friends/request/cancel POST error", error);
    return NextResponse.json({ error: "Unable to cancel request" }, { status: 500 });
  }
}
