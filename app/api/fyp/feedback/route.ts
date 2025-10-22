import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { LessonSchema, type Lesson } from "@/lib/schema";
import { logUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
};

const pushUnique = (list: string[], id: string, max = 200) => {
  const trimmed = id.trim();
  if (!trimmed) return list;
  const next = list.filter((value) => value !== trimmed);
  next.push(trimmed);
  if (next.length > max) next.splice(0, next.length - max);
  return next;
};

const normalizeToneTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const mergeToneTags = (existing: string[], add: string[], remove: string[], max = 12): string[] => {
  const current = [...existing];
  if (remove.length) {
    const removeSet = new Set(remove.map((tag) => tag.trim().toLowerCase()));
    for (let i = current.length - 1; i >= 0; i--) {
      if (removeSet.has(current[i])) current.splice(i, 1);
    }
  }
  for (const raw of add) {
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    const idx = current.indexOf(tag);
    if (idx >= 0) current.splice(idx, 1);
    current.push(tag);
  }
  while (current.length > max) current.shift();
  return current;
};

const classifyLessonTone = (lesson: Lesson): string[] => {
  const tags = new Set<string>();
  const body = `${lesson.title}\n${lesson.content}`.toLowerCase();

  const add = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized) tags.add(normalized);
  };

  const heuristics: { pattern: RegExp; tag: string }[] = [
    { pattern: /\bstep[-\s]?by[-\s]?step\b|\bfirst\b.*\bnext\b/i, tag: "step-by-step" },
    { pattern: /\breal[-\s]?world\b|\beveryday\b|\bpractical\b/i, tag: "real-world" },
    { pattern: /\bimagine\b|\bvisuali[sz]e\b|\bdiagram\b|\bgraph\b/i, tag: "visual" },
    { pattern: /\bstory\b|\bnarrative\b|\bcharacter\b/i, tag: "story-driven" },
    { pattern: /\bchallenge\b|\bproof\b|\brigor/i, tag: "challenge-oriented" },
    { pattern: /\bfun\b|\bexciting\b|\badventure\b|\bplayful\b/i, tag: "playful" },
    { pattern: /\bcoach\b|\bmentor\b|\bguide\b|\bsupport/i, tag: "supportive" },
    { pattern: /\bquick\b|\bfast\b|\bspeed\b|\befficient\b/i, tag: "fast-paced" },
    { pattern: /\bpractice\b|\btry this\b|\bexercise\b/i, tag: "practice-heavy" },
  ];

  for (const h of heuristics) {
    if (h.pattern.test(body)) add(h.tag);
  }

  const exclamations = (lesson.content.match(/!/g) ?? []).length;
  if (exclamations >= 2) add("energetic");

  const sentences = lesson.content.split(/[\.\?!]\s+/);
  if (sentences.filter((s) => s.trim().length > 0 && s.trim().length < 80).length >= 3) {
    add("concise");
  }

  const difficultyTone: Record<Lesson["difficulty"], string> = {
    intro: "gentle",
    easy: "approachable",
    medium: "balanced",
    hard: "rigorous",
  };
  add(difficultyTone[lesson.difficulty]);

  const deduped = Array.from(tags);
  if (!deduped.length) deduped.push("neutral");
  return deduped.slice(0, 6);
};

