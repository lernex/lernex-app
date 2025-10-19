import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { LessonSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CACHE_AGE_MS = 7 * 24 * 3600_000;

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const subject = req.nextUrl.searchParams.get("subject");
  const topic = req.nextUrl.searchParams.get("topic");
  const lessonId = req.nextUrl.searchParams.get("lessonId");

  if (!subject || !topic) {
    return new Response(JSON.stringify({ error: "Missing subject or topic" }), { status: 400 });
  }

  const { data: cacheRow, error } = await sb
    .from("user_topic_lesson_cache")
    .select("lessons")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .eq("topic_label", topic)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500 });
  }

  if (!cacheRow || !Array.isArray(cacheRow.lessons)) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const now = Date.now();
  const lessons = cacheRow.lessons as unknown[];

  const pickLesson = () => {
    if (lessonId) {
      return lessons.find((raw) => raw && typeof raw === "object" && (raw as { id?: unknown }).id === lessonId) ?? null;
    }
    return lessons.find((raw) => raw && typeof raw === "object") ?? null;
  };

  const candidate = pickLesson();
  if (!candidate || typeof candidate !== "object") {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const cachedAtValue = (candidate as { cachedAt?: string }).cachedAt;
  if (cachedAtValue) {
    const cachedAt = Date.parse(cachedAtValue);
    if (Number.isFinite(cachedAt) && now - cachedAt > MAX_CACHE_AGE_MS) {
      return new Response(JSON.stringify({ error: "Stale" }), { status: 410 });
    }
  }

  const parsed = LessonSchema.safeParse(candidate);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid cache payload" }), { status: 422 });
  }

  return new Response(
    JSON.stringify({
      lesson: parsed.data,
      topic,
      nextTopicHint: (candidate as { nextTopicHint?: string | null }).nextTopicHint ?? null,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
