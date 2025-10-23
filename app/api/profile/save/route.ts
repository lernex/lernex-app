import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { Database } from "@/lib/types_db";
import {
  escapeForILike,
  normalizeForComparison,
  validateUsername,
} from "@/lib/username";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob } = await req.json().catch(() => ({}));

  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }
  if (!dob || typeof dob !== "string") {
    return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
  }

  const validation = validateUsername(username);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, code: validation.code }, { status: 400 });
  }
  const cleanUsername = validation.normalized;
  const { comparable } = validation;
  const cleanDob = dob.trim();

  if (!cleanDob) {
    return NextResponse.json({ error: "Invalid dob" }, { status: 400 });
  }

  // Check uniqueness (exclude current user)
  const pattern = escapeForILike(cleanUsername);
  const { data: taken, error: takenError } = await sb
    .from("profiles")
    .select("id, username")
    .neq("id", user.id)
    .ilike("username", pattern)
    .limit(1);

  if (takenError) {
    return NextResponse.json({ error: "Could not validate username" }, { status: 500 });
  }

  if (taken && taken.length > 0) {
    const conflict =
      taken.some(
        (row) =>
          row?.id &&
          typeof row.username === "string" &&
          normalizeForComparison(row.username) === comparable,
      );
    if (conflict) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
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
