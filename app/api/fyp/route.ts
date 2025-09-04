import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { LearningPath } from "@/lib/learning-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const subjectParam = req.nextUrl.searchParams.get("subject");

  let subject = subjectParam || null;
  if (!subject) {
    const { data: first } = await sb
      .from("user_subject_state")
      .select("subject")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    subject = first?.subject ?? null;
  }
  if (!subject) return new Response(JSON.stringify({ error: "No subject" }), { status: 400 });

  const { data: state } = await sb
    .from("user_subject_state")
    .select("path, next_topic")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  const path = state?.path as LearningPath | null;
  if (!path) return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });

  const currentTopic = state?.next_topic || path.starting_topic;
  if (!currentTopic) return new Response(JSON.stringify({ error: "No topic" }), { status: 400 });

  const lesson = await generateLessonForTopic(subject, currentTopic);

  let nextTopic: string | null = null;
  const idx = path.topics.findIndex((t) => t.name === currentTopic);
  if (idx >= 0 && idx + 1 < path.topics.length) {
    nextTopic = path.topics[idx + 1].name;
  }

  await sb
    .from("user_subject_state")
    .update({ next_topic: nextTopic })
    .eq("user_id", user.id)
    .eq("subject", subject);

  return new Response(
    JSON.stringify({ topic: currentTopic, lesson }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}