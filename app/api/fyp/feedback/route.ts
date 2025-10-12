import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

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

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const { subject, lesson_id, action } = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof subject !== "string" || typeof lesson_id !== "string") {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }
  if (!["like", "dislike", "save"].includes(String(action))) {
    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
  }

  const { data: state } = await sb
    .from("user_subject_state")
    .select("subject")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  if (!state) {
    return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });
  }

  const { data: prefRow } = await sb
    .from("user_subject_preferences")
    .select("liked_ids, disliked_ids, saved_ids")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  let liked = normalizeIdList(prefRow?.liked_ids);
  let disliked = normalizeIdList(prefRow?.disliked_ids);
  let saved = normalizeIdList(prefRow?.saved_ids);

  if (action === "like") {
    liked = pushUnique(liked, lesson_id);
    disliked = disliked.filter((value) => value !== lesson_id);
  } else if (action === "dislike") {
    disliked = pushUnique(disliked, lesson_id);
    liked = liked.filter((value) => value !== lesson_id);
  } else if (action === "save") {
    saved = pushUnique(saved, lesson_id);
  }

  await sb
    .from("user_subject_preferences")
    .upsert({
      user_id: user.id,
      subject,
      liked_ids: liked,
      disliked_ids: disliked,
      saved_ids: saved,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,subject" });

  await sb
    .from("user_subject_state")
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
