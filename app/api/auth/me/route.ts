import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseServer();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error) return NextResponse.json({ authenticated: false }, { status: 200 });
  return NextResponse.json({ authenticated: !!user });
}
