import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { Database } from "@/lib/types_db";
import {
  escapeForILike,
  normalizeForComparison,
  validateUsername,
} from "@/lib/username";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { username, dob, theme_pref, first_name, last_name } = await req.json().catch(() => ({}));
  let normalizedUsername: string | undefined;
  let trimmedFirstName: string | undefined;
  let trimmedLastName: string | undefined;
  let fullNameUpdate: string | null | undefined;

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

  const updatingFirstName = typeof first_name === "string";
  const updatingLastName = typeof last_name === "string";

  if (updatingFirstName || updatingLastName) {
    trimmedFirstName = updatingFirstName ? first_name.trim() : "";
    trimmedLastName = updatingLastName ? last_name.trim() : "";
    if (trimmedLastName && !trimmedFirstName) {
      return NextResponse.json(
        { error: "First name is required when providing a last name." },
        { status: 400 },
      );
    }
    if (trimmedFirstName || trimmedLastName) {
      fullNameUpdate = trimmedLastName ? `${trimmedFirstName} ${trimmedLastName}` : trimmedFirstName;
    } else {
      fullNameUpdate = null;
    }
  }

  const updatePayload: Database["public"]["Tables"]["profiles"]["Update"] = {
    username:
      normalizedUsername ??
      (typeof username === "string" ? username.trim() || undefined : undefined),
    dob: typeof dob === "string" ? dob : undefined,
    theme_pref: theme_pref === "light" || theme_pref === "dark" ? theme_pref : undefined,
    updated_at: new Date().toISOString(),
  };

  if (updatingFirstName || updatingLastName) {
    updatePayload.full_name = fullNameUpdate;
  }

  const { error } = await sb.from("profiles").update(updatePayload).eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (updatingFirstName || updatingLastName) {
    const { error: authError } = await sb.auth.updateUser({
      data: {
        full_name: fullNameUpdate ?? null,
        name: fullNameUpdate ?? null,
        first_name: trimmedFirstName && trimmedFirstName.length > 0 ? trimmedFirstName : null,
        last_name: trimmedLastName && trimmedLastName.length > 0 ? trimmedLastName : null,
      },
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
