import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validate(name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 3) return { ok: false, reason: "Too short (min 3)" };
  if (trimmed.length > 20) return { ok: false, reason: "Too long (max 20)" };
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return { ok: false, reason: "Letters, numbers, _ only" };
  return { ok: true, value: trimmed } as const;
}

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const url = new URL(req.url);
  const username = url.searchParams.get("username") || url.searchParams.get("u") || "";

  const v = validate(username);
  if (!v.ok) return NextResponse.json({ available: false, reason: v.reason }, { headers: { "Cache-Control": "no-store" } });

  const name = v.ok ? (v as { ok: true; value: string }).value : "";
  const { data } = await sb
    .from("profiles")
    .select("id")
    .eq("username", name)
    .limit(1);

  const takenByOther = (data?.[0]?.id && data[0].id !== user?.id) ? true : false;
  return NextResponse.json({ available: !takenByOther }, { headers: { "Cache-Control": "no-store" } });
}
