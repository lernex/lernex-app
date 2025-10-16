import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  escapeForILike,
  normalizeForComparison,
  validateUsername,
} from "@/lib/username";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob, theme_pref } = await req.json().catch(() => ({}));
  let normalizedUsername: string | undefined;

  // If username provided, validate + check uniqueness
  if (typeof username === "string" && username.trim()) {
    const validation = validateUsername(username);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message, code: validation.code }, { status: 400 });
    }
    normalizedUsername = validation.normalized;
    const { comparable } = validation;
    const pattern = escapeForILike(normalizedUsername);
    const { data: taken, error: takenError } = await sb
      .from("profiles")
      .select("id, username")
      .neq("id", user.id)
      .ilike("username", pattern)
      .limit(1);
    if (takenError) {
      return NextResponse.json({ error: "Could not validate username." }, { status: 500 });
    }
    const conflict =
      taken?.some(
        (row) =>
          row?.id &&
          typeof row.username === "string" &&
          normalizeForComparison(row.username) === comparable,
      ) ?? false;
    if (conflict) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
  }

  const { error } = await sb.from("profiles").update({
    username: normalizedUsername ?? (typeof username === "string" ? username.trim() || undefined : undefined),
    dob: typeof dob === "string" ? dob : undefined,
    theme_pref: theme_pref === "light" || theme_pref === "dark" ? theme_pref : undefined,
    updated_at: new Date().toISOString(),
  }).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
