import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const subject = req.nextUrl.searchParams.get('subject');
  const q = sb
    .from('user_subject_state')
    .select('subject, path')
    .eq('user_id', user.id);
  type Row = { subject: string; path: { topics?: { subtopics?: { completed?: boolean }[] }[] } | null };
  const { data, error } = subject ? await q.eq('subject', subject) : await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const rows = ((data ?? []) as Row[]).map((r) => {
    const topics = r.path?.topics ?? [];
    const total = topics.reduce((s, t) => s + (t.subtopics?.length ?? 0), 0);
    const done = topics.reduce((s, t) => s + (t.subtopics?.filter((x) => x.completed === true)?.length ?? 0), 0);
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { subject: r.subject, total, completed: done, percent };
  });

  if (subject) {
    return new Response(JSON.stringify(rows[0] ?? { subject, total: 0, completed: 0, percent: 0 }), { status: 200 });
  }
  return new Response(JSON.stringify({ items: rows }), { status: 200 });
}
