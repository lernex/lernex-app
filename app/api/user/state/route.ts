import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const subject = req.nextUrl.searchParams.get("subject");
  if (!subject) {
    return new Response(JSON.stringify({ error: "Subject parameter is required" }), { status: 400 });
  }

  const { data, error } = await sb
    .from("user_subject_state")
    .select("subject, path, next_topic")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!data) {
    return new Response(
      JSON.stringify({
        subject,
        path: { topics: [] },
        next_topic: null,
      }),
      { status: 200 }
    );
  }

  return new Response(JSON.stringify(data), { status: 200 });
}
