import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  escapeForILike,
  normalizeForComparison,
  validateUsername,
} from "@/lib/username";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const url = new URL(req.url);
  const username = url.searchParams.get("username") || url.searchParams.get("u") || "";

  const headers = { "Cache-Control": "no-store" } as const;
  const validation = validateUsername(username);
  if (!validation.ok) {
    return NextResponse.json(
      {
        available: false,
        reason: validation.code,
        message: validation.message,
      },
      { headers },
    );
  }

  const { normalized, comparable } = validation;
  const pattern = escapeForILike(normalized);

  const { data, error } = await sb
    .from("profiles")
    .select("id, username")
    .ilike("username", pattern)
    .limit(1);

  if (error) {
    return NextResponse.json(
      {
        available: false,
        reason: "error",
        message: "Could not verify username right now.",
      },
      { status: 500, headers },
    );
  }

  const takenByOther =
    data?.some(
      (row) =>
        row?.id &&
        row.id !== user?.id &&
        typeof row.username === "string" &&
        normalizeForComparison(row.username) === comparable,
    ) ?? false;

  if (takenByOther) {
    return NextResponse.json(
      {
        available: false,
        reason: "taken",
        message: "Username already taken.",
      },
      { headers },
    );
  }

  return NextResponse.json({ available: true }, { headers });
}
