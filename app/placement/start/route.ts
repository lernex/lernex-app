import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  // derive a base URL safely (works on Vercel + dev)
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  await sb.from("profiles").update({ placement_ready: false }).eq("id", user.id);
  return NextResponse.redirect(new URL("/app", origin));
}
