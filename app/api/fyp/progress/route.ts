import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const subject = req.nextUrl.searchParams.get("subject");
  const stateQuery = sb
    .from("user_subject_state")
    .select("subject, path, next_topic")
    .eq("user_id", user.id);
  type SubtopicRow = { name?: string; completed?: boolean; mini_lessons?: number | string | null };
  type TopicRow = { name?: string; subtopics?: SubtopicRow[] };
  type StateRow = { subject: string; path: { topics?: TopicRow[] } | null; next_topic: string | null };
  const { data: stateRows, error: stateError } = subject ? await stateQuery.eq("subject", subject) : await stateQuery;
  if (stateError) return new Response(JSON.stringify({ error: stateError.message }), { status: 500 });

  const progressQuery = sb
    .from("user_subject_progress")
    .select("subject, topic_idx, subtopic_idx, delivered_mini, completion_map")
    .eq("user_id", user.id);
  type ProgressRow = {
    subject: string;
    topic_idx: number | null;
    subtopic_idx: number | null;
    delivered_mini: number | null;
    completion_map: Record<string, boolean> | null;
  };
  const { data: progressRows, error: progressError } = subject ? await progressQuery.eq("subject", subject) : await progressQuery;
  if (progressError) return new Response(JSON.stringify({ error: progressError.message }), { status: 500 });

  const progressBySubject = new Map<string, ProgressRow>(
    ((progressRows ?? []) as ProgressRow[]).map((row) => [row.subject, row])
  );

  const rows = ((stateRows ?? []) as StateRow[]).map((row) => {
    const topics = row.path?.topics ?? [];
    const total = topics.reduce((sum, topic) => sum + ((topic?.subtopics?.length ?? 0)), 0);
    const progressRow = progressBySubject.get(row.subject);
    const completionMap = (progressRow?.completion_map ?? {}) as Record<string, boolean>;
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
    const topicCount = topics.length;
    const topicIdxRaw = typeof progressRow?.topic_idx === "number" && Number.isFinite(progressRow?.topic_idx) ? progressRow!.topic_idx! : 0;
    const topicIdx = Math.max(0, Math.min(topicCount > 0 ? topicCount - 1 : 0, topicIdxRaw));
    const topicEntry = topics[topicIdx] ?? null;
    const subtopics = topicEntry?.subtopics ?? [];
    const subtopicCount = subtopics.length;
    const subIdxRaw = typeof progressRow?.subtopic_idx === "number" && Number.isFinite(progressRow?.subtopic_idx) ? progressRow!.subtopic_idx! : 0;
    const subtopicIdx = Math.max(0, Math.min(subtopicCount > 0 ? subtopicCount - 1 : 0, subIdxRaw));
    const subtopicEntry = subtopics[subtopicIdx] ?? null;

    const topicName = typeof topicEntry?.name === "string" ? topicEntry.name : null;
    const subtopicName = typeof subtopicEntry?.name === "string" ? subtopicEntry.name : null;
    const currentLabel = topicName && subtopicName ? `${topicName} > ${subtopicName}` : null;
    const nextLabel = typeof row.next_topic === "string" && row.next_topic.trim() ? row.next_topic.trim() : null;
    const miniPlannedRaw = subtopicEntry?.mini_lessons;
    const plannedParsed = Number(miniPlannedRaw);
    const miniPlanned = Math.max(1, Number.isFinite(plannedParsed) && plannedParsed > 0 ? plannedParsed : 1);
    const deliveredParsed = Number(progressRow?.delivered_mini ?? 0);
    const miniDelivered = Number.isFinite(deliveredParsed) && deliveredParsed > 0 ? deliveredParsed : 0;
    const clampedDelivered = Math.min(miniDelivered, miniPlanned);
    const doneInTopic = topicEntry?.subtopics?.reduce((acc, sub) => {
      if (!topicEntry?.name || !sub?.name) return acc;
      const key = `${topicEntry.name} > ${sub.name}`;
      return acc + ((completionMap[key] ?? sub.completed ?? false) ? 1 : 0);
    }, 0) ?? 0;
    const topicPercent = subtopicCount > 0 ? Math.round((doneInTopic / subtopicCount) * 100) : 0;

    return {
      subject: row.subject,
      total,
      completed: done,
      percent,
      topicIndex: topicCount > 0 ? topicIdx + 1 : 0,
      topicCount,
      subtopicIndex: subtopicCount > 0 ? subtopicIdx + 1 : 0,
      subtopicCount,
      topicName,
      subtopicName,
      currentLabel,
      nextLabel,
      miniLessonsDelivered: clampedDelivered,
      miniLessonsPlanned: miniPlanned,
      topicPercent,
      topicCompleted: doneInTopic,
    };
  });

  if (subject) {
    const fallbackRow = {
      subject,
      total: 0,
      completed: 0,
      percent: 0,
      topicIndex: 0,
      topicCount: 0,
      subtopicIndex: 0,
      subtopicCount: 0,
      topicName: null,
      subtopicName: null,
      currentLabel: null,
      nextLabel: null,
      miniLessonsDelivered: 0,
      miniLessonsPlanned: 1,
      topicPercent: 0,
      topicCompleted: 0,
    };
    return new Response(JSON.stringify(rows[0] ?? fallbackRow), { status: 200 });
  }
  return new Response(JSON.stringify({ items: rows }), { status: 200 });
}
