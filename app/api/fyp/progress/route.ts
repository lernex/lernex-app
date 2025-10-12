import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const subject = req.nextUrl.searchParams.get("subject");
  const stateQuery = sb
    .from("user_subject_state")
    .select("subject, path")
    .eq("user_id", user.id);
  type TopicRow = { name?: string; subtopics?: { name?: string; completed?: boolean }[] };
  type StateRow = { subject: string; path: { topics?: TopicRow[] } | null };
  const { data: stateRows, error: stateError } = subject ? await stateQuery.eq("subject", subject) : await stateQuery;
  if (stateError) return new Response(JSON.stringify({ error: stateError.message }), { status: 500 });

  const progressQuery = sb
    .from("user_subject_progress")
    .select("subject, completion_map")
    .eq("user_id", user.id);
  type ProgressRow = { subject: string; completion_map: Record<string, boolean> | null };
  const { data: progressRows, error: progressError } = subject ? await progressQuery.eq("subject", subject) : await progressQuery;
  if (progressError) return new Response(JSON.stringify({ error: progressError.message }), { status: 500 });

  const progressBySubject = new Map<string, Record<string, boolean>>(
    ((progressRows ?? []) as ProgressRow[]).map((row) => [row.subject, (row.completion_map ?? {}) as Record<string, boolean>])
  );

  const rows = ((stateRows ?? []) as StateRow[]).map((row) => {
    const topics = row.path?.topics ?? [];
    const total = topics.reduce((sum, topic) => sum + ((topic?.subtopics?.length ?? 0)), 0);
    const completionMap = progressBySubject.get(row.subject) ?? {};
    const done = topics.reduce((sum, topic) => {
      const subtopics = topic?.subtopics ?? [];
      return sum + subtopics.reduce((inner, sub) => {
        if (!sub?.name || !topic?.name) return inner;
        const key = `${topic.name} > ${sub.name}`;
        const completed = completionMap[key] ?? sub.completed ?? false;
        return inner + (completed ? 1 : 0);
      }, 0);
    }, 0);
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { subject: row.subject, total, completed: done, percent };
  });

  if (subject) {
    return new Response(JSON.stringify(rows[0] ?? { subject, total: 0, completed: 0, percent: 0 }), { status: 200 });
  }
  return new Response(JSON.stringify({ items: rows }), { status: 200 });
}
