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
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
