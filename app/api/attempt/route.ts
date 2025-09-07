import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { lesson_id, correct_count, total } = await req.json();

    if (!lesson_id || typeof correct_count !== "number" || typeof total !== "number") {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
    }

    const cookieStore = await cookies(); // ✅ Next 15 expects await here
    const accessToken = cookieStore.get("sb-access-token")?.value ?? "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: auth } = await sb.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

    const { error } = await sb.from("attempts").insert({
      user_id: uid,
      lesson_id,
      correct_count,
      total,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // Update profile points + streak
    const today = new Date().toISOString().slice(0,10);
    const { data: prof } = await sb
      .from("profiles")
      .select("points, streak, last_study_date")
      .eq("id", uid)
      .maybeSingle();
    const last = (prof?.last_study_date as string | null) ?? null;
    let newStreak = 1;
    if (last) {
      const d0 = new Date(today);
      const d1 = new Date(last);
      const diff = Math.floor((+d0 - +d1)/86400000);
      if (diff === 0) newStreak = (prof?.streak as number | null) ?? 1;
      else newStreak = diff === 1 ? (((prof?.streak as number | null) ?? 0) + 1) : 1;
    }
    const addPts = Math.max(0, Number(correct_count) || 0) * 10;
    await sb.from("profiles").update({
      last_study_date: today,
      streak: newStreak,
      points: ((prof?.points as number | null) ?? 0) + addPts,
      updated_at: new Date().toISOString(),
    }).eq("id", uid);

    return new Response(JSON.stringify({ ok: true, addPts, newStreak }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
