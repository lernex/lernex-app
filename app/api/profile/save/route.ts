import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { Database } from "@/lib/types_db";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob } = await req.json().catch(() => ({}));

  if (!username || typeof username !== "string" || username.trim().length < 3) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }
  if (!dob || typeof dob !== "string") {
    return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
  }

  const cleanUsername = username.trim();
  const cleanDob = dob.trim();

  if (!cleanDob) {
    return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
  }

  // Check uniqueness (exclude current user)
  const { data: taken } = await sb
    .from("profiles")
    .select("id")
    .eq("username", cleanUsername)
    .neq("id", user.id)
    .limit(1);

  if (taken && taken.length > 0) {
    return NextResponse.json({ error: "Username already taken" }, { status: 409 });
  }

  const ensure = await sb
    .from("profiles")
    .insert({ id: user.id, total_cost: 0 })
    .select("id")
    .maybeSingle();

  if (ensure.error && ensure.error.code !== "23505") {
    return NextResponse.json({ error: ensure.error.message }, { status: 500 });
  }

  const isNewProfile = !ensure.error;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaFullName = typeof meta["full_name"] === "string" ? meta["full_name"] : typeof meta["name"] === "string" ? meta["name"] : null;
  const metaAvatar = typeof meta["avatar_url"] === "string" ? meta["avatar_url"] : typeof meta["picture"] === "string" ? meta["picture"] : null;

  const payload: Database["public"]["Tables"]["profiles"]["Update"] = {
    username: cleanUsername,
    dob: cleanDob,
    updated_at: new Date().toISOString(),
  };

  if (isNewProfile && metaFullName && String(metaFullName).trim()) {
    payload.full_name = String(metaFullName).trim();
  }
  if (isNewProfile && metaAvatar && String(metaAvatar).trim()) {
    payload.avatar_url = String(metaAvatar).trim();
  }

  const { error } = await sb
    .from("profiles")
    .update(payload)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