const findLessonForTone = async (
  sb: ReturnType<typeof supabaseServer>,
  userId: string,
  subject: string,
  lessonId: string
): Promise<Lesson | null> => {
  const { data: cacheRows } = await sb
    .from("user_topic_lesson_cache")
    .select("lessons")
    .eq("user_id", userId)
    .eq("subject", subject);

  if (!Array.isArray(cacheRows)) return null;
  for (const row of cacheRows) {
    const lessons = Array.isArray(row?.lessons) ? (row.lessons as unknown[]) : [];
    for (const raw of lessons) {
      if (!raw || typeof raw !== "object") continue;
      if (typeof (raw as { id?: unknown }).id !== "string") continue;
      if ((raw as { id: string }).id !== lessonId) continue;
      const validated = LessonSchema.safeParse(raw);
      if (validated.success) return validated.data;
    }
  }
  return null;
};

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const payload = await req.json().catch(() => ({} as Record<string, unknown>));
  const subject = typeof (payload as { subject?: unknown }).subject === "string"
    ? (payload as { subject: string }).subject.trim()
    : null;
  const lessonId = typeof (payload as { lesson_id?: unknown }).lesson_id === "string"
    ? (payload as { lesson_id: string }).lesson_id.trim()
    : null;
  const rawAction = typeof (payload as { action?: unknown }).action === "string"
    ? (payload as { action: string }).action.trim().toLowerCase()
    : "";
  const reason = typeof (payload as { reason?: unknown }).reason === "string"
    ? (payload as { reason: string }).reason.trim().slice(0, 300)
    : null;
  if (!subject || !lessonId) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }
  const allowedActions = new Set(["like", "dislike", "save", "skip", "report"]);
  if (!allowedActions.has(rawAction)) {
    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const isPreferenceAction = rawAction === "like" || rawAction === "dislike" || rawAction === "save";

  const { data: state } = await sb
    .from("user_subject_state")
    .select("subject")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  if (!state) {
    return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });
  }

  let liked: string[] = [];
  let disliked: string[] = [];
  let saved: string[] = [];
  let toneTags: string[] = [];

  if (isPreferenceAction) {
    const { data: prefRow } = await sb
      .from("user_subject_preferences")
      .select("liked_ids, disliked_ids, saved_ids, tone_tags")
      .eq("user_id", user.id)
      .eq("subject", subject)
      .maybeSingle();

    liked = normalizeIdList(prefRow?.liked_ids);
    disliked = normalizeIdList(prefRow?.disliked_ids);
    saved = normalizeIdList(prefRow?.saved_ids);
    toneTags = normalizeToneTags(prefRow?.tone_tags);

    if (rawAction === "like") {
      liked = pushUnique(liked, lessonId);
      disliked = disliked.filter((value) => value !== lessonId);
    } else if (rawAction === "dislike") {
      disliked = pushUnique(disliked, lessonId);
      liked = liked.filter((value) => value !== lessonId);
    } else if (rawAction === "save") {
      saved = pushUnique(saved, lessonId);
    }

    try {
      const lesson = await findLessonForTone(sb, user.id, subject, lessonId);
      if (lesson) {
        const tags = classifyLessonTone(lesson);
        if (tags.length) {
          if (rawAction === "dislike") {
            toneTags = mergeToneTags(toneTags, [], tags);
          } else {
            toneTags = mergeToneTags(toneTags, tags, []);
          }
        }
      }
    } catch (toneErr) {
      console.warn("[fyp-feedback] tone classification failed", toneErr);
    }
  }

  if (rawAction === "skip" || rawAction === "report") {
    try {
      await logUsage(
        sb,
        user.id,
        ip,
        rawAction === "skip" ? "lesson-skip" : "lesson-report",
        { input_tokens: null, output_tokens: null },
        {
          metadata: {
            feature: "fyp-feedback",
            subject,
            lessonId,
            action: rawAction,
            ...(reason ? { reason } : {}),
          },
        },
      );
    } catch (telemetryErr) {
      console.warn("[fyp-feedback] feedback logging failed", telemetryErr);
    }
  }

  if (isPreferenceAction) {
    const { error: prefError } = await sb
      .from("user_subject_preferences")
      .upsert({
        user_id: user.id,
        subject,
        liked_ids: liked,
        disliked_ids: disliked,
        saved_ids: saved,
        tone_tags: toneTags,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,subject" });

    if (prefError) {
      console.error("[fyp-feedback] Failed to save preferences", prefError);
      return new Response(JSON.stringify({ error: "Failed to save feedback" }), { status: 500 });
    }
  }

  const { error: stateError } = await sb
    .from("user_subject_state")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  if (stateError) {
    console.error("[fyp-feedback] Failed to update state", stateError);
    return new Response(JSON.stringify({ error: "Failed to update state" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
